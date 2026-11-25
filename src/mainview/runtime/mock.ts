import { BarklarmConfig, DEFAULT_CONFIG, normalizeConfig, normalizeObservables } from '../../core/config';
import { isHttpUrl } from '../../core/issue';
import { DiagnosticCompleteness, DiagnosticEvidence, DiagnosticSnapshot, EvidenceItem } from '../../types/Diagnostics';
import { ObserverConfiguration } from '../../types/ObserverConfiguration';
import { State } from '../../types/State';
import { Status } from '../../types/Status';
import type { AppRPCClient } from './types';

/**
 * Marker used by scripts/check-mock-isolation.mjs to prove that this module
 * never reaches a production renderer bundle.
 */
export const MOCK_RUNTIME_MARKER = '__BARKLARM_MOCK_RUNTIME__';

type MockDiagnosticFixture = {
  status: 'available' | 'partial' | 'unavailable';
  evidence?: DiagnosticEvidence;
  /** Number of reads that report collecting before the fixture settles. */
  pollsUntilReady?: number;
};

type MockDiagnostics = {
  enabled: boolean;
  fixtures: Record<string, MockDiagnosticFixture>;
};

export type MockScenario = {
  name: string;
  description: string;
  observers: ObserverConfiguration[];
  stateFor: (config: ObserverConfiguration, index: number) => State;
  diagnostics?: MockDiagnostics;
};

export const MOCK_STORAGE_PREFIX = 'barklarm.mock.v1';
const DIAGNOSTIC_TIME = '2026-01-15T12:00:00.000Z';

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
  errorIds: string[] = [],
  diagnostics?: MockDiagnostics
): MockScenario {
  return {
    name,
    description,
    observers,
    stateFor: (config, index) => buildState(config, statuses[index] ?? Status.SUCCESS, errorIds[index]),
    diagnostics,
  };
}

function evidence(
  observerId: string,
  failureId: string,
  completeness: DiagnosticCompleteness,
  summary: string,
  items: EvidenceItem[],
  limitations: string[] = []
): DiagnosticEvidence {
  return {
    schemaVersion: 1,
    observerId,
    failureId,
    sourceType: 'githubAction',
    collectedAt: DIAGNOSTIC_TIME,
    completeness,
    summary,
    items,
    limitations,
  };
}

function executionItem(runId: number, attempt: number, failed = 1): EvidenceItem {
  return {
    id: 'execution',
    category: 'execution',
    title: 'Workflow execution: CI',
    content: [
      'Repository: acme/api',
      'Workflow: CI',
      `Run: ${runId} (attempt ${attempt})`,
      'Conclusion: failure',
      'Branch: main',
      'Commit: 4f2c1ab',
      'Event: push',
      'Created: 2026-01-15T10:00:00Z',
      'Started: 2026-01-15T10:00:05Z',
      'Updated: 2026-01-15T10:04:00Z',
      `Jobs: 2 total; ${failed} failed; 0 cancelled; ${failed === 1 ? 1 : 0} succeeded`,
    ].join('\n'),
    source: { url: `https://github.com/acme/api/actions/runs/${runId}`, label: 'CI' },
    timestamp: '2026-01-15T10:00:00Z',
    metadata: { runId, runAttempt: attempt, conclusion: 'failure' },
  };
}

function jobItem(jobId: number, name = 'build', conclusion = 'failure'): EvidenceItem {
  return {
    id: `job:${jobId}`,
    category: 'job',
    title: `Job: ${name}`,
    content: [
      `Job: ${name}`,
      `Conclusion: ${conclusion}`,
      `Job ID: ${jobId}`,
      'Started: 2026-01-15T10:00:10Z',
      'Completed: 2026-01-15T10:03:00Z',
      `URL: https://github.com/acme/api/actions/runs/1001/job/${jobId}`,
    ].join('\n'),
    source: { url: `https://github.com/acme/api/actions/runs/1001/job/${jobId}`, label: name },
    timestamp: '2026-01-15T10:00:10Z',
    metadata: { jobId, conclusion },
  };
}

function stepItem(jobId: number, stepNumber: number, name = 'Run tests'): EvidenceItem {
  return {
    id: `step:${jobId}:${stepNumber}`,
    category: 'step',
    title: `Step: ${name}`,
    content: [
      `Step: ${stepNumber}: ${name}`,
      'Conclusion: failure',
      'Started: 2026-01-15T10:01:00Z',
      'Completed: 2026-01-15T10:02:30Z',
    ].join('\n'),
    source: { url: `https://github.com/acme/api/actions/runs/1001/job/${jobId}`, label: name },
    timestamp: '2026-01-15T10:01:00Z',
    metadata: { jobId, stepNumber, conclusion: 'failure' },
  };
}

function errorItem(jobId: number, text: string): EvidenceItem {
  return {
    id: `error:${jobId}:0`,
    category: 'error',
    title: 'Error excerpt from build',
    content: text,
    source: { url: `https://github.com/acme/api/actions/runs/1001/job/${jobId}`, label: 'build' },
    timestamp: '2026-01-15T10:02:00Z',
    metadata: { jobId, signal: 'dependency-error', startLine: 42, endLine: 48 },
  };
}

const completeEvidence = evidence(
  'mock-diag-complete',
  '1001:1',
  'complete',
  'Workflow run 1001 attempt 1 failed: 1 failed job(s), 1 error excerpt(s) collected.',
  [
    executionItem(1001, 1),
    errorItem(2001, 'npm ERR! code ERESOLVE\nnpm ERR! Could not resolve dependency: peer react@18'),
    jobItem(2001),
    stepItem(2001, 2),
  ]
);

const partialEvidence = evidence(
  'mock-diag-partial',
  '1001:1',
  'partial',
  'Workflow run 1001 attempt 1 failed: 1 failed job(s), 1 error excerpt(s) collected. Evidence is partial; see limitations.',
  [
    executionItem(1001, 1),
    {
      ...errorItem(2001, 'error TS2322: Type string is not assignable to type number'),
      truncation: { truncated: true, originalLength: 4800, returnedLength: 1600, reason: 'log_excerpt_limit' },
    },
    jobItem(2001),
    stepItem(2001, 2),
  ],
  ['logs_unavailable', 'content_truncated']
);

const disabledEvidence = evidence(
  'mock-diag-disabled',
  '1001:1',
  'complete',
  'Workflow run 1001 attempt 1 failed: 1 failed job(s), 1 error excerpt(s) collected.',
  completeEvidence.items
);

const unavailableEvidence = evidence(
  'mock-diag-unavailable',
  '1001:1',
  'unavailable',
  'Evidence unavailable: GitHub did not return the requested workflow run attempt.',
  [],
  ['run_not_found']
);

const collectingEvidence = evidence(
  'mock-diag-collecting',
  '1001:1',
  'complete',
  'Workflow run 1001 attempt 1 failed: 1 failed job(s), 1 error excerpt(s) collected.',
  [
    executionItem(1001, 1),
    errorItem(2001, 'npm ERR! code ERESOLVE\nnpm ERR! Could not resolve dependency: peer react@18'),
    jobItem(2001),
    stepItem(2001, 2),
  ]
);

const secretEvidence = evidence(
  'mock-diag-secrets',
  '1001:1',
  'partial',
  'Workflow run 1001 attempt 1 failed: 1 failed job(s), 1 error excerpt(s) collected.',
  [
    executionItem(1001, 1),
    errorItem(2001, 'Authorization: [REDACTED]\npassword: [REDACTED]\nError: upstream returned 401'),
    jobItem(2001),
    stepItem(2001, 2),
  ],
  ['content_redacted']
);

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
  'diagnostics-complete': statusScenario(
    'diagnostics-complete',
    'One failed workflow with complete diagnostic evidence.',
    [github('mock-diag-complete', 'API build'), cctray('mock-cctray-ok', 'Nightly release')],
    [Status.FAILURE, Status.SUCCESS],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-diag-complete': { status: 'available', evidence: completeEvidence } },
    }
  ),
  'diagnostics-partial': statusScenario(
    'diagnostics-partial',
    'One failed workflow with partial evidence and an inaccessible log.',
    [github('mock-diag-partial', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-diag-partial': { status: 'partial', evidence: partialEvidence } },
    }
  ),
  'diagnostics-unavailable': statusScenario(
    'diagnostics-unavailable',
    'A deleted or inaccessible workflow run.',
    [github('mock-diag-unavailable', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-diag-unavailable': { status: 'unavailable', evidence: unavailableEvidence } },
    }
  ),
  'diagnostics-multiple': statusScenario(
    'diagnostics-multiple',
    'Two independent failed workflows with separate evidence.',
    [github('mock-diag-one', 'API build'), github('mock-diag-two', 'Web build', { repo: 'web' })],
    [Status.FAILURE, Status.FAILURE],
    ['1001:1', '2002:3'],
    {
      enabled: true,
      fixtures: {
        'mock-diag-one': {
          status: 'available',
          evidence: evidence(
            'mock-diag-one',
            '1001:1',
            'complete',
            'Workflow run 1001 attempt 1 failed: 1 failed job(s), 1 error excerpt(s) collected.',
            completeEvidence.items
          ),
        },
        'mock-diag-two': {
          status: 'available',
          evidence: evidence(
            'mock-diag-two',
            '2002:3',
            'complete',
            'Workflow run 2002 attempt 3 failed: 1 failed job(s), 1 error excerpt(s) collected.',
            [
              executionItem(2002, 3),
              errorItem(3001, 'error TS2322: Type string is not assignable to type number'),
              jobItem(3001, 'web-build'),
              stepItem(3001, 2, 'Run unit tests'),
            ]
          ),
        },
      },
    }
  ),
  'diagnostics-unsupported': statusScenario(
    'diagnostics-unsupported',
    'A failed integration without diagnostic support.',
    [sentry('mock-diag-sentry', 'API errors')],
    [Status.FAILURE],
    ['event-9001'],
    { enabled: true, fixtures: {} }
  ),
  'diagnostics-disabled': statusScenario(
    'diagnostics-disabled',
    'A failed workflow while diagnostic collection is disabled.',
    [github('mock-diag-disabled', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: false,
      fixtures: { 'mock-diag-disabled': { status: 'available', evidence: disabledEvidence } },
    }
  ),
  'diagnostics-collecting': statusScenario(
    'diagnostics-collecting',
    'Evidence collection in progress, then available.',
    [github('mock-diag-collecting', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: {
        'mock-diag-collecting': { status: 'available', evidence: collectingEvidence, pollsUntilReady: 4 },
      },
    }
  ),
  'diagnostics-secrets': statusScenario(
    'diagnostics-secrets',
    'Synthetic credential-like content already redacted in evidence.',
    [github('mock-diag-secrets', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-diag-secrets': { status: 'available', evidence: secretEvidence } },
    }
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
    normalizeConfig({
      ...DEFAULT_CONFIG,
      diagnosticsEnabled: scenario.diagnostics?.enabled ?? false,
      observables: normalizeObservables(scenario.observers),
    });
  const diagnosticPolls: Record<string, number> = {};

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
    async getDiagnosticEvidence(observerId: string): Promise<DiagnosticSnapshot> {
      if (!config.diagnosticsEnabled) return { status: 'disabled' };
      const observer = (config.observables || []).find((item) => item.id === observerId);
      if (!observer || observer.type !== 'githubAction') return { status: 'unsupported' };
      const fixture = scenario.diagnostics?.fixtures[observerId];
      if (!fixture) return { status: 'not_collected' };
      const remaining = diagnosticPolls[observerId] ?? fixture.pollsUntilReady ?? 0;
      if (remaining > 0) {
        diagnosticPolls[observerId] = remaining - 1;
        return { status: 'collecting' };
      }
      return {
        status: fixture.status,
        ...(fixture.evidence ? { evidence: fixture.evidence } : {}),
      };
    },
    async recollectDiagnosticEvidence(observerId: string): Promise<void> {
      const fixture = scenario.diagnostics?.fixtures[observerId];
      if (fixture) diagnosticPolls[observerId] = fixture.pollsUntilReady ?? 2;
    },
    async openExternal(url: string): Promise<boolean> {
      return isHttpUrl(url);
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
