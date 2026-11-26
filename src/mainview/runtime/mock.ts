import { BarklarmConfig, DEFAULT_CONFIG, normalizeConfig, normalizeObservables } from '../../core/config';
import { normalizeIntelligenceMode, normalizeIntelligenceProvider } from '../../core/config';
import { destinationFingerprint, validateEndpoint } from '../../core/intelligence/endpoint-policy';
import { isHttpUrl } from '../../core/issue';
import { DiagnosticCompleteness, DiagnosticEvidence, DiagnosticSnapshot, EvidenceItem } from '../../types/Diagnostics';
import {
  AnalysisSnapshot,
  CustomProviderConfig,
  DiagnosticAnalysis,
  HardwareReport,
  IntelligenceMode,
  IntelligenceStatus,
  ManagedRuntimeEndpoint,
  ModelDownloadStatus,
  ModelInfo,
  ProviderTestInput,
  ProviderTestResult,
  RuntimeStatus,
} from '../../types/Intelligence';
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

export type MockAnalysisFixture = {
  snapshot: AnalysisSnapshot;
  /** Number of status reads that report queued/analyzing before settling. */
  pollsUntilReady?: number;
};

export type MockIntelligence = {
  mode: IntelligenceMode;
  provider?: CustomProviderConfig;
  modelInstalled?: boolean;
  modelStatus?: ModelInfo['status'];
  runtime?: RuntimeStatus;
  hardware?: HardwareReport;
  download?: ModelDownloadStatus;
  analyses?: Record<string, MockAnalysisFixture>;
  providerKey?: string;
  destinationApproved?: boolean;
};

export type MockScenario = {
  name: string;
  description: string;
  observers: ObserverConfiguration[];
  stateFor: (config: ObserverConfiguration, index: number) => State;
  diagnostics?: MockDiagnostics;
  intelligence?: MockIntelligence;
};

export const MOCK_STORAGE_PREFIX = 'barklarm.mock.v1';
const DIAGNOSTIC_TIME = '2026-01-15T12:00:00.000Z';

export const MOCK_MODEL: ModelInfo = {
  id: 'mock-qwen3-1.7b-q4',
  displayName: 'Qwen3 1.7B Instruct (Q4_K_M)',
  version: 'mock-v1',
  quantization: 'Q4_K_M',
  fileName: 'mock-qwen3-1.7b-q4.gguf',
  sizeBytes: 1107409472,
  sha256: 'b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897',
  license: 'Apache-2.0',
  licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  contextLength: 32768,
  recommendedContext: 8192,
  minRamGb: 8,
  recommendedRamGb: 16,
  runtimeMinBuild: 12732,
  installed: false,
  status: 'not_installed',
};

export const MOCK_HARDWARE: HardwareReport = {
  os: 'macOS',
  arch: 'arm64',
  totalMemoryBytes: 17179869184,
  availableMemoryBytes: 8589934592,
  freeDiskBytes: 34359738368,
  cpuCount: 8,
  platformRecognized: true,
  runtimeArtifactAvailable: true,
  hardwareRequirementsMet: true,
  modelInstalled: false,
  runtimeOperational: false,
  releaseQualified: true,
  managedRuntimeSupported: true,
  managedInferenceAvailable: false,
};

function mockModel(status: ModelInfo['status'] = 'not_installed'): ModelInfo {
  return { ...MOCK_MODEL, status, installed: status === 'installed' };
}

function mockDownload(status: ModelDownloadStatus['status'] = 'idle', received = 0): ModelDownloadStatus {
  return {
    modelId: MOCK_MODEL.id,
    status,
    receivedBytes: received,
    totalBytes: MOCK_MODEL.sizeBytes,
  };
}

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
  diagnostics?: MockDiagnostics,
  intelligence?: MockIntelligence
): MockScenario {
  return {
    name,
    description,
    observers,
    stateFor: (config, index) => buildState(config, statuses[index] ?? Status.SUCCESS, errorIds[index]),
    diagnostics,
    intelligence,
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

function jobItem(jobId: number, name = 'build', conclusion = 'failure', runId = 1001): EvidenceItem {
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
      `URL: https://github.com/acme/api/actions/runs/${runId}/job/${jobId}`,
    ].join('\n'),
    source: { url: `https://github.com/acme/api/actions/runs/${runId}/job/${jobId}`, label: name },
    timestamp: '2026-01-15T10:00:10Z',
    metadata: { jobId, conclusion },
  };
}

function stepItem(jobId: number, stepNumber: number, name = 'Run tests', runId = 1001): EvidenceItem {
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
    source: { url: `https://github.com/acme/api/actions/runs/${runId}/job/${jobId}`, label: name },
    timestamp: '2026-01-15T10:01:00Z',
    metadata: { jobId, stepNumber, conclusion: 'failure' },
  };
}

function errorItem(jobId: number, text: string, runId = 1001): EvidenceItem {
  return {
    id: `error:${jobId}:0`,
    category: 'error',
    title: 'Error excerpt from build',
    content: text,
    source: { url: `https://github.com/acme/api/actions/runs/${runId}/job/${jobId}`, label: 'build' },
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

function aiEvidence(observerId: string, failureId = '1001:1'): DiagnosticEvidence {
  return evidence(
    observerId,
    failureId,
    'complete',
    'Workflow run 1001 attempt 1 failed: 1 failed job(s), 1 error excerpt(s) collected.',
    completeEvidence.items
  );
}

function aiAnalysis(observerId: string, failureId = '1001:1'): DiagnosticAnalysis {
  return {
    schemaVersion: 1,
    observerId,
    failureId,
    evidenceFingerprint: 'mock-fingerprint',
    generatedAt: '2026-01-15T12:01:00.000Z',
    promptVersion: 'diagnostic-analysis-v1',
    model: { provider: 'managed', name: MOCK_MODEL.displayName, version: 'mock-v1' },
    summary: 'The build failed while installing dependencies: npm could not resolve react@18 as a peer dependency.',
    findings: [
      {
        statement: 'The dependency installation step reported ERESOLVE for react@18.',
        evidenceIds: ['error:2001:0'],
      },
      {
        statement: 'The build job and its test step ended in failure.',
        evidenceIds: ['job:2001', 'step:2001:2'],
      },
    ],
    likelyCauses: [
      {
        description: 'The project dependency graph contains a react peer-dependency conflict.',
        evidenceIds: ['error:2001:0'],
        certainty: 'supported',
      },
    ],
    recommendations: [
      {
        description: 'Inspect the package.json and lockfile for conflicting react versions.',
        rationale: 'The error identifies an unresolved react@18 peer dependency.',
        evidenceIds: ['error:2001:0'],
        type: 'investigate',
      },
      {
        description: 'Reinstall dependencies with a compatible react version and verify the lockfile.',
        rationale: 'A resolved dependency graph should remove the ERESOLVE failure.',
        evidenceIds: ['error:2001:0', 'step:2001:2'],
        type: 'potential-fix',
      },
    ],
    evidenceSufficiency: 'sufficient',
    uncertainty: [],
  };
}

function aiAvailable(observerId: string, failureId = '1001:1'): AnalysisSnapshot {
  const analysis = aiAnalysis(observerId, failureId);
  return {
    status: 'available',
    analysis,
    assembly: {
      includedEvidenceIds: ['error:2001:0', 'step:2001:2', 'job:2001', 'execution'],
      omittedEvidenceIds: [],
      truncatedEvidenceIds: [],
      originalChars: 900,
      includedChars: 900,
      estimatedTokens: 300,
      budgetTokens: 500,
    },
    provider: 'managed',
    model: MOCK_MODEL.displayName,
    updatedAt: analysis.generatedAt,
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
              errorItem(3001, 'error TS2322: Type string is not assignable to type number', 2002),
              jobItem(3001, 'web-build', 'failure', 2002),
              stepItem(3001, 2, 'Run unit tests', 2002),
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
      fixtures: { 'mock-diag-secrets': { status: 'partial', evidence: secretEvidence } },
    }
  ),
  'intelligence-disabled': statusScenario(
    'intelligence-disabled',
    'Diagnostic evidence is available while intelligence remains disabled.',
    [github('mock-ai-disabled', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-ai-disabled': { status: 'available', evidence: aiEvidence('mock-ai-disabled') } },
    },
    { mode: 'disabled' }
  ),
  'intelligence-model-missing': statusScenario(
    'intelligence-model-missing',
    'Built-in intelligence is selected but the model is not installed.',
    [github('mock-ai-model-missing', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-ai-model-missing': { status: 'available', evidence: aiEvidence('mock-ai-model-missing') } },
    },
    {
      mode: 'managed',
      analyses: {
        'mock-ai-model-missing': {
          snapshot: { status: 'runtime_unavailable', reason: 'model_missing' },
        },
      },
    }
  ),
  'intelligence-downloading': statusScenario(
    'intelligence-downloading',
    'The managed model is downloading with progress and cancellation available.',
    [github('mock-ai-downloading', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: {
        'mock-ai-downloading': { status: 'available', evidence: aiEvidence('mock-ai-downloading') },
      },
    },
    {
      mode: 'managed',
      download: mockDownload('downloading', 276852368),
      analyses: {
        'mock-ai-downloading': { snapshot: { status: 'runtime_unavailable', reason: 'model_missing' } },
      },
    }
  ),
  'intelligence-download-failed': statusScenario(
    'intelligence-download-failed',
    'A managed model download failed and can be retried.',
    [github('mock-ai-download-failed', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: {
        'mock-ai-download-failed': { status: 'available', evidence: aiEvidence('mock-ai-download-failed') },
      },
    },
    {
      mode: 'managed',
      download: { ...mockDownload('failed'), error: 'checksum_mismatch' },
      modelStatus: 'error',
      analyses: {
        'mock-ai-download-failed': { snapshot: { status: 'runtime_unavailable', reason: 'model_missing' } },
      },
    }
  ),
  'intelligence-ready': statusScenario(
    'intelligence-ready',
    'The verified model is installed and the managed runtime is ready.',
    [github('mock-ai-ready', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-ai-ready': { status: 'available', evidence: aiEvidence('mock-ai-ready') } },
    },
    {
      mode: 'managed',
      modelInstalled: true,
      download: mockDownload('installed'),
      runtime: { state: 'ready', version: 'b12732', modelId: MOCK_MODEL.id, idleTimeoutMs: 300000 },
      analyses: { 'mock-ai-ready': { snapshot: aiAvailable('mock-ai-ready') } },
    }
  ),
  'intelligence-runtime-starting': statusScenario(
    'intelligence-runtime-starting',
    'The managed runtime is starting before an analysis runs.',
    [github('mock-ai-starting', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-ai-starting': { status: 'available', evidence: aiEvidence('mock-ai-starting') } },
    },
    {
      mode: 'managed',
      modelInstalled: true,
      download: mockDownload('installed'),
      runtime: { state: 'starting', modelId: MOCK_MODEL.id, idleTimeoutMs: 300000 },
      analyses: {
        'mock-ai-starting': { snapshot: aiAvailable('mock-ai-starting'), pollsUntilReady: 3 },
      },
    }
  ),
  'intelligence-analyzing': statusScenario(
    'intelligence-analyzing',
    'Analysis is queued and running, then becomes available.',
    [github('mock-ai-analyzing', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-ai-analyzing': { status: 'available', evidence: aiEvidence('mock-ai-analyzing') } },
    },
    {
      mode: 'managed',
      modelInstalled: true,
      download: mockDownload('installed'),
      runtime: { state: 'ready', version: 'b12732', modelId: MOCK_MODEL.id, idleTimeoutMs: 300000 },
      analyses: {
        'mock-ai-analyzing': { snapshot: aiAvailable('mock-ai-analyzing'), pollsUntilReady: 4 },
      },
    }
  ),
  'intelligence-complete': statusScenario(
    'intelligence-complete',
    'A complete, validated diagnosis with cited evidence and recommendations.',
    [github('mock-ai-complete', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-ai-complete': { status: 'available', evidence: aiEvidence('mock-ai-complete') } },
    },
    {
      mode: 'managed',
      modelInstalled: true,
      download: mockDownload('installed'),
      runtime: { state: 'ready', version: 'b12732', modelId: MOCK_MODEL.id, idleTimeoutMs: 300000 },
      analyses: { 'mock-ai-complete': { snapshot: aiAvailable('mock-ai-complete') } },
    }
  ),
  'intelligence-insufficient': statusScenario(
    'intelligence-insufficient',
    'The failure is visible but the evidence is insufficient for a diagnosis.',
    [github('mock-ai-insufficient', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: {
        'mock-ai-insufficient': { status: 'available', evidence: aiEvidence('mock-ai-insufficient') },
      },
    },
    {
      mode: 'managed',
      modelInstalled: true,
      download: mockDownload('installed'),
      runtime: { state: 'ready', version: 'b12732', modelId: MOCK_MODEL.id, idleTimeoutMs: 300000 },
      analyses: {
        'mock-ai-insufficient': {
          snapshot: { status: 'insufficient_evidence', reason: 'evidence_unavailable' },
        },
      },
    }
  ),
  'intelligence-invalid-response': statusScenario(
    'intelligence-invalid-response',
    'The model returned invalid output, so no diagnosis is displayed.',
    [github('mock-ai-invalid', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-ai-invalid': { status: 'available', evidence: aiEvidence('mock-ai-invalid') } },
    },
    {
      mode: 'managed',
      modelInstalled: true,
      download: mockDownload('installed'),
      runtime: { state: 'ready', version: 'b12732', modelId: MOCK_MODEL.id, idleTimeoutMs: 300000 },
      analyses: {
        'mock-ai-invalid': { snapshot: { status: 'failed', reason: 'invalid_response' } },
      },
    }
  ),
  'intelligence-provider-unavailable': statusScenario(
    'intelligence-provider-unavailable',
    'A custom provider is configured but cannot be reached.',
    [github('mock-ai-provider', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-ai-provider': { status: 'available', evidence: aiEvidence('mock-ai-provider') } },
    },
    {
      mode: 'custom',
      provider: {
        endpoint: 'https://inference.example.test/v1',
        model: 'mock-remote-model',
        contextWindow: 8192,
        maxOutputTokens: 1024,
        timeoutMs: 120000,
      },
      destinationApproved: true,
      analyses: {
        'mock-ai-provider': { snapshot: { status: 'runtime_unavailable', reason: 'provider_unavailable' } },
      },
    }
  ),
  'intelligence-remote-consent': statusScenario(
    'intelligence-remote-consent',
    'A remote provider is configured but evidence sending has not been approved.',
    [github('mock-ai-consent', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-ai-consent': { status: 'available', evidence: aiEvidence('mock-ai-consent') } },
    },
    {
      mode: 'custom',
      provider: {
        endpoint: 'https://inference.example.test/v1',
        model: 'mock-remote-model',
        contextWindow: 8192,
        maxOutputTokens: 1024,
        timeoutMs: 120000,
      },
      destinationApproved: false,
      analyses: {
        'mock-ai-consent': { snapshot: { status: 'runtime_unavailable', reason: 'consent_required' } },
      },
    }
  ),
  'intelligence-unsupported-hardware': statusScenario(
    'intelligence-unsupported-hardware',
    'Built-in intelligence cannot run on this synthetic hardware profile.',
    [github('mock-ai-hardware', 'API build')],
    [Status.FAILURE],
    ['1001:1'],
    {
      enabled: true,
      fixtures: { 'mock-ai-hardware': { status: 'available', evidence: aiEvidence('mock-ai-hardware') } },
    },
    {
      mode: 'managed',
      hardware: {
        ...MOCK_HARDWARE,
        totalMemoryBytes: 4294967296,
        availableMemoryBytes: 2147483648,
        platformRecognized: false,
        runtimeArtifactAvailable: false,
        hardwareRequirementsMet: false,
        managedInferenceAvailable: false,
        managedRuntimeSupported: false,
        reason: 'unsupported_platform',
      },
      analyses: {
        'mock-ai-hardware': { snapshot: { status: 'runtime_unavailable', reason: 'unsupported_hardware' } },
      },
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
      intelligenceMode: scenario.intelligence?.mode ?? 'disabled',
      intelligenceProvider: scenario.intelligence?.provider,
      observables: normalizeObservables(scenario.observers),
    });
  const diagnosticPolls: Record<string, number> = {};
  const analysisPolls: Record<string, number> = {};
  let download: ModelDownloadStatus =
    scenario.intelligence?.download ?? mockDownload(scenario.intelligence?.modelInstalled ? 'installed' : 'idle');
  let providerKey = scenario.intelligence?.providerKey;
  let destinationApproved = scenario.intelligence?.destinationApproved ?? false;

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

  const currentModel = (): ModelInfo => {
    if (download.status === 'installed') return mockModel('installed');
    if (download.status === 'downloading') return mockModel('downloading');
    if (download.status === 'verifying') return mockModel('verifying');
    if (download.status === 'failed') return mockModel('error');
    return mockModel(scenario.intelligence?.modelStatus ?? 'not_installed');
  };

  const advanceDownload = (): void => {
    if (download.status !== 'downloading' && download.status !== 'verifying') return;
    if (download.status === 'downloading') {
      const step = Math.max(1, Math.ceil(download.totalBytes / 4));
      const received = Math.min(download.totalBytes, download.receivedBytes + step);
      download =
        received >= download.totalBytes
          ? { ...download, status: 'verifying', receivedBytes: download.totalBytes }
          : { ...download, receivedBytes: received };
      return;
    }
    download = { ...download, status: 'installed' };
  };

  const intelligenceStatus = (): IntelligenceStatus => {
    advanceDownload();
    const mode = normalizeIntelligenceMode(config.intelligenceMode);
    const provider = normalizeIntelligenceProvider(config.intelligenceProvider);
    const validation = validateEndpoint(provider.endpoint);
    const destination = validation.ok ? validation.baseUrl : undefined;
    const consentRequired = validation.ok ? validation.requiresConsent : false;
    return {
      mode,
      model: currentModel(),
      download,
      runtime:
        scenario.intelligence?.runtime ??
        (download.status === 'installed'
          ? { state: 'stopped', modelId: MOCK_MODEL.id, idleTimeoutMs: 300000 }
          : { state: 'stopped', modelId: MOCK_MODEL.id, idleTimeoutMs: 300000 }),
      hardware: scenario.intelligence?.hardware ?? MOCK_HARDWARE,
      providerConfigured: mode === 'custom' && Boolean(provider.endpoint && provider.model),
      providerKeyPresent: Boolean(providerKey),
      destination,
      consentRequired,
      destinationApproved: consentRequired ? destinationApproved : true,
    };
  };

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
      const completeness = fixture.evidence?.completeness;
      const status =
        completeness === 'complete'
          ? 'available'
          : completeness === 'partial'
            ? 'partial'
            : completeness === 'unavailable'
              ? 'unavailable'
              : fixture.status;
      return {
        status,
        ...(fixture.evidence ? { evidence: fixture.evidence } : {}),
      };
    },
    async recollectDiagnosticEvidence(observerId: string): Promise<void> {
      const fixture = scenario.diagnostics?.fixtures[observerId];
      if (fixture) diagnosticPolls[observerId] = fixture.pollsUntilReady ?? 2;
    },

    async getAnalysis(observerId: string): Promise<AnalysisSnapshot> {
      const mode = normalizeIntelligenceMode(config.intelligenceMode);
      if (mode === 'disabled') return { status: 'disabled' };
      if (!config.diagnosticsEnabled) {
        return { status: 'waiting_for_evidence', reason: 'diagnostics_disabled' };
      }
      const fixture = scenario.intelligence?.analyses?.[observerId];
      if (!fixture) return { status: 'waiting_for_evidence' };
      const remaining = analysisPolls[observerId] ?? fixture.pollsUntilReady ?? 0;
      if (remaining > 0) {
        analysisPolls[observerId] = remaining - 1;
        return { status: remaining % 2 === 0 ? 'queued' : 'analyzing' };
      }
      return fixture.snapshot;
    },

    async reanalyze(observerId: string): Promise<void> {
      const fixture = scenario.intelligence?.analyses?.[observerId];
      if (fixture) analysisPolls[observerId] = fixture.pollsUntilReady ?? 2;
    },

    async getIntelligenceStatus(): Promise<IntelligenceStatus> {
      return intelligenceStatus();
    },

    async startModelDownload(): Promise<void> {
      download = mockDownload('downloading');
    },

    async cancelModelDownload(): Promise<void> {
      if (download.status === 'downloading' || download.status === 'verifying') {
        download = { ...download, status: 'cancelled' };
      }
    },

    async removeModel(): Promise<void> {
      download = mockDownload('idle');
    },

    async ensureManagedRuntime(): Promise<ManagedRuntimeEndpoint> {
      return {
        endpoint: 'http://127.0.0.1:9/v1',
        token: 'mock-ephemeral-token',
        model: MOCK_MODEL.id,
      };
    },

    async stopManagedRuntime(): Promise<void> {
      return undefined;
    },

    async getProviderKey(): Promise<string | undefined> {
      return providerKey;
    },

    async setProviderKey(key: string): Promise<void> {
      providerKey = key;
    },

    async deleteProviderKey(): Promise<void> {
      providerKey = undefined;
    },

    async isDestinationApproved(): Promise<boolean> {
      return destinationApproved;
    },

    async approveDestination(): Promise<void> {
      destinationApproved = true;
    },

    async revokeDestination(): Promise<void> {
      destinationApproved = false;
    },

    async testInferenceProvider(input: ProviderTestInput): Promise<ProviderTestResult> {
      const validation = validateEndpoint(input.endpoint);
      if (validation.ok === false) return { ok: false, error: 'configuration' };
      if (validation.requiresConsent) {
        const fingerprint = await destinationFingerprint(validation.baseUrl, input.model);
        if (!destinationApproved) return { ok: false, error: 'consent_required' };
        void fingerprint;
      }
      return { ok: true, models: [input.model] };
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
