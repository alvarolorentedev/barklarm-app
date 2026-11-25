import { DiagnosticEvidence } from '../../types/Diagnostics';

/**
 * Stable, synchronous fingerprint. This is a cache identity, not a security
 * primitive: integrity of downloaded artifacts uses SHA-256 in the native layer.
 */
export function hashString(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193) >>> 0;
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b) >>> 0;
  }
  return first.toString(16).padStart(8, '0') + second.toString(16).padStart(8, '0');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) output[key] = canonical(child);
    }
    return output;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

/**
 * Collection time and source links are intentionally excluded: the same
 * evidence content must not trigger a new inference merely because it was
 * collected again or linked to a different UI page.
 */
export function evidenceFingerprint(evidence: DiagnosticEvidence): string {
  const items = (evidence.items || []).map((item) => {
    const copy = { ...item } as Record<string, unknown>;
    delete copy.source;
    return copy;
  });
  return hashString(
    canonicalJson({
      schemaVersion: evidence.schemaVersion,
      observerId: evidence.observerId,
      failureId: evidence.failureId,
      sourceType: evidence.sourceType,
      completeness: evidence.completeness,
      summary: evidence.summary,
      limitations: [...(evidence.limitations || [])].sort(),
      items,
    })
  );
}

export type AnalysisCacheIdentity = {
  observerId: string;
  failureId: string;
  evidenceFingerprint: string;
  provider: string;
  model: string;
  promptVersion: string;
  contextWindow: number;
  maxOutputTokens: number;
  temperature: number;
};

export function analysisCacheKey(identity: AnalysisCacheIdentity): string {
  return hashString(
    canonicalJson({
      observerId: identity.observerId,
      failureId: identity.failureId,
      evidenceFingerprint: identity.evidenceFingerprint,
      provider: identity.provider,
      model: identity.model,
      promptVersion: identity.promptVersion,
      contextWindow: identity.contextWindow,
      maxOutputTokens: identity.maxOutputTokens,
      temperature: identity.temperature,
    })
  );
}
