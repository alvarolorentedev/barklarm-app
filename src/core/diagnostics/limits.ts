import { DiagnosticLimits } from '../../types/Diagnostics';

/**
 * Conservative defaults. Raising these needs a measured reason and updated tests;
 * see ADR 0008.
 */
export const DIAGNOSTIC_LIMITS: DiagnosticLimits = {
  maxResponseBytes: 2 * 1024 * 1024,
  maxJobPages: 2,
  jobsPerPage: 100,
  maxFailedJobs: 20,
  maxLogRequests: 5,
  maxItemChars: 4000,
  maxEvidenceChars: 20000,
  maxItems: 40,
  requestTimeoutMs: 15000,
  collectionTimeoutMs: 30000,
  retryCount: 1,
  concurrency: 2,
  cacheMaxEntries: 25,
  cacheTtlMs: 30 * 60 * 1000,
};
