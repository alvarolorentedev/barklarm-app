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
});
