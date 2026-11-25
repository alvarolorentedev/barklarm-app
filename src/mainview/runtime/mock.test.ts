import { describe, expect, it } from 'vitest';
import { Status } from '../../types/Status';
import { createMockClient, MOCK_SCENARIO_NAMES, MOCK_STORAGE_PREFIX, mockScenarios } from './mock';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

const requiredScenarios = [
  'empty',
  'healthy',
  'failed-builds',
  'running-builds',
  'unavailable',
  'multiple-failures',
  'persistence',
  'diagnostics-complete',
  'diagnostics-partial',
  'diagnostics-unavailable',
  'diagnostics-multiple',
  'diagnostics-unsupported',
  'diagnostics-disabled',
  'diagnostics-collecting',
  'diagnostics-secrets',
];

describe('mock runtime', () => {
  it('ships every documented scenario', () => {
    requiredScenarios.forEach((name) => {
      expect(MOCK_SCENARIO_NAMES).toContain(name);
      expect(mockScenarios[name].name).toBe(name);
    });
  });

  it('returns no observers for the empty scenario', async () => {
    const client = createMockClient({ scenarioName: 'empty', storage: new MemoryStorage(), reset: true });

    expect(await client.getObserverStates()).toEqual([]);
  });

  it('returns deterministic states with matching observer IDs', async () => {
    const client = createMockClient({
      scenarioName: 'multiple-failures',
      storage: new MemoryStorage(),
      reset: true,
    });
    const configs = await client.getStore('observables');
    const states = await client.getObserverStates();

    expect(states.map((state) => state.status)).toEqual([Status.FAILURE, Status.FAILURE, Status.FAILURE]);
    expect(states.map((state) => state.id)).toEqual(configs.map((config: any) => config.id));
    expect(states.map((state) => state.error?.id)).toEqual(['run-1001', 'event-9001', 'build-42']);
  });

  it('persists configuration inside the scenario namespace', async () => {
    const storage = new MemoryStorage();
    const client = createMockClient({ scenarioName: 'persistence', storage, reset: true });
    const configs = await client.getStore('observables');

    await client.setStore('observables', [...configs, { id: 'extra', type: 'ccTray', alias: 'Extra pipeline' }]);

    expect(storage.getItem(`${MOCK_STORAGE_PREFIX}.persistence`)).toContain('Extra pipeline');

    const reloaded = createMockClient({ scenarioName: 'persistence', storage });
    const states = await reloaded.getObserverStates();

    expect(states).toHaveLength(3);
    expect(states[2]).toMatchObject({ id: 'extra', name: 'Extra pipeline', status: Status.SUCCESS });
  });

  it('resets only its own scenario key', async () => {
    const storage = new MemoryStorage();
    storage.setItem('unrelated', 'keep');
    const client = createMockClient({ scenarioName: 'healthy', storage, reset: true });
    await client.setStore('autostart', false);

    expect(storage.getItem('unrelated')).toBe('keep');

    const resetClient = createMockClient({ scenarioName: 'healthy', storage, reset: true });

    expect(await resetClient.getStore('autostart')).toBe(true);
    expect(storage.getItem('unrelated')).toBe('keep');
  });

  it('seeds the diagnostic setting per scenario', async () => {
    const complete = createMockClient({
      scenarioName: 'diagnostics-complete',
      storage: new MemoryStorage(),
      reset: true,
    });
    const disabled = createMockClient({
      scenarioName: 'diagnostics-disabled',
      storage: new MemoryStorage(),
      reset: true,
    });

    expect(await complete.getStore('diagnosticsEnabled')).toBe(true);
    expect(await disabled.getStore('diagnosticsEnabled')).toBe(false);
  });

  it('serves complete evidence for a supported observer', async () => {
    const client = createMockClient({
      scenarioName: 'diagnostics-complete',
      storage: new MemoryStorage(),
      reset: true,
    });
    const snapshot = await client.getDiagnosticEvidence('mock-diag-complete');

    expect(snapshot.status).toBe('available');
    expect(snapshot.evidence).toMatchObject({
      schemaVersion: 1,
      observerId: 'mock-diag-complete',
      failureId: '1001:1',
      sourceType: 'githubAction',
      completeness: 'complete',
    });
    expect(snapshot.evidence?.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['execution', 'job:2001', 'step:2001:2', 'error:2001:0'])
    );
  });

  it('reports integrations without diagnostic support', async () => {
    const client = createMockClient({
      scenarioName: 'diagnostics-unsupported',
      storage: new MemoryStorage(),
      reset: true,
    });

    expect(await client.getDiagnosticEvidence('mock-diag-sentry')).toEqual({ status: 'unsupported' });
  });

  it('reports disabled diagnostics until the user opts in', async () => {
    const client = createMockClient({
      scenarioName: 'diagnostics-disabled',
      storage: new MemoryStorage(),
      reset: true,
    });

    expect(await client.getDiagnosticEvidence('mock-diag-disabled')).toEqual({ status: 'disabled' });

    await client.setStore('diagnosticsEnabled', true);
    const snapshot = await client.getDiagnosticEvidence('mock-diag-disabled');

    expect(snapshot.status).toBe('available');
    expect(snapshot.evidence?.observerId).toBe('mock-diag-disabled');
  });

  it('simulates collecting and manual recollection', async () => {
    const client = createMockClient({
      scenarioName: 'diagnostics-collecting',
      storage: new MemoryStorage(),
      reset: true,
    });

    expect((await client.getDiagnosticEvidence('mock-diag-collecting')).status).toBe('collecting');
    expect((await client.getDiagnosticEvidence('mock-diag-collecting')).status).toBe('collecting');
    expect((await client.getDiagnosticEvidence('mock-diag-collecting')).status).toBe('collecting');
    expect((await client.getDiagnosticEvidence('mock-diag-collecting')).status).toBe('collecting');
    expect((await client.getDiagnosticEvidence('mock-diag-collecting')).status).toBe('available');

    await client.recollectDiagnosticEvidence('mock-diag-collecting');
    expect((await client.getDiagnosticEvidence('mock-diag-collecting')).status).toBe('collecting');
  });

  it('serves only already-redacted synthetic credentials', async () => {
    const client = createMockClient({ scenarioName: 'diagnostics-secrets', storage: new MemoryStorage(), reset: true });
    const snapshot = await client.getDiagnosticEvidence('mock-diag-secrets');

    expect(JSON.stringify(snapshot)).not.toContain('ghp_');
    expect(snapshot.evidence?.limitations).toContain('content_redacted');
    expect(snapshot.evidence?.items.some((item) => item.content.includes('[REDACTED]'))).toBe(true);
  });

  it('only opens HTTP(S) links', async () => {
    const client = createMockClient({ scenarioName: 'healthy', storage: new MemoryStorage(), reset: true });

    expect(await client.openExternal('https://github.com/acme/api/actions/runs/1')).toBe(true);
    expect(await client.openExternal('javascript:alert(1)')).toBe(false);
  });
});
