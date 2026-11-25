import {
  DiagnosticEvidence,
  DiagnosticLimits,
  DiagnosticProvider,
  DiagnosticSnapshot,
  DiagnosticStatus,
  EvidenceDraft,
  FailureReference,
} from '../../types/Diagnostics';
import { ObserverConfiguration } from '../../types/ObserverConfiguration';
import { State } from '../../types/State';
import { Status } from '../../types/Status';
import { DIAGNOSTIC_LIMITS } from './limits';
import { normalizeEvidence } from './normalize';
import { collectKnownSecrets } from './sanitize';

export type DiagnosticObserverSource = {
  id: string;
  config: ObserverConfiguration;
  provider?: DiagnosticProvider;
  scope?: string;
};

type CachedEvidence = {
  key: string;
  evidence: DiagnosticEvidence;
  collectedAt: number;
};

type PendingCollection = {
  key: string;
  controller: AbortController;
  status: 'queued' | 'collecting';
};

type QueueItem = {
  source: DiagnosticObserverSource;
  key: string;
  failure: FailureReference;
};

export type EvidenceManagerOptions = {
  enabled?: boolean;
  limits?: DiagnosticLimits;
  now?: () => Date;
};

function cloneEvidence(evidence: DiagnosticEvidence): DiagnosticEvidence {
  return JSON.parse(JSON.stringify(evidence)) as DiagnosticEvidence;
}

function statusFor(evidence: DiagnosticEvidence): DiagnosticStatus {
  if (evidence.completeness === 'complete') return 'available';
  if (evidence.completeness === 'partial') return 'partial';
  return 'unavailable';
}

/**
 * Owns scheduling, deduplication, cancellation, cache and lifecycle. It never
 * changes operational state, notifications or outbound payloads.
 */
export class EvidenceManager {
  private sources = new Map<string, DiagnosticObserverSource>();
  private cache = new Map<string, CachedEvidence>();
  private failed = new Map<string, string>();
  private pending = new Map<string, PendingCollection>();
  private queue: QueueItem[] = [];
  private lastStates: State[] = [];
  private lastFailures = new Map<string, State>();
  private idleResolvers: Array<() => void> = [];
  private active = 0;
  private enabled: boolean;
  private stopped = false;
  private readonly limits: DiagnosticLimits;
  private readonly now: () => Date;

  constructor(options: EvidenceManagerOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.limits = options.limits ?? DIAGNOSTIC_LIMITS;
    this.now = options.now ?? (() => new Date());
  }

  isEnabled(): boolean {
    return this.enabled && !this.stopped;
  }

  setEnabled(value: boolean): void {
    if (this.stopped || this.enabled === value) return;
    this.enabled = value;
    if (value) {
      this.observe(this.lastStates);
      return;
    }
    this.reset();
  }

  setObservers(sources: DiagnosticObserverSource[]): void {
    if (this.stopped) return;
    const next = new Map<string, DiagnosticObserverSource>();
    for (const source of sources) {
      if (source.id) next.set(source.id, source);
    }
    for (const [id, current] of this.sources) {
      const replacement = next.get(id);
      if (!replacement || this.scopeOf(replacement) !== this.scopeOf(current)) {
        this.clearObserver(id);
      }
    }
    for (const id of Array.from(this.cache.keys())) {
      if (!next.has(id)) this.cache.delete(id);
    }
    this.sources = next;
  }

  /**
   * Called after every refresh that publishes states. Collection is scheduled,
   * never awaited, so a slow source cannot delay polling or notifications.
   */
  observe(states: State[]): void {
    if (this.stopped) return;
    this.lastStates = states.map((state) => ({
      ...state,
      ...(state.error ? { error: { ...state.error } } : {}),
    }));

    const current = new Map<string, State>();
    for (const state of states) {
      if (!state.id) continue;
      if (state.status === Status.FAILURE && state.error?.id) {
        current.set(state.id, state);
        this.lastFailures.set(state.id, state);
      } else {
        this.clearObserver(state.id);
      }
    }
    for (const id of Array.from(this.lastFailures.keys())) {
      if (!current.has(id)) this.clearObserver(id);
    }

    if (!this.enabled) return;
    for (const [id, state] of current) {
      const source = this.sources.get(id);
      if (source?.provider) this.schedule(source, state);
    }
  }

  getSnapshot(observerId: string): DiagnosticSnapshot {
    if (!this.enabled || this.stopped) return { status: 'disabled' };
    const source = this.sources.get(observerId);
    if (!source?.provider) return { status: 'unsupported' };

    const failure = this.lastFailures.get(observerId);
    if (!failure?.error?.id) return { status: 'not_collected' };
    const key = this.key(source, failure.error.id);

    const pending = this.pending.get(observerId);
    if (pending && pending.key === key) return { status: pending.status };

    const cached = this.cache.get(observerId);
    if (cached) {
      if (cached.key === key && !this.expired(cached)) {
        return { status: statusFor(cached.evidence), evidence: cloneEvidence(cached.evidence) };
      }
      this.cache.delete(observerId);
    }
    if (this.failed.get(observerId) === key) return { status: 'failed' };
    return { status: 'not_collected' };
  }

  recollect(observerId: string): void {
    if (!this.enabled || this.stopped) return;
    const source = this.sources.get(observerId);
    const failure = this.lastFailures.get(observerId);
    if (!source?.provider || !failure?.error?.id) return;
    const key = this.key(source, failure.error.id);
    this.abort(observerId);
    this.cache.delete(observerId);
    this.failed.delete(observerId);
    this.enqueue({
      source,
      key,
      failure: {
        observerId,
        sourceType: source.config.type,
        failureId: failure.error.id,
        link: failure.link || '',
      },
    });
  }

  waitForIdle(): Promise<void> {
    if (this.active === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  shutdown(): void {
    this.stopped = true;
    this.enabled = false;
    for (const id of Array.from(this.pending.keys())) this.abort(id);
    this.queue = [];
    this.cache.clear();
    this.failed.clear();
    this.lastFailures.clear();
    this.lastStates = [];
    this.sources.clear();
    this.resolveIdle();
  }

  private scopeOf(source: DiagnosticObserverSource): string {
    return source.scope || `${source.config.type}:${source.config.id || ''}`;
  }

  private key(source: DiagnosticObserverSource, failureId: string): string {
    return `${source.id}|${this.scopeOf(source)}|${failureId}`;
  }

  private expired(cached: CachedEvidence): boolean {
    return this.now().getTime() - cached.collectedAt > this.limits.cacheTtlMs;
  }

  private schedule(source: DiagnosticObserverSource, state: State): void {
    const failureId = state.error?.id;
    if (!failureId) return;
    const key = this.key(source, failureId);

    const cached = this.cache.get(source.id);
    if (cached) {
      if (cached.key === key && !this.expired(cached)) return;
      this.cache.delete(source.id);
    }
    if (this.failed.get(source.id) === key) return;

    const pending = this.pending.get(source.id);
    if (pending?.key === key) return;
    if (pending) this.abort(source.id);

    this.enqueue({
      source,
      key,
      failure: {
        observerId: source.id,
        sourceType: source.config.type,
        failureId,
        link: state.link || '',
      },
    });
  }

  private enqueue(item: QueueItem): void {
    const controller = new AbortController();
    this.pending.set(item.source.id, { key: item.key, controller, status: 'queued' });
    this.queue.push(item);
    this.pump();
  }

  private pump(): void {
    while (this.enabled && !this.stopped && this.active < this.limits.concurrency && this.queue.length > 0) {
      const item = this.queue.shift() as QueueItem;
      const pending = this.pending.get(item.source.id);
      if (!pending || pending.key !== item.key) continue;
      pending.status = 'collecting';
      this.active += 1;
      void this.run(item, pending)
        .catch(() => {
          if (
            this.enabled &&
            !this.stopped &&
            this.lastFailures.get(item.source.id)?.error?.id === item.failure.failureId
          ) {
            this.failed.set(item.source.id, item.key);
          }
        })
        .finally(() => {
          this.active -= 1;
          this.pump();
          this.resolveIdle();
        });
    }
    this.resolveIdle();
  }

  private async run(item: QueueItem, pending: PendingCollection): Promise<void> {
    const source = item.source;
    const provider = source.provider;
    if (!provider) return;
    const timeout = setTimeout(() => pending.controller.abort(), this.limits.collectionTimeoutMs);
    try {
      let draft: EvidenceDraft | undefined;
      for (let attempt = 0; attempt <= this.limits.retryCount; attempt += 1) {
        if (!this.isCurrent(item, pending)) return;
        try {
          draft = await this.untilAborted(
            provider.collectEvidence(item.failure, {
              signal: pending.controller.signal,
              limits: this.limits,
            }),
            pending.controller.signal
          );
          break;
        } catch {
          if (pending.controller.signal.aborted || attempt >= this.limits.retryCount) break;
        }
      }
      if (!draft) {
        // Keep the failure marker so a broken source is not retried on every
        // refresh. A new failure or an explicit recollection clears it.
        if (this.enabled && !this.stopped && this.lastFailures.get(source.id)?.error?.id === item.failure.failureId) {
          this.failed.set(source.id, item.key);
        }
        return;
      }
      if (!this.isCurrent(item, pending)) return;
      const evidence = normalizeEvidence(draft, {
        observerId: source.id,
        failureId: item.failure.failureId,
        sourceType: source.config.type,
        now: this.now,
        limits: this.limits,
        knownSecrets: collectKnownSecrets(source.config),
      });
      if (!this.isCurrent(item, pending)) return;
      this.cache.set(source.id, { key: item.key, evidence, collectedAt: this.now().getTime() });
      this.failed.delete(source.id);
      this.evict();
    } finally {
      clearTimeout(timeout);
      if (this.pending.get(source.id) === pending) this.pending.delete(source.id);
    }
  }

  private isCurrent(item: QueueItem, pending: PendingCollection): boolean {
    if (!this.enabled || this.stopped || pending.controller.signal.aborted) return false;
    if (this.pending.get(item.source.id) !== pending) return false;
    if (this.lastFailures.get(item.source.id)?.error?.id !== item.failure.failureId) return false;
    const source = this.sources.get(item.source.id);
    return !!source && this.key(source, item.failure.failureId) === item.key;
  }

  private untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(new Error('aborted'));
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new Error('aborted'));
      signal.addEventListener('abort', onAbort);
      promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        }
      );
    });
  }

  private evict(): void {
    while (this.cache.size > this.limits.cacheMaxEntries) {
      let oldestId: string | null = null;
      let oldest = Number.POSITIVE_INFINITY;
      for (const [id, cached] of this.cache) {
        if (cached.collectedAt < oldest) {
          oldest = cached.collectedAt;
          oldestId = id;
        }
      }
      if (!oldestId) return;
      this.cache.delete(oldestId);
    }
  }

  private abort(observerId: string): void {
    const pending = this.pending.get(observerId);
    if (pending) {
      pending.controller.abort();
      this.pending.delete(observerId);
    }
    this.queue = this.queue.filter((item) => item.source.id !== observerId);
  }

  private clearObserver(observerId: string): void {
    this.abort(observerId);
    this.cache.delete(observerId);
    this.failed.delete(observerId);
    this.lastFailures.delete(observerId);
  }

  private reset(): void {
    for (const id of Array.from(this.pending.keys())) this.abort(id);
    this.queue = [];
    this.cache.clear();
    this.failed.clear();
    this.lastFailures.clear();
    this.resolveIdle();
  }

  private resolveIdle(): void {
    if (this.active > 0 || this.queue.length > 0) return;
    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }
}
