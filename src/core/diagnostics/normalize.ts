import {
  DiagnosticCompleteness,
  DiagnosticEvidence,
  DiagnosticLimits,
  EvidenceCategory,
  EvidenceDraft,
  EvidenceItem,
  EvidenceSource,
  EvidenceTruncation,
} from '../../types/Diagnostics';
import { sanitizeText } from './sanitize';

export type NormalizeEvidenceOptions = {
  observerId: string;
  failureId: string;
  sourceType: string;
  now: () => Date;
  limits: DiagnosticLimits;
  knownSecrets: string[];
};

const CATEGORIES: EvidenceCategory[] = ['execution', 'job', 'step', 'error', 'log'];
const LIMITATION = /^[a-z0-9_:-]{1,64}$/;
const EVIDENCE_ID = /^[A-Za-z0-9_.:-]{1,120}$/;
const METADATA_KEY = /^[A-Za-z0-9_.-]{1,64}$/;
const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|app[_-]?key|auth[_-]?key|access[_-]?key)/i;

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password) return undefined;
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function category(value: unknown): EvidenceCategory | undefined {
  return CATEGORIES.includes(value as EvidenceCategory) ? (value as EvidenceCategory) : undefined;
}

function truncation(value: unknown): EvidenceTruncation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<EvidenceTruncation>;
  if (candidate.truncated !== true) return undefined;
  return {
    truncated: true,
    originalLength: Number.isFinite(candidate.originalLength) ? Number(candidate.originalLength) : 0,
    returnedLength: Number.isFinite(candidate.returnedLength) ? Number(candidate.returnedLength) : 0,
    reason: typeof candidate.reason === 'string' ? candidate.reason.slice(0, 64) : 'unknown',
  };
}

function source(value: unknown, knownSecrets: string[], limitations: Set<string>): EvidenceSource | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<EvidenceSource>;
  const url = httpUrl(candidate.url);
  if (!url) {
    limitations.add('invalid_source_url');
    return undefined;
  }
  const label = candidate.label === undefined ? undefined : sanitizeText(String(candidate.label), knownSecrets);
  if (label?.redacted) limitations.add('content_redacted');
  return { url, ...(label ? { label: label.text.slice(0, 200) } : {}) };
}

function metadata(
  value: unknown,
  knownSecrets: string[],
  limitations: Set<string>
): Record<string, string | number | boolean> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const output: Record<string, string | number | boolean> = {};
  let keys = 0;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!METADATA_KEY.test(key)) continue;
    if (keys >= 20) {
      limitations.add('metadata_truncated');
      break;
    }
    if (typeof child === 'string') {
      if (SECRET_KEY.test(key)) {
        output[key] = '[REDACTED]';
        limitations.add('content_redacted');
      } else {
        const sanitized = sanitizeText(child, knownSecrets);
        if (sanitized.redacted) limitations.add('content_redacted');
        output[key] = sanitized.text.slice(0, 500);
      }
      keys += 1;
    } else if (typeof child === 'number' && Number.isFinite(child)) {
      output[key] = child;
      keys += 1;
    } else if (typeof child === 'boolean') {
      output[key] = child;
      keys += 1;
    }
  }
  return keys > 0 ? output : undefined;
}

/**
 * Converts a bounded provider draft into the final envelope. Sanitization happens
 * before truncation so a secret cannot survive by being cut in half.
 */
export function normalizeEvidence(draft: EvidenceDraft, options: NormalizeEvidenceOptions): DiagnosticEvidence {
  const limitations = new Set<string>();
  const items: EvidenceItem[] = [];
  const seen = new Set<string>();
  let total = 0;
  let dropped = false;
  let redacted = false;
  const rawItems = Array.isArray(draft?.items) ? draft.items : [];

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      limitations.add('invalid_evidence_item');
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!EVIDENCE_ID.test(id)) {
      limitations.add('invalid_evidence_id');
      continue;
    }
    if (seen.has(id)) {
      limitations.add('duplicate_evidence_id');
      continue;
    }
    const itemCategory = category(raw.category);
    if (!itemCategory) {
      limitations.add('invalid_evidence_category');
      continue;
    }
    if (items.length >= options.limits.maxItems) {
      limitations.add('items_truncated');
      dropped = true;
      break;
    }

    const title = sanitizeText(String(raw.title ?? ''), options.knownSecrets);
    const content = sanitizeText(String(raw.content ?? ''), options.knownSecrets);
    redacted = redacted || title.redacted || content.redacted;

    let text = content.text;
    let itemTruncation = truncation(raw.truncation);
    if (text.length > options.limits.maxItemChars) {
      itemTruncation = {
        truncated: true,
        originalLength: text.length,
        returnedLength: options.limits.maxItemChars,
        reason: 'item_limit',
      };
      text = text.slice(0, options.limits.maxItemChars);
      limitations.add('content_truncated');
      dropped = true;
    }

    const remaining = options.limits.maxEvidenceChars - total;
    if (remaining <= 0) {
      limitations.add('evidence_truncated');
      dropped = true;
      break;
    }
    if (text.length > remaining) {
      itemTruncation = {
        truncated: true,
        originalLength: text.length,
        returnedLength: remaining,
        reason: 'evidence_limit',
      };
      text = text.slice(0, remaining);
      limitations.add('evidence_truncated');
      dropped = true;
    }
    total += text.length;

    const itemSource = source(raw.source, options.knownSecrets, limitations);
    const itemMetadata = metadata(raw.metadata, options.knownSecrets, limitations);
    const sanitizedTimestamp =
      typeof raw.timestamp === 'string' && raw.timestamp.trim()
        ? sanitizeText(raw.timestamp, options.knownSecrets)
        : undefined;
    if (sanitizedTimestamp?.redacted) limitations.add('content_redacted');
    const timestamp = sanitizedTimestamp?.text.slice(0, 64);
    if (title.text.length > 200) limitations.add('title_truncated');

    items.push({
      id,
      category: itemCategory,
      title: title.text.slice(0, 200),
      content: text,
      ...(itemSource ? { source: itemSource } : {}),
      ...(timestamp ? { timestamp } : {}),
      ...(itemMetadata ? { metadata: itemMetadata } : {}),
      ...(itemTruncation ? { truncation: itemTruncation } : {}),
    });
    seen.add(id);
  }

  for (const limitation of Array.isArray(draft?.limitations) ? draft.limitations : []) {
    if (typeof limitation === 'string' && LIMITATION.test(limitation)) limitations.add(limitation);
  }

  const summary = sanitizeText(String(draft?.summary ?? ''), options.knownSecrets);
  if (summary.redacted || limitations.has('content_redacted')) redacted = true;
  if (redacted) limitations.add('content_redacted');

  let completeness: DiagnosticCompleteness =
    draft?.completeness === 'complete' || draft?.completeness === 'partial' || draft?.completeness === 'unavailable'
      ? draft.completeness
      : 'partial';
  if (
    draft?.completeness !== 'complete' &&
    draft?.completeness !== 'partial' &&
    draft?.completeness !== 'unavailable'
  ) {
    limitations.add('invalid_completeness');
  }
  if (completeness === 'complete' && (dropped || redacted || limitations.size > 0)) completeness = 'partial';
  if (completeness === 'unavailable' && items.length > 0) {
    completeness = 'partial';
    limitations.add('inconsistent_completeness');
  }
  if (items.length === 0) completeness = 'unavailable';

  return {
    schemaVersion: 1,
    observerId: options.observerId,
    failureId: options.failureId,
    sourceType: options.sourceType,
    collectedAt: options.now().toISOString(),
    completeness,
    summary: summary.text.slice(0, 400) || 'Evidence collected.',
    items,
    limitations: Array.from(limitations),
  };
}
