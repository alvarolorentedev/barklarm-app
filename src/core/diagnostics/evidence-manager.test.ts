import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticLimits, DiagnosticProvider, EvidenceDraft } from '../../types/Diagnostics';
import { State } from '../../types/State';
import { Status } from '../../types/Status';
import { DIAGNOSTIC_LIMITS } from './limits';
import { DiagnosticObserverSource, EvidenceManager } from './evidence-manager';

const limits: DiagnosticLimits = {
  ...DIAGNOSTIC_LIMITS,
  collectionTimeoutMs: 1000,
  cacheTtlMs: 1000,
  cacheMaxEntries: 2,
  concurrency: 2,
  retryCount: 1,
};

const draft = (summary = 'ok', completeness: EvidenceDraft['completeness'] = 'complete'): EvidenceDraft => ({
  completeness,
  summary,
  items: [{ id: 'execution', category: 'execution', title: 'Execution', content: summary }],
  limitations: [],
});

const source = (
  id: string,
  provider: DiagnosticProvider,
  scope = 'github.com/acme/api/ci.yml'
): DiagnosticObserverSource => ({
  id,
  config: { id, type: 'githubAction', alias: id },
  provider,
  scope,
});

const failure = (id: string, failureId: string, link = 'https://example.test/run'): State => ({
  id,
  name: id,
  status: Status.FAILURE,
  link,
  error: { id: failureId, description: 'failed' },
});

const success = (id: string): State => ({ id, name: id, status: Status.SUCCESS, link: '' });

function providerFor(implementation: DiagnosticProvider['collectEvidence']): DiagnosticProvider {
  return { sourceType: 'githubAction', collectEvidence: vi.fn(implementation) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('EvidenceManager', () => {
  it('collects once and exposes sanitized available evidence', async () => {
    const provider = providerFor(async () => draft('first'));
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);

    manager.observe([failure('a', '1:1')]);
    expect(manager.getSnapshot('a').status).toBe('collecting');
    await manager.waitForIdle();

    expect(manager.getSnapshot('a')).toMatchObject({
      status: 'available',
      evidence: {
        observerId: 'a',
        failureId: '1:1',
        sourceType: 'githubAction',
        completeness: 'complete',
        summary: 'first',
      },
    });
    expect(provider.collectEvidence).toHaveBeenCalledTimes(1);
  });

  it('emits available, cleared and reset events for intelligence consumers', async () => {
    const events: any[] = [];
    const provider = providerFor(async () => draft('eventful'));
    const manager = new EvidenceManager({ enabled: true, limits, onEvent: (event) => events.push(event) });
    manager.setObservers([source('a', provider)]);

    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();
    expect(events.some((event) => event.type === 'available' && event.evidence.summary === 'eventful')).toBe(true);
    expect(manager.getAvailableEvidence().map((item) => item.observerId)).toEqual(['a']);

    manager.observe([success('a')]);
    expect(events.some((event) => event.type === 'cleared' && event.observerId === 'a')).toBe(true);

    manager.setEnabled(false);
    expect(events.some((event) => event.type === 'reset')).toBe(true);
    manager.shutdown();
  });

  it('does not collect twice for repeated polling or concurrent observers', async () => {
    const provider = providerFor(async () => draft());
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);

    manager.observe([failure('a', '1:1')]);
    manager.observe([failure('a', '1:1')]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();

    expect(provider.collectEvidence).toHaveBeenCalledTimes(1);
  });

  it('collects a new failure while the observer remains red', async () => {
    const provider = providerFor(async (failureRef) => draft(failureRef.failureId));
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);

    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();
    manager.observe([failure('a', '1:2')]);
    await manager.waitForIdle();

    expect(provider.collectEvidence).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot('a').evidence?.failureId).toBe('1:2');
  });

  it('discards a result for a failure that resolved during collection', async () => {
    const stale = deferred<EvidenceDraft>();
    const fresh = deferred<EvidenceDraft>();
    const provider = providerFor(
      vi
        .fn()
        .mockImplementationOnce(() => stale.promise)
        .mockImplementationOnce(() => fresh.promise)
    );
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);

    manager.observe([failure('a', '1:1')]);
    manager.observe([success('a')]);
    stale.resolve(draft('stale'));
    await manager.waitForIdle();
    expect(manager.getSnapshot('a')).toEqual({ status: 'not_collected' });

    // A new observation must start a fresh collection; the discarded draft must
    // not satisfy it from a hidden cache.
    manager.observe([failure('a', '1:1')]);
    fresh.resolve(draft('fresh'));
    await manager.waitForIdle();

    expect(provider.collectEvidence).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot('a').evidence?.summary).toBe('fresh');
  });

  it('keeps evidence while a source is temporarily unavailable or checking', async () => {
    const provider = providerFor(async () => draft());
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();

    manager.observe([{ id: 'a', name: 'a', status: Status.NA, link: '' }]);
    expect(manager.getSnapshot('a').status).toBe('available');

    manager.observe([{ id: 'a', name: 'a', status: Status.CHECKING, link: '' }]);
    expect(manager.getSnapshot('a').status).toBe('available');

    manager.observe([success('a')]);
    expect(manager.getSnapshot('a')).toEqual({ status: 'not_collected' });
    expect(provider.collectEvidence).toHaveBeenCalledTimes(1);
  });

  it('discards a result after the diagnostic scope changes', async () => {
    const gate = deferred<EvidenceDraft>();
    const provider = providerFor(() => gate.promise);
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider, 'github.com/acme/api/ci.yml')]);
    manager.observe([failure('a', '1:1')]);

    manager.setObservers([source('a', provider, 'github.com/acme/other/ci.yml')]);
    gate.resolve(draft('stale'));
    await manager.waitForIdle();

    expect(manager.getSnapshot('a')).toEqual({ status: 'not_collected' });
  });

  it('drops evidence when an observer is removed', async () => {
    const gate = deferred<EvidenceDraft>();
    const provider = providerFor(() => gate.promise);
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);

    manager.setObservers([]);
    gate.resolve(draft('stale'));
    await manager.waitForIdle();

    expect(manager.getSnapshot('a')).toEqual({ status: 'unsupported' });
  });

  it('reports unsupported when the integration has no provider', () => {
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([{ id: 'a', config: { id: 'a', type: 'sentry' } }]);
    manager.observe([failure('a', 'event-1')]);

    expect(manager.getSnapshot('a')).toEqual({ status: 'unsupported' });
  });

  it('does nothing while disabled and starts on opt-in', async () => {
    const provider = providerFor(async () => draft());
    const manager = new EvidenceManager({ enabled: false, limits });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);

    expect(provider.collectEvidence).not.toHaveBeenCalled();
    expect(manager.getSnapshot('a')).toEqual({ status: 'disabled' });

    manager.setEnabled(true);
    await manager.waitForIdle();

    expect(provider.collectEvidence).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot('a').status).toBe('available');
  });

  it('retries a transient failure once and then settles', async () => {
    const implementation = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(draft('recovered'));
    const provider = providerFor(implementation);
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();

    expect(implementation).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot('a').status).toBe('available');
  });

  it('marks a persistent collection failure without retrying on every refresh', async () => {
    const implementation = vi.fn().mockRejectedValue(new Error('network'));
    const provider = providerFor(implementation);
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();

    expect(implementation).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot('a')).toEqual({ status: 'failed' });

    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();
    expect(implementation).toHaveBeenCalledTimes(2);
  });

  it('times out a provider that never settles and ignores cancellation', async () => {
    vi.useFakeTimers();
    const provider = providerFor(() => new Promise<EvidenceDraft>(() => undefined));
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);

    await vi.advanceTimersByTimeAsync(limits.collectionTimeoutMs);
    await manager.waitForIdle();

    expect(manager.getSnapshot('a')).toEqual({ status: 'failed' });
  });

  it('discards an in-flight result when diagnostics are disabled', async () => {
    const gate = deferred<EvidenceDraft>();
    const provider = providerFor(() => gate.promise);
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    expect(manager.getSnapshot('a').status).toBe('collecting');

    manager.setEnabled(false);
    expect(manager.getSnapshot('a')).toEqual({ status: 'disabled' });

    gate.resolve(draft('stale'));
    await manager.waitForIdle();
    expect(manager.getSnapshot('a')).toEqual({ status: 'disabled' });
  });

  it('bounds concurrent collection work', async () => {
    const gates = [deferred<EvidenceDraft>(), deferred<EvidenceDraft>(), deferred<EvidenceDraft>()];
    const started: string[] = [];
    const provider: DiagnosticProvider = {
      sourceType: 'githubAction',
      collectEvidence: vi.fn((failureRef) => {
        started.push(failureRef.observerId);
        return gates[started.length - 1].promise;
      }),
    };
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([
      source('a', provider, 'scope-a'),
      source('b', provider, 'scope-b'),
      source('c', provider, 'scope-c'),
    ]);
    manager.observe([failure('a', '1'), failure('b', '2'), failure('c', '3')]);

    expect(started).toEqual(['a', 'b']);
    expect(manager.getSnapshot('c').status).toBe('queued');
    gates[0].resolve(draft('a'));
    await flush();
    expect(started).toEqual(['a', 'b', 'c']);
    gates[1].resolve(draft('b'));
    gates[2].resolve(draft('c'));
    await manager.waitForIdle();
  });

  it('discards a stale result when a newer failure supersedes it', async () => {
    const first = deferred<EvidenceDraft>();
    const second = deferred<EvidenceDraft>();
    const implementation = vi.fn((failureRef) => (failureRef.failureId === '1:1' ? first.promise : second.promise));
    const provider = providerFor(implementation);
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);

    manager.observe([failure('a', '1:1')]);
    manager.observe([failure('a', '1:2')]);
    first.resolve(draft('old'));
    await flush();
    second.resolve(draft('new'));
    await manager.waitForIdle();

    expect(manager.getSnapshot('a').evidence?.summary).toBe('new');
  });

  it('expires cached evidence after the TTL', async () => {
    let clock = 1_000_000;
    const implementation = vi.fn().mockResolvedValueOnce(draft('first')).mockResolvedValueOnce(draft('second'));
    const provider = providerFor(implementation);
    const manager = new EvidenceManager({
      enabled: true,
      limits,
      now: () => new Date(clock),
    });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();

    clock += limits.cacheTtlMs + 1;
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();

    expect(implementation).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot('a').evidence?.summary).toBe('second');
  });

  it('evicts the oldest evidence beyond the cache cap', async () => {
    const provider = providerFor(async (failureRef) => draft(failureRef.observerId));
    const manager = new EvidenceManager({
      enabled: true,
      limits: { ...limits, cacheMaxEntries: 1 },
    });
    manager.setObservers([
      source('a', provider, 'scope-a'),
      source('b', provider, 'scope-b'),
      source('c', provider, 'scope-c'),
    ]);
    manager.observe([failure('a', '1'), failure('b', '2'), failure('c', '3')]);
    await manager.waitForIdle();

    const available = ['a', 'b', 'c'].filter((id) => manager.getSnapshot(id).status === 'available');
    expect(available).toHaveLength(1);

    const calls = vi.mocked(provider.collectEvidence).mock.calls.length;
    manager.observe([failure('a', '1'), failure('b', '2'), failure('c', '3')]);
    await manager.waitForIdle();
    expect(vi.mocked(provider.collectEvidence).mock.calls.length).toBe(calls);
  });

  it('redacts configured credentials before caching', async () => {
    const token = `ghp_${'C'.repeat(24)}`;
    const provider = providerFor(async () => ({
      ...draft('token leak'),
      items: [{ id: 'log:1', category: 'log', title: 'Log', content: `Authorization: Bearer ${token}` }],
    }));
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([
      { ...source('a', provider), config: { id: 'a', type: 'githubAction', authToken: token } as any },
    ]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();

    const evidence = manager.getSnapshot('a').evidence;
    expect(JSON.stringify(evidence)).not.toContain(token);
    expect(evidence?.limitations).toContain('content_redacted');
  });

  it('recollects manually and replaces the cached evidence', async () => {
    let run = 0;
    const provider = providerFor(async () => draft(`run ${(run += 1)}`));
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();
    expect(manager.getSnapshot('a').evidence?.summary).toBe('run 1');

    manager.recollect('a');
    expect(manager.getSnapshot('a').status).toBe('collecting');
    await manager.waitForIdle();

    expect(provider.collectEvidence).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot('a').evidence?.summary).toBe('run 2');
  });

  it('clears on disable and starts again on enable', async () => {
    const provider = providerFor(async () => draft());
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();
    expect(manager.isEnabled()).toBe(true);

    manager.setEnabled(false);
    expect(manager.isEnabled()).toBe(false);
    expect(manager.getSnapshot('a')).toEqual({ status: 'disabled' });

    manager.setEnabled(true);
    await manager.waitForIdle();
    expect(provider.collectEvidence).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot('a').status).toBe('available');
  });

  it('exposes partial and unavailable collection results', async () => {
    const implementation = vi
      .fn()
      .mockResolvedValueOnce(draft('partial', 'partial'))
      .mockResolvedValueOnce({
        completeness: 'unavailable',
        summary: 'missing',
        items: [],
        limitations: ['run_not_found'],
      });
    const provider = providerFor(implementation);
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider, 'scope-a'), source('b', provider, 'scope-b')]);
    manager.observe([failure('a', '1'), failure('b', '2')]);
    await manager.waitForIdle();

    expect(manager.getSnapshot('a').status).toBe('partial');
    expect(manager.getSnapshot('b').status).toBe('unavailable');
  });

  it('expires cached evidence on read without waiting for a refresh', async () => {
    let clock = 1_000_000;
    const provider = providerFor(async () => draft());
    const manager = new EvidenceManager({ enabled: true, limits, now: () => new Date(clock) });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();

    clock += limits.cacheTtlMs + 1;
    expect(manager.getSnapshot('a')).toEqual({ status: 'not_collected' });
    expect(provider.collectEvidence).toHaveBeenCalledTimes(1);
  });

  it('discards an in-flight result on shutdown', async () => {
    const gate = deferred<EvidenceDraft>();
    const provider = providerFor(() => gate.promise);
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    manager.shutdown();

    gate.resolve(draft('stale'));
    await manager.waitForIdle();
    expect(manager.getSnapshot('a')).toEqual({ status: 'disabled' });
  });

  it('clears evidence on shutdown', async () => {
    const provider = providerFor(async () => draft());
    const manager = new EvidenceManager({ enabled: true, limits });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();
    manager.shutdown();

    expect(manager.getSnapshot('a')).toEqual({ status: 'disabled' });
    expect(manager.isEnabled()).toBe(false);
  });

  it('emits cleared after a failed collection is resolved', async () => {
    const events: any[] = [];
    const provider = providerFor(async () => {
      throw new Error('collection failed');
    });
    const manager = new EvidenceManager({
      enabled: true,
      limits,
      onEvent: (event) => events.push(event),
    });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();
    expect(manager.getSnapshot('a')).toEqual({ status: 'failed' });
    manager.observe([success('a')]);
    expect(events.some((event) => event.type === 'cleared' && event.observerId === 'a')).toBe(true);
  });

  it('survives a throwing event consumer', async () => {
    const provider = providerFor(async () => draft());
    const manager = new EvidenceManager({
      enabled: true,
      limits,
      onEvent: () => {
        throw new Error('consumer failed');
      },
    });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();
    expect(manager.getSnapshot('a').status).toBe('available');
  });

  it('prunes expired evidence independently of snapshot reads and notifies consumers', async () => {
    let clock = 1_000_000;
    const events: any[] = [];
    const provider = providerFor(async () => draft());
    const manager = new EvidenceManager({
      enabled: true,
      limits,
      now: () => new Date(clock),
      onEvent: (event) => events.push(event),
    });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();

    clock += limits.cacheTtlMs + 1;
    manager.prune();
    expect(events.some((event) => event.type === 'cleared' && event.observerId === 'a')).toBe(true);
    expect(manager.getSnapshot('a')).toEqual({ status: 'not_collected' });
  });

  it('notifies consumers when cache pressure evicts evidence', async () => {
    const events: any[] = [];
    const provider = providerFor(async (failureRef) => draft(failureRef.observerId));
    const manager = new EvidenceManager({
      enabled: true,
      limits: { ...limits, cacheMaxEntries: 1 },
      onEvent: (event) => events.push(event),
    });
    manager.setObservers([source('a', provider, 'scope-a'), source('b', provider, 'scope-b')]);
    manager.observe([failure('a', '1'), failure('b', '2')]);
    await manager.waitForIdle();
    expect(events.some((event) => event.type === 'cleared')).toBe(true);
  });

  it('clears the previous evidence before manual recollection completes', async () => {
    const events: any[] = [];
    const provider = providerFor(async () => draft());
    const manager = new EvidenceManager({
      enabled: true,
      limits,
      onEvent: (event) => events.push(event),
    });
    manager.setObservers([source('a', provider)]);
    manager.observe([failure('a', '1:1')]);
    await manager.waitForIdle();
    manager.recollect('a');
    expect(events.some((event) => event.type === 'cleared' && event.observerId === 'a')).toBe(true);
    expect(manager.getSnapshot('a').status).toBe('collecting');
  });
});
