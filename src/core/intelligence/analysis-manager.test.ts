import { describe, expect, it, vi } from 'vitest';
import { DiagnosticEvidence } from '../../types/Diagnostics';
import {
  InferenceError,
  InferenceProvider,
  InferenceRequest,
  InferenceResult,
  ProviderCapabilities,
  ProviderTestResult,
} from '../../types/Intelligence';
import { AnalysisManager } from './analysis-manager';

function evidence(overrides: Partial<DiagnosticEvidence> = {}): DiagnosticEvidence {
  return {
    schemaVersion: 1,
    observerId: 'observer-1',
    failureId: 'run-1:1',
    sourceType: 'githubAction',
    collectedAt: '2026-01-15T12:00:00.000Z',
    completeness: 'complete',
    summary: 'Workflow failed.',
    items: [
      {
        id: 'error:1',
        category: 'error',
        title: 'Error',
        content: 'error TS2322: Type string is not assignable to type number',
      },
    ],
    limitations: [],
    ...overrides,
  };
}

function validAnalysis(evidenceId = 'error:1'): string {
  return JSON.stringify({
    summary: 'The build failed on a type error.',
    findings: [{ statement: 'TypeScript reported TS2322.', evidenceIds: [evidenceId] }],
    likelyCauses: [
      {
        description: 'A string is assigned to a number.',
        evidenceIds: [evidenceId],
        certainty: 'supported',
      },
    ],
    recommendations: [
      {
        description: 'Inspect the cited type mismatch.',
        rationale: 'The compiler identifies the incompatible value.',
        evidenceIds: [evidenceId],
        type: 'investigate',
      },
    ],
    evidenceSufficiency: 'sufficient',
    uncertainty: [],
  });
}

class FakeProvider implements InferenceProvider {
  readonly kind = 'openai-compatible' as const;
  readonly name = 'fake';
  readonly model = 'fake-model';
  calls = 0;
  requests: InferenceRequest[] = [];
  responses: Array<string | Error>;
  delayMs = 0;
  tokenCount?: number;
  tokenizeImpl?: (text: string) => number;
  tokenizeError?: Error;

  constructor(responses: Array<string | Error> = [validAnalysis()]) {
    this.responses = responses;
  }

  async initialize(): Promise<void> {
    return undefined;
  }

  async testConnection(): Promise<ProviderTestResult> {
    return { ok: true };
  }

  async listModels(): Promise<string[]> {
    return [this.model];
  }

  capabilities(): ProviderCapabilities {
    return { structuredOutput: 'json_schema', tokenizer: false, modelDiscovery: true };
  }

  async infer(request: InferenceRequest): Promise<InferenceResult> {
    this.calls += 1;
    this.requests.push(request);
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const next = this.responses[Math.min(this.calls - 1, this.responses.length - 1)];
    if (next instanceof Error) throw next;
    return { text: next, model: this.model };
  }

  async tokenize(text: string): Promise<number> {
    if (this.tokenizeError) throw this.tokenizeError;
    if (this.tokenizeImpl) return this.tokenizeImpl(text);
    return this.tokenCount ?? 0;
  }

  dispose(): void {
    return undefined;
  }
}

function managerFor(provider: FakeProvider, overrides: Record<string, any> = {}) {
  return new AnalysisManager({
    mode: 'custom',
    provider: {
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'fake-model',
      contextWindow: 4096,
      maxOutputTokens: 512,
      timeoutMs: 5000,
    },
    diagnosticsEnabled: true,
    createProvider: () => provider,
    now: () => new Date('2026-01-15T12:00:00.000Z'),
    limits: { concurrency: 1, cacheTtlMs: 60000, maxCacheEntries: 2, maxQueue: 2 },
    ...overrides,
  });
}

describe('analysis manager', () => {
  it('analyzes available evidence and exposes a validated snapshot', async () => {
    const provider = new FakeProvider();
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    const snapshot = manager.getSnapshot('observer-1');
    expect(snapshot.status).toBe('available');
    expect(snapshot.analysis?.observerId).toBe('observer-1');
    expect(snapshot.analysis?.findings[0].evidenceIds).toEqual(['error:1']);
    expect(snapshot.assembly?.includedEvidenceIds).toEqual(['error:1']);
    manager.shutdown();
  });

  it('deduplicates identical evidence even when collection time changes', async () => {
    const provider = new FakeProvider();
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    manager.ingest(evidence({ collectedAt: '2026-01-15T13:00:00.000Z' }));
    await manager.waitForIdle();
    expect(provider.calls).toBe(1);
    expect(manager.getSnapshot('observer-1').status).toBe('available');
    manager.shutdown();
  });

  it('forces a new inference on reanalysis', async () => {
    const provider = new FakeProvider([validAnalysis(), validAnalysis()]);
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(provider.calls).toBe(1);
    manager.reanalyze('observer-1');
    await manager.waitForIdle();
    expect(provider.calls).toBe(2);
    expect(manager.getSnapshot('observer-1').status).toBe('available');
    manager.shutdown();
  });

  it('does not infer when evidence is unavailable or empty', async () => {
    const provider = new FakeProvider();
    const manager = managerFor(provider);
    manager.ingest(evidence({ completeness: 'unavailable', items: [] }));
    await manager.waitForIdle();
    expect(provider.calls).toBe(0);
    expect(manager.getSnapshot('observer-1').status).toBe('insufficient_evidence');
    manager.shutdown();
  });

  it('reports disabled and diagnostics-disabled states without inference', async () => {
    const provider = new FakeProvider();
    const disabled = new AnalysisManager({
      mode: 'disabled',
      createProvider: () => provider,
    });
    disabled.ingest(evidence());
    expect(disabled.getSnapshot('observer-1').status).toBe('disabled');
    expect(provider.calls).toBe(0);
    disabled.shutdown();

    const waiting = managerFor(provider);
    waiting.setDiagnosticsEnabled(false);
    waiting.ingest(evidence());
    expect(waiting.getSnapshot('observer-1')).toEqual({
      status: 'waiting_for_evidence',
      reason: 'diagnostics_disabled',
    });
    expect(provider.calls).toBe(0);
    waiting.shutdown();
  });

  it('maps consent and provider failures to runtime-unavailable states', async () => {
    const provider = new FakeProvider([new InferenceError('consent_required')]);
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1')).toEqual({
      status: 'runtime_unavailable',
      reason: 'consent_required',
    });
    manager.shutdown();
  });

  it('repairs one invalid response and rejects a second failure', async () => {
    const repair = new FakeProvider(['not json', validAnalysis()]);
    const manager = managerFor(repair);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(repair.calls).toBe(2);
    expect(repair.requests[1].messages.some((message) => message.content.includes('invalid_json'))).toBe(true);
    expect(manager.getSnapshot('observer-1').status).toBe('available');
    manager.shutdown();

    const invalid = new FakeProvider(['not json', 'still not json']);
    const failing = managerFor(invalid);
    failing.ingest(evidence());
    await failing.waitForIdle();
    expect(failing.getSnapshot('observer-1')).toEqual({
      status: 'failed',
      reason: 'invalid_response',
    });
    failing.shutdown();
  });

  it('rejects stale results when evidence changes during inference', async () => {
    const provider = new FakeProvider([validAnalysis('error:1'), validAnalysis('error:2')]);
    provider.delayMs = 5;
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await new Promise((resolve) => setTimeout(resolve, 0));
    manager.ingest(
      evidence({
        failureId: 'run-2:1',
        items: [{ id: 'error:2', category: 'error', title: 'Error 2', content: 'different failure' }],
      })
    );
    await manager.waitForIdle();
    const snapshot = manager.getSnapshot('observer-1');
    expect(snapshot.status).toBe('available');
    expect(snapshot.analysis?.failureId).toBe('run-2:1');
    expect(snapshot.analysis?.findings[0].evidenceIds).toEqual(['error:2']);
    manager.shutdown();
  });

  it('clears evidence, analysis and cache on observer removal', async () => {
    const provider = new FakeProvider([validAnalysis(), validAnalysis()]);
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(provider.calls).toBe(1);
    manager.clear('observer-1');
    expect(manager.getSnapshot('observer-1').status).toBe('waiting_for_evidence');
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(provider.calls).toBe(2);
    manager.shutdown();
  });

  it('maps every provider failure to a bounded state', async () => {
    const cases: Array<[string, any]> = [
      ['consent_required', { status: 'runtime_unavailable', reason: 'consent_required' }],
      ['timeout', { status: 'runtime_unavailable', reason: 'timeout' }],
      ['unavailable', { status: 'runtime_unavailable', reason: 'provider_unavailable' }],
      ['unauthorized', { status: 'runtime_unavailable', reason: 'provider_unavailable' }],
      ['rate_limited', { status: 'runtime_unavailable', reason: 'provider_unavailable' }],
      ['configuration', { status: 'failed', reason: 'configuration_invalid' }],
      ['unsupported', { status: 'failed', reason: 'configuration_invalid' }],
      ['too_large', { status: 'failed', reason: 'invalid_response' }],
      ['redirect_rejected', { status: 'failed', reason: 'invalid_response' }],
      ['invalid_response', { status: 'failed', reason: 'invalid_response' }],
      ['cancelled', { status: 'failed', reason: 'cancelled' }],
      ['unknown', { status: 'failed', reason: 'invalid_response' }],
    ];
    for (const [code, expected] of cases) {
      const provider = new FakeProvider([new InferenceError(code as any)]);
      const manager = managerFor(provider);
      manager.ingest(evidence());
      await manager.waitForIdle();
      expect(manager.getSnapshot('observer-1')).toEqual(expected);
      manager.shutdown();
    }
  });

  it('fails with a configuration reason when provider creation throws', async () => {
    const manager = managerFor(new FakeProvider(), {
      createProvider: () => {
        throw new InferenceError('configuration', 'bad endpoint');
      },
    });
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1')).toEqual({
      status: 'failed',
      reason: 'configuration_invalid',
    });
    manager.shutdown();
  });

  it('bounds the queue and reports queue_full', async () => {
    const provider = new FakeProvider();
    provider.delayMs = 20;
    const manager = managerFor(provider, { limits: { concurrency: 1, maxQueue: 1 } });
    const second = evidence({ observerId: 'observer-2', failureId: 'run-2:1' });
    const third = evidence({ observerId: 'observer-3', failureId: 'run-3:1' });
    manager.ingest(evidence());
    manager.ingest(second);
    manager.ingest(third);
    expect(manager.getSnapshot('observer-3')).toEqual({ status: 'failed', reason: 'queue_full' });
    await manager.waitForIdle();
    manager.shutdown();
  });

  it('evicts the oldest cache entry and can infer again', async () => {
    const provider = new FakeProvider([validAnalysis(), validAnalysis(), validAnalysis()]);
    const manager = managerFor(provider, { limits: { maxCacheEntries: 1 } });
    manager.ingest(evidence());
    await manager.waitForIdle();
    manager.ingest(evidence({ observerId: 'observer-2', failureId: 'run-2:1' }));
    await manager.waitForIdle();
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(provider.calls).toBe(3);
    manager.shutdown();
  });

  it('uses the tokenizer to reduce an oversized context', async () => {
    const provider = new FakeProvider();
    provider.tokenizeImpl = (text) => Math.ceil(text.length / 2);
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(provider.calls).toBe(1);
    expect(provider.requests[0].messages[1].content.length).toBeLessThan(20000);
    manager.shutdown();
  });

  it('rejects a prompt that cannot fit even after deterministic reduction', async () => {
    const provider = new FakeProvider();
    provider.tokenCount = 100000;
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(provider.calls).toBe(0);
    expect(manager.getSnapshot('observer-1')).toEqual({ status: 'failed', reason: 'invalid_response' });
    manager.shutdown();
  });

  it('ignores tokenizer failures and still analyzes', async () => {
    const provider = new FakeProvider();
    provider.tokenizeError = new InferenceError('unsupported');
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1').status).toBe('available');
    manager.shutdown();
  });

  it('does not infer when every evidence item is empty after assembly', async () => {
    const provider = new FakeProvider();
    const manager = managerFor(provider);
    manager.ingest(evidence({ items: [{ id: 'error:1', category: 'error', title: '', content: '   ' }] }));
    await manager.waitForIdle();
    expect(provider.calls).toBe(0);
    expect(manager.getSnapshot('observer-1').status).toBe('insufficient_evidence');
    manager.shutdown();
  });

  it('notifies snapshot consumers and survives a throwing callback', async () => {
    const seen: string[] = [];
    const provider = new FakeProvider();
    const manager = managerFor(provider, {
      onSnapshot: (observerId: string, snapshot: any) => {
        seen.push(`${observerId}:${snapshot.status}`);
        throw new Error('ui failure');
      },
    });
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(seen).toContain('observer-1:available');
    manager.shutdown();
  });

  it('handles no-op configuration changes and idle waits', async () => {
    const provider = new FakeProvider();
    const manager = managerFor(provider, { now: () => new Date('2026-01-15T12:00:00.000Z') });
    expect(manager.isEnabled()).toBe(true);
    await manager.waitForIdle();
    manager.setConfig('custom', {
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'fake-model',
      contextWindow: 4096,
      maxOutputTokens: 512,
      timeoutMs: 5000,
    });
    manager.setDiagnosticsEnabled(true);
    expect(manager.getSnapshot('missing')).toEqual({ status: 'waiting_for_evidence' });
    manager.reanalyze('missing');
    expect(manager.getSnapshot('missing')).toEqual({ status: 'waiting_for_evidence', reason: 'no_evidence' });
    manager.clear('missing');
    manager.clearAll();
    manager.shutdown();
    manager.shutdown();
    expect(manager.isEnabled()).toBe(false);
    expect(manager.getSnapshot('observer-1')).toEqual({ status: 'disabled' });
  });

  it('expires cached analyses after the evidence TTL', async () => {
    const provider = new FakeProvider([validAnalysis(), validAnalysis()]);
    let now = new Date('2026-01-15T12:00:00.000Z');
    const manager = managerFor(provider, { now: () => now, limits: { cacheTtlMs: 1000 } });
    manager.ingest(evidence());
    await manager.waitForIdle();
    now = new Date('2026-01-15T12:00:02.000Z');
    manager.ingest(evidence({ collectedAt: '2026-01-15T12:00:02.000Z' }));
    await manager.waitForIdle();
    expect(provider.calls).toBe(2);
    manager.shutdown();
  });

  it('expires an available snapshot when read after the cache TTL', async () => {
    const provider = new FakeProvider([validAnalysis(), validAnalysis()]);
    let now = new Date('2026-01-15T12:00:00.000Z');
    const manager = managerFor(provider, { now: () => now, limits: { cacheTtlMs: 1000 } });
    manager.ingest(evidence());
    await manager.waitForIdle();
    now = new Date('2026-01-15T12:00:02.000Z');
    expect(manager.getSnapshot('observer-1')).toEqual({ status: 'waiting_for_evidence' });
    manager.ingest(evidence({ collectedAt: '2026-01-15T12:00:02.000Z' }));
    await manager.waitForIdle();
    expect(provider.calls).toBe(2);
    manager.shutdown();
  });

  it('rejects sensitive and unsafe repaired output without exposing it', async () => {
    const sensitive = new FakeProvider([
      'not json',
      JSON.stringify({ ...JSON.parse(validAnalysis()), summary: 'token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456' }),
    ]);
    const manager = managerFor(sensitive);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1')).toEqual({ status: 'failed', reason: 'sensitive_output' });
    manager.shutdown();

    const unsafe = new FakeProvider([
      'not json',
      JSON.stringify({ ...JSON.parse(validAnalysis()), summary: 'run rm -rf /' }),
    ]);
    const second = managerFor(unsafe);
    second.ingest(evidence());
    await second.waitForIdle();
    expect(second.getSnapshot('observer-1')).toEqual({ status: 'failed', reason: 'unsafe_output' });
    second.shutdown();
  });

  it('does not duplicate work for the same in-flight evidence', async () => {
    const provider = new FakeProvider();
    provider.delayMs = 10;
    const manager = managerFor(provider);
    manager.ingest(evidence());
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(provider.calls).toBe(1);
    manager.shutdown();
  });

  it('replaces queued evidence for the same observer and re-enables diagnostics', async () => {
    const provider = new FakeProvider();
    provider.delayMs = 20;
    const manager = managerFor(provider);
    const second = evidence({ observerId: 'observer-2', failureId: 'run-2:1' });
    manager.ingest(evidence());
    manager.ingest(second);
    manager.ingest(
      evidence({
        observerId: 'observer-2',
        failureId: 'run-2:2',
        items: [{ id: 'error:1', category: 'error', title: 'Error 3', content: 'newer failure' }],
      })
    );
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-2').status).toBe('available');
    manager.setDiagnosticsEnabled(false);
    expect(manager.getSnapshot('observer-2')).toEqual({
      status: 'waiting_for_evidence',
      reason: 'diagnostics_disabled',
    });
    manager.setDiagnosticsEnabled(true);
    expect(manager.getSnapshot('observer-2')).toEqual({ status: 'waiting_for_evidence' });
    manager.shutdown();
  });

  it('deduplicates a queued request with the same key', async () => {
    const provider = new FakeProvider();
    provider.delayMs = 20;
    const manager = managerFor(provider);
    const second = evidence({ observerId: 'observer-2', failureId: 'run-2:1' });
    manager.ingest(evidence());
    manager.ingest(second);
    manager.ingest(second);
    await manager.waitForIdle();
    expect(provider.calls).toBe(2);
    manager.shutdown();
  });

  it('propagates a cancelled tokenizer without falling back', async () => {
    const provider = new FakeProvider();
    provider.tokenizeError = new InferenceError('cancelled');
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1')).toEqual({ status: 'failed', reason: 'cancelled' });
    manager.shutdown();
  });

  it('ignores redundant diagnostics toggles and disabled-mode reanalysis', async () => {
    const provider = new FakeProvider();
    const manager = managerFor(provider);
    manager.setDiagnosticsEnabled(true);
    manager.setConfig('disabled');
    expect(manager.isEnabled()).toBe(false);
    manager.reanalyze('observer-1');
    expect(provider.calls).toBe(0);
    manager.shutdown();
  });

  it('clears cached analyses when the provider configuration changes', async () => {
    const provider = new FakeProvider([validAnalysis(), validAnalysis()]);
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1').status).toBe('available');
    manager.setConfig('custom', {
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'different-model',
      contextWindow: 4096,
      maxOutputTokens: 512,
      timeoutMs: 5000,
    });
    await manager.waitForIdle();
    expect(provider.calls).toBe(2);
    manager.shutdown();
  });

  it('refreshes the provider and re-runs evidence after credential changes', async () => {
    const provider = new FakeProvider([validAnalysis(), validAnalysis()]);
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(provider.calls).toBe(1);
    manager.refreshProvider();
    await manager.waitForIdle();
    expect(provider.calls).toBe(2);
    expect(manager.getSnapshot('observer-1').status).toBe('available');
    manager.shutdown();
  });

  it('drops evidence older than the cache TTL', async () => {
    const provider = new FakeProvider();
    let now = new Date('2026-01-15T12:00:00.000Z');
    const manager = managerFor(provider, { now: () => now, limits: { cacheTtlMs: 1000 } });
    now = new Date('2026-01-15T12:00:02.000Z');
    manager.ingest(evidence({ collectedAt: '2026-01-15T12:00:00.000Z' }));
    await manager.waitForIdle();
    expect(provider.calls).toBe(0);
    expect(manager.getSnapshot('observer-1')).toEqual({ status: 'waiting_for_evidence', reason: 'no_evidence' });
    manager.shutdown();
  });

  it('clears state on disable and shutdown', async () => {
    const provider = new FakeProvider();
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    manager.setConfig('disabled');
    expect(manager.getSnapshot('observer-1').status).toBe('disabled');
    manager.setConfig('custom', {
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'fake-model',
      contextWindow: 4096,
      maxOutputTokens: 512,
    });
    manager.ingest(evidence());
    await manager.waitForIdle();
    manager.shutdown();
    expect(manager.getSnapshot('observer-1').status).toBe('disabled');
  });

  it('prunes expired evidence and analysis without a UI snapshot request', async () => {
    let now = new Date('2026-01-15T12:00:00.000Z');
    const provider = new FakeProvider();
    const manager = managerFor(provider, { now: () => now, limits: { cacheTtlMs: 1000 } });
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1').status).toBe('available');

    now = new Date('2026-01-15T12:00:02.000Z');
    manager.prune();
    expect(manager.getSnapshot('observer-1')).toEqual({ status: 'waiting_for_evidence' });
    manager.shutdown();
  });

  it('clears cached analysis when diagnostics are disabled', async () => {
    const provider = new FakeProvider([validAnalysis(), validAnalysis()]);
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(provider.calls).toBe(1);

    manager.setDiagnosticsEnabled(false);
    manager.setDiagnosticsEnabled(true);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(provider.calls).toBe(2);
    manager.shutdown();
  });

  it('never exposes the previous failure analysis while a new failure is queued', async () => {
    const provider = new FakeProvider([validAnalysis('error:1'), validAnalysis('error:2')]);
    provider.delayMs = 5;
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1').status).toBe('available');

    const next = evidence({
      failureId: 'run-2:1',
      items: [{ id: 'error:2', category: 'error', title: 'Error 2', content: 'different failure' }],
    });
    manager.ingest(next);
    const snapshot = manager.getSnapshot('observer-1');
    expect(snapshot.status).not.toBe('available');
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1').analysis?.failureId).toBe('run-2:1');
    manager.shutdown();
  });

  it('recovers work that overflowed the queue once capacity is available', async () => {
    const provider = new FakeProvider();
    provider.delayMs = 5;
    const manager = managerFor(provider, { limits: { concurrency: 1, maxQueue: 1 } });
    manager.ingest(evidence());
    manager.ingest(evidence({ observerId: 'observer-2', failureId: 'run-2:1' }));
    manager.ingest(evidence({ observerId: 'observer-3', failureId: 'run-3:1' }));
    expect(manager.getSnapshot('observer-3')).toEqual({ status: 'failed', reason: 'queue_full' });
    await manager.waitForIdle();
    expect(provider.calls).toBe(3);
    expect(manager.getSnapshot('observer-3').status).toBe('available');
    manager.shutdown();
  });

  it('preserves an explicit analysis reason from the provider', async () => {
    const provider = new FakeProvider([new InferenceError('unavailable', 'native', 'model_missing')]);
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1')).toEqual({
      status: 'runtime_unavailable',
      reason: 'model_missing',
    });
    manager.shutdown();
  });

  it('disposes a provider that resolves after its generation was superseded', async () => {
    const stale = new FakeProvider();
    const dispose = vi.fn();
    stale.dispose = dispose;
    const fresh = new FakeProvider();
    let resolveStale: (provider: InferenceProvider) => void = () => undefined;
    const pendingProvider = new Promise<InferenceProvider>((resolve) => {
      resolveStale = resolve;
    });
    let created = 0;
    const manager = managerFor(fresh, {
      createProvider: () => {
        created += 1;
        return created === 1 ? pendingProvider : fresh;
      },
    });
    manager.ingest(evidence());
    await new Promise((resolve) => setTimeout(resolve, 0));
    manager.setConfig('custom', {
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'fake-model',
      contextWindow: 4096,
      maxOutputTokens: 256,
      timeoutMs: 5000,
    });
    resolveStale(stale);
    await manager.waitForIdle();
    expect(dispose).toHaveBeenCalled();
    expect(manager.getSnapshot('observer-1').status).toBe('available');
    manager.shutdown();
  });

  it('re-runs blocked analysis when a first-run condition resolves', async () => {
    const provider = new FakeProvider([new InferenceError('unavailable', 'native', 'model_missing'), validAnalysis()]);
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1')).toEqual({
      status: 'runtime_unavailable',
      reason: 'model_missing',
    });

    manager.retryBlocked(true);
    await manager.waitForIdle();
    expect(provider.calls).toBe(2);
    expect(manager.getSnapshot('observer-1').status).toBe('available');
    manager.shutdown();
  });

  it('does not automatically re-send evidence to a failing remote provider', async () => {
    const provider = new FakeProvider([new InferenceError('unavailable')]);
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    manager.retryBlocked(true);
    await manager.waitForIdle();
    expect(provider.calls).toBe(1);
    manager.shutdown();
  });

  it('invalidates an in-flight run when its evidence is already stale', async () => {
    let now = new Date('2026-01-15T12:00:00.000Z');
    const provider = new FakeProvider();
    provider.delayMs = 10;
    const manager = managerFor(provider, { now: () => now, limits: { cacheTtlMs: 1000 } });
    manager.ingest(evidence());
    await new Promise((resolve) => setTimeout(resolve, 0));
    now = new Date('2026-01-15T12:00:02.000Z');
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1')).toEqual({
      status: 'waiting_for_evidence',
      reason: 'no_evidence',
    });
    manager.shutdown();
  });

  it('rate-limits retry attempts so status polling cannot loop', async () => {
    const provider = new FakeProvider([new InferenceError('unavailable', 'native', 'model_missing')]);
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await manager.waitForIdle();
    expect(provider.calls).toBe(1);

    manager.retryBlocked(true);
    await manager.waitForIdle();
    expect(provider.calls).toBe(2);
    manager.retryBlocked();
    await manager.waitForIdle();
    expect(provider.calls).toBe(2);
    manager.shutdown();
  });

  it('keeps only the latest execution when reanalysis supersedes an active run', async () => {
    const first = { ...JSON.parse(validAnalysis()), summary: 'first execution' };
    const second = { ...JSON.parse(validAnalysis()), summary: 'second execution' };
    const provider = new FakeProvider([JSON.stringify(first), JSON.stringify(second)]);
    provider.delayMs = 10;
    const manager = managerFor(provider);
    manager.ingest(evidence());
    await new Promise((resolve) => setTimeout(resolve, 0));
    manager.reanalyze('observer-1');
    expect(manager.getSnapshot('observer-1').status).toBe('queued');
    await manager.waitForIdle();
    expect(manager.getSnapshot('observer-1').analysis?.summary).toBe('second execution');
    manager.shutdown();
  });
});
