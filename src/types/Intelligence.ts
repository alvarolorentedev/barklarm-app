/**
 * Intelligence contracts are deliberately separate from State and
 * DiagnosticEvidence. Analysis is generated interpretation, never operational
 * status and never an outbound webhook field.
 */
export type IntelligenceMode = 'disabled' | 'managed' | 'custom';

export type AnalysisStatus =
  | 'disabled'
  | 'waiting_for_evidence'
  | 'runtime_unavailable'
  | 'queued'
  | 'analyzing'
  | 'available'
  | 'insufficient_evidence'
  | 'failed';

export type AnalysisReason =
  | 'diagnostics_disabled'
  | 'no_evidence'
  | 'evidence_unavailable'
  | 'model_missing'
  | 'runtime_missing'
  | 'runtime_failed'
  | 'unsupported_hardware'
  | 'provider_unavailable'
  | 'consent_required'
  | 'configuration_invalid'
  | 'queue_full'
  | 'timeout'
  | 'cancelled'
  | 'invalid_response'
  | 'sensitive_output'
  | 'unsafe_output'
  | 'stale';

export type AnalysisCertainty = 'supported' | 'hypothesis';

export type RecommendationType = 'investigate' | 'potential-fix' | 'verify';

export type EvidenceSufficiency = 'sufficient' | 'limited' | 'insufficient';

export type AnalysisFinding = {
  statement: string;
  evidenceIds: string[];
};

export type AnalysisCause = {
  description: string;
  evidenceIds: string[];
  certainty: AnalysisCertainty;
};

export type AnalysisRecommendation = {
  description: string;
  rationale: string;
  evidenceIds: string[];
  type: RecommendationType;
};

export type AnalysisModel = {
  provider: string;
  name: string;
  version?: string;
};

export type DiagnosticAnalysis = {
  schemaVersion: number;
  observerId: string;
  failureId: string;
  evidenceFingerprint: string;
  generatedAt: string;
  promptVersion: string;
  model: AnalysisModel;
  summary: string;
  findings: AnalysisFinding[];
  likelyCauses: AnalysisCause[];
  recommendations: AnalysisRecommendation[];
  evidenceSufficiency: EvidenceSufficiency;
  uncertainty: string[];
};

export type AnalysisAssembly = {
  includedEvidenceIds: string[];
  omittedEvidenceIds: string[];
  truncatedEvidenceIds: string[];
  redactedEvidenceIds?: string[];
  originalChars: number;
  includedChars: number;
  estimatedTokens: number;
  budgetTokens: number;
};

export type AnalysisSnapshot = {
  status: AnalysisStatus;
  reason?: AnalysisReason;
  analysis?: DiagnosticAnalysis;
  assembly?: AnalysisAssembly;
  provider?: string;
  model?: string;
  updatedAt?: string;
};

export type DiagnosticAnalysisDraft = {
  summary: string;
  findings: AnalysisFinding[];
  likelyCauses: AnalysisCause[];
  recommendations: AnalysisRecommendation[];
  evidenceSufficiency: EvidenceSufficiency;
  uncertainty: string[];
};

export type CustomProviderConfig = {
  endpoint?: string;
  model?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};

export type InferenceMessage = {
  role: 'system' | 'user';
  content: string;
};

export type InferenceUsage = {
  promptTokens?: number;
  completionTokens?: number;
};

export type InferenceRequest = {
  messages: InferenceMessage[];
  responseSchema: Record<string, unknown>;
  maxOutputTokens: number;
  temperature?: number;
  timeoutMs?: number;
};

export type InferenceResult = {
  text: string;
  model?: string;
  usage?: InferenceUsage;
};

export type InferenceErrorCode =
  | 'cancelled'
  | 'timeout'
  | 'unauthorized'
  | 'rate_limited'
  | 'unavailable'
  | 'invalid_response'
  | 'too_large'
  | 'redirect_rejected'
  | 'consent_required'
  | 'configuration'
  | 'unsupported';

export type StructuredOutputMode = 'json_schema' | 'json_object' | 'prompt-only';

export type ProviderCapabilities = {
  structuredOutput: StructuredOutputMode;
  tokenizer: boolean;
  modelDiscovery: boolean;
};

export type ProviderTestResult = {
  ok: boolean;
  models?: string[];
  error?: InferenceErrorCode;
};

export type InferenceProvider = {
  readonly kind: 'managed' | 'openai-compatible';
  readonly name: string;
  readonly model?: string;
  initialize(signal?: AbortSignal): Promise<void>;
  testConnection(signal?: AbortSignal): Promise<ProviderTestResult>;
  listModels(signal?: AbortSignal): Promise<string[]>;
  capabilities(): ProviderCapabilities;
  infer(request: InferenceRequest, signal: AbortSignal): Promise<InferenceResult>;
  tokenize?(text: string, signal: AbortSignal): Promise<number>;
  dispose(): void | Promise<void>;
};

export class InferenceError extends Error {
  constructor(
    readonly code: InferenceErrorCode,
    message?: string,
    readonly analysisReason?: AnalysisReason
  ) {
    super(message || code);
    this.name = 'InferenceError';
  }
}

export type ModelRuntimeState = 'stopped' | 'starting' | 'ready' | 'failed' | 'unsupported';

export type ModelInfo = {
  id: string;
  displayName: string;
  version: string;
  quantization: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  license: string;
  licenseUrl: string;
  contextLength: number;
  recommendedContext: number;
  minRamGb: number;
  recommendedRamGb: number;
  runtimeMinBuild: number;
  installed: boolean;
  status: 'not_installed' | 'downloading' | 'verifying' | 'installed' | 'corrupted' | 'error';
  path?: string;
  error?: string;
};

export type ModelDownloadStatus = {
  modelId: string;
  status: 'idle' | 'downloading' | 'verifying' | 'installed' | 'failed' | 'cancelled';
  receivedBytes: number;
  totalBytes: number;
  error?: string;
};

export type RuntimeStatus = {
  state: ModelRuntimeState;
  version?: string;
  modelId?: string;
  error?: string;
  idleTimeoutMs?: number;
};

export type HardwareReport = {
  os: string;
  arch: string;
  totalMemoryBytes: number;
  availableMemoryBytes: number;
  freeDiskBytes: number;
  cpuCount: number;
  managedRuntimeSupported: boolean;
  reason?: string;
};

export type IntelligenceStatus = {
  mode: IntelligenceMode;
  model: ModelInfo;
  download: ModelDownloadStatus;
  runtime: RuntimeStatus;
  hardware: HardwareReport;
  providerConfigured: boolean;
  providerKeyPresent: boolean;
  destination?: string;
  consentRequired: boolean;
  destinationApproved: boolean;
};

export type ManagedRuntimeEndpoint = {
  endpoint: string;
  token: string;
  model: string;
};

export type ProviderTestInput = {
  endpoint: string;
  model: string;
  timeoutMs?: number;
};
