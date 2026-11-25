/**
 * Diagnostic evidence is deliberately separate from State. It describes what a
 * source reported about a failure; it is not operational status and not analysis.
 */
export type DiagnosticCompleteness = 'complete' | 'partial' | 'unavailable';

export type EvidenceCategory = 'execution' | 'job' | 'step' | 'error' | 'log';

export type EvidenceSource = {
  url: string;
  label?: string;
};

export type EvidenceTruncation = {
  truncated: true;
  originalLength: number;
  returnedLength: number;
  reason: string;
};

export type EvidenceItem = {
  /** Stable within one envelope so future analysis can cite it. */
  id: string;
  category: EvidenceCategory;
  title: string;
  content: string;
  source?: EvidenceSource;
  timestamp?: string;
  metadata?: Record<string, string | number | boolean>;
  truncation?: EvidenceTruncation;
};

export type DiagnosticEvidence = {
  schemaVersion: number;
  observerId: string;
  failureId: string;
  sourceType: string;
  collectedAt: string;
  completeness: DiagnosticCompleteness;
  summary: string;
  items: EvidenceItem[];
  limitations: string[];
};

export type EvidenceDraft = {
  completeness: DiagnosticCompleteness;
  summary: string;
  items: EvidenceItem[];
  limitations: string[];
};

export type FailureReference = {
  observerId: string;
  sourceType: string;
  failureId: string;
  link: string;
};

export type DiagnosticLimits = {
  maxResponseBytes: number;
  maxJobPages: number;
  jobsPerPage: number;
  maxFailedJobs: number;
  maxLogRequests: number;
  maxItemChars: number;
  maxEvidenceChars: number;
  maxItems: number;
  requestTimeoutMs: number;
  collectionTimeoutMs: number;
  retryCount: number;
  concurrency: number;
  cacheMaxEntries: number;
  cacheTtlMs: number;
};

export type EvidenceCollectionOptions = {
  signal: AbortSignal;
  limits: DiagnosticLimits;
};

export interface DiagnosticProvider {
  readonly sourceType: string;
  collectEvidence(failure: FailureReference, options: EvidenceCollectionOptions): Promise<EvidenceDraft>;
}

export type DiagnosticStatus =
  | 'unsupported'
  | 'disabled'
  | 'not_collected'
  | 'queued'
  | 'collecting'
  | 'available'
  | 'partial'
  | 'unavailable'
  | 'failed';

export type DiagnosticSnapshot = {
  status: DiagnosticStatus;
  evidence?: DiagnosticEvidence;
};
