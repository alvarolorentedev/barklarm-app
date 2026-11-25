import { BarklarmConfig, DEFAULT_CONFIG, normalizeConfig, normalizeObservables } from '../../core/config';
import { ObserverConfiguration } from '../../types/ObserverConfiguration';
import { State } from '../../types/State';
import { Status } from '../../types/Status';
import type { AppRPCClient } from './types';

/**
 * Marker used by scripts/check-mock-isolation.mjs to prove that this module
 * never reaches a production renderer bundle.
 */
export const MOCK_RUNTIME_MARKER = '__BARKLARM_MOCK_RUNTIME__';

export type MockScenario = {
  name: string;
  description: string;
  observers: ObserverConfiguration[];
  stateFor: (config: ObserverConfiguration, index: number) => State;
};

export const MOCK_STORAGE_PREFIX = 'barklarm.mock.v1';

const github = (id: string, alias: string, extra: Record<string, unknown> = {}): ObserverConfiguration =>
  ({
    id,
    type: 'githubAction',
    alias,
    authToken: '',
    owner: 'acme',
    repo: 'api',
    workflowId: 'ci.yml',
    ...extra,
  }) as ObserverConfiguration;

const cctray = (id: string, alias: string): ObserverConfiguration =>
  ({ id, type: 'ccTray', alias, url: 'https://ci.example.test/cc.xml' }) as ObserverConfiguration;

const sentry = (id: string, alias: string): ObserverConfiguration =>
  ({ id, type: 'sentry', alias, organization: 'acme', project: 'api', authToken: '' }) as ObserverConfiguration;

const datadog = (id: string, alias: string): ObserverConfiguration =>
  ({
    id,
    type: 'datadogMonitor',
    alias,
    site: 'datadoghq.eu',
    monitorId: '1234',
    apiKey: '',
    appKey: '',
  }) as ObserverConfiguration;

const azureDevOps = (id: string, alias: string): ObserverConfiguration =>
  ({
    id,
    type: 'azureDevOps',
    alias,
    orgUrl: 'https://acme.visualstudio.com',
    project: 'api',
    pipelineId: '42',
    authToken: '',
  }) as ObserverConfiguration;

function nameOf(config: ObserverConfiguration): string {
  return config.alias || config.type || 'Observer';
}

function buildState(config: ObserverConfiguration, status: Status, errorId?: string, description?: string): State {
  return {
    id: config.id,
    name: nameOf(config),
    status,
    link: `https://example.test/observers/${config.id}`,
    muted: config.muted,
    issueEndpoint: config.issueEndpoint,
    ...(status === Status.FAILURE && errorId
      ? { error: { id: errorId, description: description || `${nameOf(config)} failed` } }
      : {}),
  };
}

function statusScenario(
  name: string,
  description: string,
  observers: ObserverConfiguration[],
  statuses: Status[],
  errorIds: string[] = []
): MockScenario {
  return {
    name,
    description,
    observers,
    stateFor: (config, index) => buildState(config, statuses[index] ?? Status.SUCCESS, errorIds[index]),
  };
}

export const mockScenarios: Record<string, MockScenario> = {
  empty: statusScenario('empty', 'No configured observers.', [], []),
  healthy: statusScenario(
    'healthy',
    'Three healthy observers.',
    [
      github('mock-github-ok', 'API build'),
      cctray('mock-cctray-ok', 'Nightly release'),
      sentry('mock-sentry-ok', 'API errors'),
    ],
    [Status.SUCCESS, Status.SUCCESS, Status.SUCCESS]
  ),
  'failed-builds': statusScenario(
    'failed-builds',
    'One failed build next to a healthy one.',
    [github('mock-github-fail', 'API build'), cctray('mock-cctray-ok', 'Nightly release')],
    [Status.FAILURE, Status.SUCCESS],
    ['run-1001']
  ),
  'running-builds': statusScenario(
    'running-builds',
    'Two observers currently checking.',
    [github('mock-github-running', 'API build'), azureDevOps('mock-azure-running', 'Release pipeline')],
    [Status.CHECKING, Status.CHECKING]
  ),
  unavailable: statusScenario(
    'unavailable',
    'Integrations that cannot be reached or are misconfigured.',
    [sentry('mock-sentry-na', 'API errors'), datadog('mock-datadog-na', 'Latency monitor')],
    [Status.NA, Status.NA]
  ),
  'multiple-failures': statusScenario(
    'multiple-failures',
    'Three simultaneous distinct failures.',
    [
      github('mock-github-fail', 'API build'),
      sentry('mock-sentry-fail', 'API errors'),
      cctray('mock-cctray-fail', 'Nightly release'),
    ],
    [Status.FAILURE, Status.FAILURE, Status.FAILURE],
    ['run-1001', 'event-9001', 'build-42']
  ),
  persistence: statusScenario(
    'persistence',
    'Healthy observers suited to configuration and reload checks.',
    [github('mock-github-persist', 'API build'), sentry('mock-sentry-persist', 'API errors')],
    [Status.SUCCESS, Status.SUCCESS]
  ),
};

export function resolveMockScenario(name?: string | null): MockScenario {
  if (name && mockScenarios[name]) return mockScenarios[name];
  if (name) console.warn(`[Barklarm mock] unknown scenario "${name}", falling back to healthy`);
  return mockScenarios.healthy;
}

export const MOCK_SCENARIO_NAMES = Object.keys(mockScenarios);

function readConfig(storage: Storage, key: string): BarklarmConfig | null {
  try {
    const raw = storage.getItem(key);
    return raw ? normalizeConfig(JSON.parse(raw)) : null;
  } catch (error) {
    console.warn('[Barklarm mock] ignoring unreadable stored config', error);
    return null;
  }
}

export type MockClientOptions = {
  scenarioName?: string;
  storage?: Storage;
  reset?: boolean;
};

export function createMockClient(options: MockClientOptions = {}): AppRPCClient {
  const search = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const scenario = resolveMockScenario(options.scenarioName ?? search.get('scenario'));
  const storage = options.storage ?? window.localStorage;
  const key = `${MOCK_STORAGE_PREFIX}.${scenario.name}`;

  if (options.reset || search.has('reset')) storage.removeItem(key);

  let config =
    readConfig(storage, key) ??
    normalizeConfig({ ...DEFAULT_CONFIG, observables: normalizeObservables(scenario.observers) });

  const persist = (): void => {
    try {
      storage.setItem(key, JSON.stringify(config));
    } catch (error) {
      console.error('[Barklarm mock] could not persist config', error);
    }
  };
  persist();

  if (import.meta.env.DEV) {
    console.debug(`[Barklarm mock] ${MOCK_RUNTIME_MARKER} ${scenario.name}`);
  }

  return {
    async getStore(field: string): Promise<any> {
      return (config as any)[field];
    },
    async setStore(field: string, value: any): Promise<void> {
      config =
        field === 'observables'
          ? { ...config, observables: normalizeObservables(value) }
          : ({ ...config, [field]: value } as BarklarmConfig);
      persist();
    },
    async refreshObservers(): Promise<void> {
      // States are derived from the stored config, so no I/O is needed.
    },
    async getObserverStates(): Promise<State[]> {
      return (config.observables || []).map((observer, index) => scenario.stateFor(observer, index));
    },
    async importConfig(): Promise<boolean> {
      return false;
    },
    async exportConfig(): Promise<boolean> {
      return false;
    },
    async quit(): Promise<boolean> {
      return true;
    },
    logError(message: string): void {
      console.error(`[Barklarm mock] ${message}`);
    },
  };
}
