import { DiagnosticEvidence } from '../../types/Diagnostics';
import {
  AnalysisReason,
  AnalysisSnapshot,
  CustomProviderConfig,
  DiagnosticAnalysis,
  InferenceError,
  InferenceProvider,
  IntelligenceMode,
} from '../../types/Intelligence';
import { assembleContext, AssembledContext, effectiveBudget, INTELLIGENCE_LIMITS } from './context-assembler';
import { analysisCacheKey, evidenceFingerprint } from './fingerprint';
import { canAnalyzeEvidence } from './evidence-policy';
import { ANALYSIS_JSON_SCHEMA, buildAnalysisMessages, buildRepairMessages, PROMPT_VERSION } from './prompt';
import { validateAnalysis } from './validator';

export type AnalysisProviderFactory = (
  config: {
    mode: IntelligenceMode;
    provider?: CustomProviderConfig;
  },
  signal?: AbortSignal
) => InferenceProvider | Promise<InferenceProvider>;

export type AnalysisManagerOptions = {
  mode: IntelligenceMode;
  provider?: CustomProviderConfig;
  diagnosticsEnabled?: boolean;
  createProvider: AnalysisProviderFactory;
  now?: () => Date;
  limits?: {
    maxQueue?: number;
    maxCacheEntries?: number;
    cacheTtlMs?: number;
    concurrency?: number;
  };
  onSnapshot?: (observerId: string, snapshot: AnalysisSnapshot) => void;
};

type CachedAnalysis = {
  analysis: DiagnosticAnalysis;
  assembly: AnalysisSnapshot['assembly'];
  at: number;
};

type Entry = {
  snapshot: AnalysisSnapshot;
  key?: string;
  fingerprint?: string;
  controller?: AbortController;
  execution?: number;
};

type QueueItem = {
  observerId: string;
  evidence: DiagnosticEvidence;
  key: string;
  fingerprint: string;
  generation: number;
  execution: number;
  force: boolean;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Owns queueing, provider selection, cancellation, validation and a bounded
 * memory cache. It never mutates operational state or evidence.
 */
export class AnalysisManager {
  private mode: IntelligenceMode;
  private providerConfig: CustomProviderConfig;
  private diagnosticsEnabled: boolean;
  private readonly createProvider: AnalysisProviderFactory;
  private readonly now: () => Date;
  private readonly maxQueue: number;
  private readonly maxCacheEntries: number;
  private readonly cacheTtlMs: number;
  private readonly concurrency: number;
  private readonly onSnapshot?: (observerId: string, snapshot: AnalysisSnapshot) => void;

  private entries = new Map<string, Entry>();
  private evidence = new Map<string, DiagnosticEvidence>();
  private cache = new Map<string, CachedAnalysis>();
  private queue: QueueItem[] = [];
  private active = 0;
  private generation = 0;
  private execution = 0;
  private queueFull = new Set<string>();
  private retryingQueueFull = false;
  private lastRetryAt = 0;
  private provider: InferenceProvider | null = null;
  private providerKey = '';
  private stopped = false;
  private idleResolvers: Array<() => void> = [];

  constructor(options: AnalysisManagerOptions) {
    this.mode = options.mode;
    this.providerConfig = { ...(options.provider || {}) };
    this.diagnosticsEnabled = options.diagnosticsEnabled ?? true;
    this.createProvider = options.createProvider;
    this.now = options.now || (() => new Date());
    this.maxQueue = Math.max(1, options.limits?.maxQueue ?? INTELLIGENCE_LIMITS.maxQueue);
    this.maxCacheEntries = Math.max(1, options.limits?.maxCacheEntries ?? INTELLIGENCE_LIMITS.maxCacheEntries);
    this.cacheTtlMs = Math.max(1000, options.limits?.cacheTtlMs ?? INTELLIGENCE_LIMITS.cacheTtlMs);
    this.concurrency = Math.max(1, options.limits?.concurrency ?? 1);
    this.onSnapshot = options.onSnapshot;
  }

  setConfig(mode: IntelligenceMode, provider?: CustomProviderConfig): void {
    const nextKey = JSON.stringify(provider || {});
    if (this.mode === mode && this.providerKey === nextKey) return;
    this.mode = mode;
    this.providerConfig = { ...(provider || {}) };
    this.providerKey = nextKey;
    this.generation += 1;
    this.abortAll();
    this.queue = [];
    this.queueFull.clear();
    this.cache.clear();
    this.disposeProvider();
    if (mode === 'disabled') {
      this.evidence.clear();
      this.entries.clear();
    } else {
      this.entries.clear();
      for (const evidence of this.evidence.values()) this.schedule(evidence);
    }
    this.resolveIdle();
  }

  setDiagnosticsEnabled(value: boolean): void {
    if (this.diagnosticsEnabled === value) return;
    this.diagnosticsEnabled = value;
    this.generation += 1;
    this.abortAll();
    this.queue = [];
    this.queueFull.clear();
    this.entries.clear();
    // Disabling diagnostics must clear every retained sensitive copy, not
    // only the snapshots the UI can still ask for.
    this.cache.clear();
    if (!value) this.evidence.clear();
    this.resolveIdle();
  }

  isEnabled(): boolean {
    return this.mode !== 'disabled' && !this.stopped;
  }

  /** Evidence is copied so a later mutation cannot change an in-flight request. */
  ingest(evidence: DiagnosticEvidence): void {
    if (this.stopped) return;
    if (this.mode === 'disabled') {
      this.setEntry(evidence.observerId, { status: 'disabled' });
      return;
    }
    const copy = clone(evidence);
    if (!this.fresh(copy)) {
      this.invalidateObserver(copy.observerId);
      this.evidence.delete(copy.observerId);
      this.setEntry(copy.observerId, { status: 'waiting_for_evidence', reason: 'no_evidence' });
      return;
    }
    const previous = this.evidence.get(copy.observerId);
    if (previous && previous.failureId !== copy.failureId) {
      // A new failure immediately invalidates the previous failure's analysis.
      this.invalidateObserver(copy.observerId);
    }
    this.evidence.set(copy.observerId, copy);
    this.schedule(copy);
  }

  clear(observerId: string): void {
    this.invalidateObserver(observerId);
    this.evidence.delete(observerId);
    this.queueFull.delete(observerId);
    this.resolveIdle();
  }

  private invalidateObserver(observerId: string): void {
    const entry = this.entries.get(observerId);
    entry?.controller?.abort();
    this.entries.delete(observerId);
    this.queue = this.queue.filter((item) => item.observerId !== observerId);
    for (const [key, cached] of this.cache) {
      if (cached.analysis.observerId === observerId) this.cache.delete(key);
    }
  }

  /**
   * Re-attempt analyses blocked by a resolved first-run condition (missing
   * model, runtime stopped, provider unavailable) without asking the user to
   * recollect unchanged evidence. Rate-limited so status polling cannot loop.
   */
  retryBlocked(force = false): void {
    if (this.stopped || this.mode === 'disabled' || !this.diagnosticsEnabled) return;
    const now = this.now().getTime();
    if (!force && now - this.lastRetryAt < 30_000) return;
    // Only local first-run blockers are retried automatically. A remote
    // timeout, auth failure or rate limit must not re-send evidence forever.
    const retryable = new Set<AnalysisReason>([
      'model_missing',
      'runtime_missing',
      'runtime_failed',
      'consent_required',
    ]);
    let scheduled = false;
    for (const [observerId, entry] of this.entries) {
      if (entry.snapshot.status !== 'failed' && entry.snapshot.status !== 'runtime_unavailable') continue;
      if (!entry.snapshot.reason || !retryable.has(entry.snapshot.reason)) continue;
      const evidence = this.evidence.get(observerId);
      if (evidence && this.fresh(evidence)) {
        this.schedule(evidence, true);
        scheduled = true;
      }
    }
    if (scheduled) this.lastRetryAt = now;
  }

  /** TTL enforcement independent of whether the UI reads a snapshot. */
  prune(): void {
    const now = this.now().getTime();
    for (const [observerId, evidence] of Array.from(this.evidence.entries())) {
      if (!this.fresh(evidence)) {
        this.clear(observerId);
      }
    }
    for (const [observerId, entry] of Array.from(this.entries.entries())) {
      const generatedAt = entry.snapshot.analysis?.generatedAt;
      if (generatedAt && now - Date.parse(generatedAt) > this.cacheTtlMs) {
        entry.controller?.abort();
        this.entries.delete(observerId);
        if (entry.key) this.cache.delete(entry.key);
        continue;
      }
      if (
        entry.fingerprint &&
        (entry.snapshot.status === 'queued' ||
          entry.snapshot.status === 'analyzing' ||
          entry.snapshot.status === 'available')
      ) {
        const evidence = this.evidence.get(observerId);
        if (!evidence || evidenceFingerprint(evidence) !== entry.fingerprint) {
          entry.controller?.abort();
          this.entries.delete(observerId);
          if (entry.key) this.cache.delete(entry.key);
        }
      }
    }
    for (const [key, cached] of Array.from(this.cache.entries())) {
      if (now - cached.at > this.cacheTtlMs) this.cache.delete(key);
    }
    this.resolveIdle();
  }

  /** Recreate the provider after credential changes without changing mode. */
  refreshProvider(): void {
    this.generation += 1;
    this.abortAll();
    this.queue = [];
    this.queueFull.clear();
    this.entries.clear();
    this.cache.clear();
    this.disposeProvider();
    for (const evidence of this.evidence.values()) this.schedule(evidence);
    this.resolveIdle();
  }

  clearAll(): void {
    this.abortAll();
    this.evidence.clear();
    this.entries.clear();
    this.queue = [];
    this.queueFull.clear();
    this.cache.clear();
    this.resolveIdle();
  }

  getSnapshot(observerId: string): AnalysisSnapshot {
    if (this.stopped || this.mode === 'disabled') return { status: 'disabled' };
    if (!this.diagnosticsEnabled) return { status: 'waiting_for_evidence', reason: 'diagnostics_disabled' };
    const evidence = this.evidence.get(observerId);
    if (evidence && !this.fresh(evidence)) {
      this.clear(observerId);
    }
    const entry = this.entries.get(observerId);
    if (entry) {
      const generatedAt = entry.snapshot.analysis?.generatedAt;
      if (generatedAt && this.now().getTime() - Date.parse(generatedAt) > this.cacheTtlMs) {
        entry.controller?.abort();
        this.entries.delete(observerId);
        if (entry.key) this.cache.delete(entry.key);
        return { status: 'waiting_for_evidence' };
      }
      if (!evidence) {
        if (
          entry.snapshot.status === 'waiting_for_evidence' ||
          entry.snapshot.status === 'insufficient_evidence' ||
          entry.snapshot.status === 'disabled'
        ) {
          return clone(entry.snapshot);
        }
        entry.controller?.abort();
        this.entries.delete(observerId);
        if (entry.key) this.cache.delete(entry.key);
        return { status: 'waiting_for_evidence' };
      }
      // Never show an analysis against a different evidence revision or
      // failure than the one currently owned for this observer.
      if (entry.fingerprint && evidenceFingerprint(evidence) !== entry.fingerprint) {
        entry.controller?.abort();
        this.entries.delete(observerId);
        if (entry.key) this.cache.delete(entry.key);
        return { status: 'waiting_for_evidence' };
      }
      return clone(entry.snapshot);
    }
    return { status: 'waiting_for_evidence' };
  }

  reanalyze(observerId: string): void {
    if (this.stopped || this.mode === 'disabled') return;
    const evidence = this.evidence.get(observerId);
    if (!evidence) {
      this.setEntry(observerId, { status: 'waiting_for_evidence', reason: 'no_evidence' });
      return;
    }
    const entry = this.entries.get(observerId);
    entry?.controller?.abort();
    this.entries.delete(observerId);
    this.queue = this.queue.filter((item) => item.observerId !== observerId);
    this.schedule(evidence, true);
  }

  waitForIdle(): Promise<void> {
    if (this.active === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  shutdown(): void {
    this.stopped = true;
    this.mode = 'disabled';
    this.generation += 1;
    this.abortAll();
    this.queue = [];
    this.queueFull.clear();
    this.entries.clear();
    this.evidence.clear();
    this.cache.clear();
    this.disposeProvider();
    this.resolveIdle();
  }

  private schedule(evidence: DiagnosticEvidence, force = false): void {
    if (this.mode === 'disabled' || this.stopped) return;
    if (!this.fresh(evidence)) {
      this.evidence.delete(evidence.observerId);
      this.setEntry(evidence.observerId, { status: 'waiting_for_evidence', reason: 'no_evidence' });
      return;
    }
    if (!this.diagnosticsEnabled) {
      this.setEntry(evidence.observerId, { status: 'waiting_for_evidence', reason: 'diagnostics_disabled' });
      return;
    }
    const fingerprint = evidenceFingerprint(evidence);
    const identity = this.identity(evidence, fingerprint);
    const key = analysisCacheKey(identity);

    if (!canAnalyzeEvidence(evidence)) {
      this.setEntry(
        evidence.observerId,
        { status: 'insufficient_evidence', reason: 'evidence_unavailable' },
        key,
        fingerprint
      );
      return;
    }

    if (!force) {
      const cached = this.cache.get(key);
      if (cached && this.now().getTime() - cached.at <= this.cacheTtlMs) {
        this.entries.get(evidence.observerId)?.controller?.abort();
        this.setEntry(
          evidence.observerId,
          {
            status: 'available',
            analysis: clone(cached.analysis),
            assembly: cached.assembly ? clone(cached.assembly) : undefined,
            provider: cached.analysis.model.provider,
            model: cached.analysis.model.name,
            updatedAt: cached.analysis.generatedAt,
          },
          key,
          fingerprint
        );
        return;
      }
      if (cached) this.cache.delete(key);
    }

    const current = this.entries.get(evidence.observerId);
    if (
      !force &&
      current?.key === key &&
      (current.snapshot.status === 'queued' || current.snapshot.status === 'analyzing')
    ) {
      return;
    }
    const pending = this.queue.find((item) => item.observerId === evidence.observerId);
    if (pending) {
      if (pending.key === key) return;
      pending.evidence = evidence;
      pending.key = key;
      pending.fingerprint = fingerprint;
      pending.generation = this.generation;
      pending.execution = ++this.execution;
      pending.force = force;
      this.setEntry(evidence.observerId, { status: 'queued' }, key, fingerprint, pending.execution);
      return;
    }

    if (this.queue.length >= this.maxQueue) {
      this.queueFull.add(evidence.observerId);
      this.setEntry(evidence.observerId, { status: 'failed', reason: 'queue_full' }, key, fingerprint);
      return;
    }

    current?.controller?.abort();
    const execution = ++this.execution;
    this.queueFull.delete(evidence.observerId);
    this.queue.push({
      observerId: evidence.observerId,
      evidence,
      key,
      fingerprint,
      generation: this.generation,
      execution,
      force,
    });
    this.setEntry(evidence.observerId, { status: 'queued' }, key, fingerprint, execution);
    this.pump();
  }

  private fresh(evidence: DiagnosticEvidence): boolean {
    const collected = Date.parse(evidence.collectedAt);
    return !Number.isFinite(collected) || this.now().getTime() - collected <= this.cacheTtlMs;
  }

  private budget() {
    return effectiveBudget(this.providerConfig.contextWindow, this.providerConfig.maxOutputTokens);
  }

  private identity(evidence: DiagnosticEvidence, fingerprint: string) {
    const managed = this.mode === 'managed';
    const budget = this.budget();
    return {
      observerId: evidence.observerId,
      failureId: evidence.failureId,
      evidenceFingerprint: fingerprint,
      provider: managed ? 'managed' : 'openai-compatible',
      model: managed ? 'barklarm-managed-default' : String(this.providerConfig.model || ''),
      promptVersion: PROMPT_VERSION,
      contextWindow: budget.contextWindow,
      maxOutputTokens: budget.maxOutputTokens,
      temperature: 0.2,
    };
  }

  private pump(): void {
    while (!this.stopped && this.active < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift() as QueueItem;
      const entry = this.entries.get(item.observerId);
      if (
        !entry ||
        entry.key !== item.key ||
        entry.execution !== item.execution ||
        item.generation !== this.generation
      ) {
        continue;
      }
      const controller = new AbortController();
      entry.controller = controller;
      entry.snapshot = { status: 'analyzing' };
      this.notify(item.observerId, entry.snapshot);
      this.active += 1;
      void this.run(item, controller)
        .catch(() => {
          if (this.isCurrent(item, controller)) {
            this.setEntry(item.observerId, { status: 'failed', reason: 'invalid_response' });
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

  private async run(item: QueueItem, controller: AbortController): Promise<void> {
    let assembly: AssembledContext | undefined;
    try {
      const provider = await this.getProvider(item.generation, controller.signal);
      if (!provider) throw new InferenceError('configuration', 'provider_missing');
      if (!this.isCurrent(item, controller)) return;
      await provider.initialize(controller.signal);
      if (!this.isCurrent(item, controller)) return;

      const budget = this.budget();
      const maxOutputTokens = budget.maxOutputTokens;
      let inputBudget = budget.contextWindow;
      assembly = assembleContext(item.evidence, {
        contextWindow: inputBudget,
        maxOutputTokens,
        promptVersion: PROMPT_VERSION,
      });
      if (assembly.payload.items.length === 0) {
        this.setEntry(item.observerId, { status: 'insufficient_evidence', reason: 'evidence_unavailable' });
        return;
      }

      // Use the real tokenizer when the provider exposes one; otherwise the
      // conservative character estimate above is the documented fallback.
      if (provider.tokenize) {
        const inputLimit = budget.contextWindow - maxOutputTokens - budget.safetyTokens;
        try {
          let tokenBudgetOk = false;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const promptText = buildAnalysisMessages(assembly)
              .map((message) => message.content)
              .join('\n');
            const tokens = await provider.tokenize(promptText, controller.signal);
            if (tokens <= inputLimit) {
              tokenBudgetOk = true;
              break;
            }
            const overflow = tokens - inputLimit;
            const reduced = Math.max(
              INTELLIGENCE_LIMITS.minContextWindow,
              inputBudget - overflow - INTELLIGENCE_LIMITS.safetyTokens
            );
            if (reduced >= inputBudget) throw new InferenceError('too_large');
            inputBudget = reduced;
            assembly = assembleContext(item.evidence, {
              contextWindow: inputBudget,
              maxOutputTokens,
              promptVersion: PROMPT_VERSION,
            });
            if (assembly.payload.items.length === 0) {
              this.setEntry(item.observerId, { status: 'insufficient_evidence', reason: 'evidence_unavailable' });
              return;
            }
          }
          if (!tokenBudgetOk) throw new InferenceError('too_large');
        } catch (error) {
          if (error instanceof InferenceError && (error.code === 'cancelled' || error.code === 'too_large')) {
            throw error;
          }
          // Tokenizer support is optional; the conservative estimate remains valid.
        }
      }

      if (!this.isCurrent(item, controller)) return;
      const messages = buildAnalysisMessages(assembly);
      let result = await provider.infer(
        {
          messages,
          responseSchema: ANALYSIS_JSON_SCHEMA,
          maxOutputTokens,
          temperature: 0.2,
          timeoutMs: Number(this.providerConfig.timeoutMs) || INTELLIGENCE_LIMITS.defaultTimeoutMs,
        },
        controller.signal
      );
      if (!this.isCurrent(item, controller)) return;

      const validationInput = {
        observerId: item.evidence.observerId,
        failureId: item.evidence.failureId,
        evidenceFingerprint: item.fingerprint,
        promptVersion: PROMPT_VERSION,
        model: {
          provider: provider.kind,
          name: provider.model || this.providerConfig.model || provider.name,
          ...(result.model && result.model !== provider.model ? { version: result.model } : {}),
        },
        includedEvidenceIds: assembly.assembly.includedEvidenceIds,
        now: this.now,
      };
      const firstValidation = validateAnalysis(result.text, validationInput);
      let analysis: DiagnosticAnalysis | undefined = firstValidation.ok ? firstValidation.analysis : undefined;

      if (firstValidation.ok === false) {
        if (!this.isCurrent(item, controller)) return;
        result = await provider.infer(
          {
            messages: buildRepairMessages(messages, firstValidation.errors),
            responseSchema: ANALYSIS_JSON_SCHEMA,
            maxOutputTokens,
            temperature: 0.1,
            timeoutMs: Number(this.providerConfig.timeoutMs) || INTELLIGENCE_LIMITS.defaultTimeoutMs,
          },
          controller.signal
        );
        if (!this.isCurrent(item, controller)) return;
        const secondValidation = validateAnalysis(result.text, {
          ...validationInput,
          model: {
            provider: provider.kind,
            name: provider.model || this.providerConfig.model || provider.name,
            ...(result.model && result.model !== provider.model ? { version: result.model } : {}),
          },
        });
        if (secondValidation.ok === false) {
          const reason: AnalysisReason = secondValidation.errors.includes('sensitive_output')
            ? 'sensitive_output'
            : secondValidation.errors.includes('unsafe_output')
              ? 'unsafe_output'
              : 'invalid_response';
          this.setEntry(item.observerId, { status: 'failed', reason });
          return;
        }
        analysis = secondValidation.analysis;
      }

      if (!analysis) {
        this.setEntry(item.observerId, { status: 'failed', reason: 'invalid_response' });
        return;
      }

      if (!this.isCurrent(item, controller)) return;
      this.cache.set(item.key, {
        analysis,
        assembly: assembly.assembly,
        at: this.now().getTime(),
      });
      this.evictCache();
      this.setEntry(item.observerId, {
        status: 'available',
        analysis,
        assembly: assembly.assembly,
        provider: analysis.model.provider,
        model: analysis.model.name,
        updatedAt: analysis.generatedAt,
      });
    } catch (error) {
      if (!this.isCurrent(item, controller)) return;
      if (error instanceof InferenceError) {
        this.setEntry(item.observerId, this.failureFor(error));
      } else {
        this.setEntry(item.observerId, { status: 'failed', reason: 'invalid_response' });
      }
    }
  }

  private failureFor(error: InferenceError): AnalysisSnapshot {
    if (error.analysisReason) {
      return { status: 'runtime_unavailable', reason: error.analysisReason };
    }
    switch (error.code) {
      case 'cancelled':
        return { status: 'failed', reason: 'cancelled' };
      case 'consent_required':
        return { status: 'runtime_unavailable', reason: 'consent_required' };
      case 'timeout':
        return { status: 'runtime_unavailable', reason: 'timeout' };
      case 'unavailable':
        return { status: 'runtime_unavailable', reason: 'provider_unavailable' };
      case 'unauthorized':
      case 'rate_limited':
        return { status: 'runtime_unavailable', reason: 'provider_unavailable' };
      case 'configuration':
      case 'unsupported':
        return { status: 'failed', reason: 'configuration_invalid' };
      case 'too_large':
      case 'redirect_rejected':
      case 'invalid_response':
        return { status: 'failed', reason: 'invalid_response' };
      default:
        return { status: 'failed', reason: 'invalid_response' };
    }
  }

  private async getProvider(generation: number, signal?: AbortSignal): Promise<InferenceProvider> {
    if (this.provider) return this.provider;
    const provider = await this.createProvider({ mode: this.mode, provider: { ...this.providerConfig } }, signal);
    if (this.stopped || generation !== this.generation) {
      await provider.dispose();
      throw new InferenceError('cancelled');
    }
    this.provider = provider;
    return provider;
  }

  private disposeProvider(): void {
    const provider = this.provider;
    this.provider = null;
    if (provider) void Promise.resolve(provider.dispose()).catch(() => undefined);
  }

  private isCurrent(item: QueueItem, controller: AbortController): boolean {
    if (this.stopped || controller.signal.aborted || item.generation !== this.generation) return false;
    const entry = this.entries.get(item.observerId);
    if (!entry || entry.key !== item.key || entry.execution !== item.execution) return false;
    return this.mode !== 'disabled';
  }

  private setEntry(
    observerId: string,
    snapshot: AnalysisSnapshot,
    key?: string,
    fingerprint?: string,
    execution?: number
  ): void {
    const previous = this.entries.get(observerId);
    const entry: Entry = {
      snapshot: clone(snapshot),
      key: key ?? previous?.key,
      fingerprint: fingerprint ?? previous?.fingerprint,
      controller: previous?.controller,
      execution: execution ?? previous?.execution,
    };
    this.entries.set(observerId, entry);
    this.notify(observerId, entry.snapshot);
  }

  private notify(observerId: string, snapshot: AnalysisSnapshot): void {
    if (!this.onSnapshot) return;
    try {
      this.onSnapshot(observerId, clone(snapshot));
    } catch {
      // A presentation callback must never break analysis.
    }
  }

  private evictCache(): void {
    while (this.cache.size > this.maxCacheEntries) {
      let oldestKey: string | null = null;
      let oldest = Number.POSITIVE_INFINITY;
      for (const [key, cached] of this.cache) {
        if (cached.at < oldest) {
          oldest = cached.at;
          oldestKey = key;
        }
      }
      if (!oldestKey) return;
      this.cache.delete(oldestKey);
    }
  }

  private abortAll(): void {
    for (const entry of this.entries.values()) entry.controller?.abort();
  }

  private resolveIdle(): void {
    if (this.active > 0 || this.queue.length > 0) return;
    if (!this.retryingQueueFull && this.queueFull.size > 0) {
      this.retryingQueueFull = true;
      try {
        const ids = Array.from(this.queueFull);
        this.queueFull.clear();
        for (const observerId of ids) {
          const evidence = this.evidence.get(observerId);
          if (evidence) this.schedule(evidence);
        }
      } finally {
        this.retryingQueueFull = false;
      }
      if (this.active > 0 || this.queue.length > 0) return;
    }
    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }
}
