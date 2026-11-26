import { DiagnosticEvidence, EvidenceItem } from '../../types/Diagnostics';
import { AnalysisAssembly } from '../../types/Intelligence';
import { redactDangerousCommands, sanitizeText } from '../diagnostics/sanitize';

export const INTELLIGENCE_LIMITS = {
  maxQueue: 4,
  maxCacheEntries: 25,
  cacheTtlMs: 30 * 60 * 1000,
  defaultContextWindow: 8192,
  defaultMaxOutputTokens: 1024,
  defaultTimeoutMs: 120000,
  promptOverheadTokens: 1400,
  safetyTokens: 128,
  charsPerToken: 3,
  maxItemChars: 4000,
  maxItems: 40,
  maxSummaryChars: 400,
  maxLimitations: 20,
  // Must match the managed runtime's effective window.
  minContextWindow: 2048,
  maxContextWindow: 16384,
  minOutputTokens: 256,
  maxOutputTokens: 4096,
  minEvidenceTokens: 256,
};

const METADATA_KEYS = new Set([
  'runId',
  'runAttempt',
  'jobId',
  'stepNumber',
  'conclusion',
  'signal',
  'startLine',
  'endLine',
  'exitCode',
  'command',
  'attempt',
]);

const CATEGORY_PRIORITY: Record<EvidenceItem['category'], number> = {
  error: 0,
  step: 1,
  job: 2,
  execution: 3,
  log: 4,
};

export type ContextAssemblerOptions = {
  contextWindow?: number;
  maxOutputTokens?: number;
  promptOverheadTokens?: number;
  safetyTokens?: number;
  charsPerToken?: number;
  maxItemChars?: number;
  knownSecrets?: string[];
  promptVersion: string;
};

export type AssembledContextPayload = {
  schemaVersion: number;
  observerId: string;
  failureId: string;
  sourceType: string;
  completeness: DiagnosticEvidence['completeness'];
  summary: string;
  limitations: string[];
  items: Array<{
    id: string;
    category: EvidenceItem['category'];
    title: string;
    content: string;
    timestamp?: string;
    metadata?: Record<string, string | number | boolean>;
    truncated?: boolean;
  }>;
};

export type AssembledContext = {
  promptVersion: string;
  payload: AssembledContextPayload;
  assembly: AnalysisAssembly;
};

type Candidate = {
  item: EvidenceItem;
  index: number;
};

function positiveInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export type EffectiveBudget = {
  contextWindow: number;
  maxOutputTokens: number;
  promptOverheadTokens: number;
  safetyTokens: number;
  budgetTokens: number;
};

/**
 * Normalizes a requested context/output pair against the managed runtime's
 * effective window. Impossible pairs are reduced deterministically instead of
 * producing a negative evidence budget.
 */
export function effectiveBudget(
  contextWindow?: number,
  maxOutputTokens?: number,
  promptOverheadTokens?: number,
  safetyTokens?: number
): EffectiveBudget {
  const context = positiveInteger(
    contextWindow,
    INTELLIGENCE_LIMITS.defaultContextWindow,
    INTELLIGENCE_LIMITS.minContextWindow,
    INTELLIGENCE_LIMITS.maxContextWindow
  );
  const overhead = positiveInteger(promptOverheadTokens, INTELLIGENCE_LIMITS.promptOverheadTokens, 0, 4096);
  const safety = positiveInteger(safetyTokens, INTELLIGENCE_LIMITS.safetyTokens, 0, 2048);
  const available = context - overhead - safety;
  const output = Math.min(
    positiveInteger(
      maxOutputTokens,
      INTELLIGENCE_LIMITS.defaultMaxOutputTokens,
      INTELLIGENCE_LIMITS.minOutputTokens,
      INTELLIGENCE_LIMITS.maxOutputTokens
    ),
    Math.max(INTELLIGENCE_LIMITS.minOutputTokens, available - INTELLIGENCE_LIMITS.minEvidenceTokens)
  );
  return {
    contextWindow: context,
    maxOutputTokens: output,
    promptOverheadTokens: overhead,
    safetyTokens: safety,
    budgetTokens: Math.max(INTELLIGENCE_LIMITS.minEvidenceTokens, available - output),
  };
}

function metadataFor(item: EvidenceItem): Record<string, string | number | boolean> | undefined {
  if (!item.metadata) return undefined;
  const output: Record<string, string | number | boolean> = {};
  let count = 0;
  for (const key of Object.keys(item.metadata).sort()) {
    if (!METADATA_KEYS.has(key) || count >= 20) continue;
    const value = item.metadata[key];
    if (typeof value === 'string') {
      output[key] = redactDangerousCommands(value).text.slice(0, 200);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      output[key] = value;
    } else if (typeof value === 'boolean') {
      output[key] = value;
    }
    count += 1;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function normalizeForDedupe(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Deterministic, source-agnostic evidence reduction. It never calls a model, so
 * the same envelope and budget always produce the same context.
 */
export function assembleContext(evidence: DiagnosticEvidence, options: ContextAssemblerOptions): AssembledContext {
  const budget = effectiveBudget(
    options.contextWindow,
    options.maxOutputTokens,
    options.promptOverheadTokens,
    options.safetyTokens
  );
  const charsPerToken = Math.max(2, Number(options.charsPerToken) || INTELLIGENCE_LIMITS.charsPerToken);
  const maxItemChars = positiveInteger(options.maxItemChars, INTELLIGENCE_LIMITS.maxItemChars, 200, 8000);
  const budgetTokens = budget.budgetTokens;
  const budgetChars = Math.max(512, Math.floor(budgetTokens * charsPerToken));

  const candidates: Candidate[] = [];
  const seenContent = new Set<string>();
  const seenIds = new Set<string>();
  let originalChars = 0;

  (evidence.items || []).forEach((item, index) => {
    originalChars += String(item.content || '').length;
    if (seenIds.has(item.id)) return;
    const sanitizedContent = sanitizeText(String(item.content || ''), options.knownSecrets);
    const normalized = normalizeForDedupe(sanitizedContent.text);
    if (!normalized) return;
    const dedupeKey = normalized;
    if (seenContent.has(dedupeKey)) return;
    seenContent.add(dedupeKey);
    seenIds.add(item.id);
    candidates.push({ item, index });
  });

  candidates.sort((left, right) => {
    const priority = CATEGORY_PRIORITY[left.item.category] - CATEGORY_PRIORITY[right.item.category];
    return priority !== 0 ? priority : left.index - right.index;
  });

  const payload: AssembledContextPayload = {
    schemaVersion: evidence.schemaVersion,
    observerId: evidence.observerId,
    failureId: evidence.failureId,
    sourceType: evidence.sourceType,
    completeness: evidence.completeness,
    summary: redactDangerousCommands(
      sanitizeText(String(evidence.summary || ''), options.knownSecrets).text
    ).text.slice(0, INTELLIGENCE_LIMITS.maxSummaryChars),
    limitations: (evidence.limitations || [])
      .slice(0, INTELLIGENCE_LIMITS.maxLimitations)
      .map((limitation) =>
        redactDangerousCommands(sanitizeText(String(limitation), options.knownSecrets).text).text.slice(0, 64)
      ),
    items: [],
  };

  const includedEvidenceIds: string[] = [];
  const omittedEvidenceIds: string[] = [];
  const truncatedEvidenceIds: string[] = [];
  const redactedEvidenceIds: string[] = [];
  let includedChars = 0;
  let stopped = false;

  for (const candidate of candidates) {
    const item = candidate.item;
    const titleResult = redactDangerousCommands(sanitizeText(String(item.title || ''), options.knownSecrets).text);
    const title = titleResult.text.slice(0, 200);
    const contentResult = redactDangerousCommands(sanitizeText(String(item.content || ''), options.knownSecrets).text);
    let content = contentResult.text.slice(0, maxItemChars);
    if (titleResult.redacted || contentResult.redacted) redactedEvidenceIds.push(item.id);
    let truncated = content.length < contentResult.text.length || !!item.truncation;
    const metadata = metadataFor(item);
    const timestamp = item.timestamp
      ? sanitizeText(String(item.timestamp), options.knownSecrets).text.trim().slice(0, 64)
      : undefined;

    const build = () => ({
      id: item.id,
      category: item.category,
      title,
      content,
      ...(timestamp ? { timestamp } : {}),
      ...(metadata ? { metadata } : {}),
      ...(truncated ? { truncated: true } : {}),
    });

    if (stopped) {
      omittedEvidenceIds.push(item.id);
      continue;
    }

    let next = build();
    if (JSON.stringify({ ...payload, items: [...payload.items, next] }).length > budgetChars) {
      const currentLength = JSON.stringify(payload).length;
      const available = Math.max(0, budgetChars - currentLength - 240);
      if (available >= 160) {
        content = content.slice(0, available);
        truncated = true;
        next = build();
      } else {
        omittedEvidenceIds.push(item.id);
        stopped = true;
        continue;
      }
    }

    if (JSON.stringify({ ...payload, items: [...payload.items, next] }).length > budgetChars) {
      omittedEvidenceIds.push(item.id);
      stopped = true;
      continue;
    }

    payload.items.push(next);
    includedEvidenceIds.push(item.id);
    includedChars += content.length;
    if (truncated) truncatedEvidenceIds.push(item.id);
  }

  const includedSet = new Set(includedEvidenceIds);
  for (const item of evidence.items || []) {
    if (!includedSet.has(item.id) && !omittedEvidenceIds.includes(item.id)) omittedEvidenceIds.push(item.id);
  }

  return {
    promptVersion: options.promptVersion,
    payload,
    assembly: {
      includedEvidenceIds,
      omittedEvidenceIds,
      truncatedEvidenceIds,
      redactedEvidenceIds,
      originalChars,
      includedChars,
      estimatedTokens: Math.ceil(JSON.stringify(payload).length / charsPerToken),
      budgetTokens,
    },
  };
}
