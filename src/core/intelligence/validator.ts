import {
  AnalysisCause,
  AnalysisFinding,
  AnalysisRecommendation,
  AnalysisModel,
  DiagnosticAnalysis,
  DiagnosticAnalysisDraft,
  EvidenceSufficiency,
} from '../../types/Intelligence';
import { containsDangerousCommand, containsRecognizableSecret, stripUnsafeText } from '../diagnostics/sanitize';

export type AnalysisValidationInput = {
  observerId: string;
  failureId: string;
  evidenceFingerprint: string;
  promptVersion: string;
  model: AnalysisModel;
  includedEvidenceIds: string[];
  now: () => Date;
};

export type AnalysisValidationResult = { ok: true; analysis: DiagnosticAnalysis } | { ok: false; errors: string[] };

const TOP_LEVEL_KEYS = ['summary', 'findings', 'likelyCauses', 'recommendations', 'evidenceSufficiency', 'uncertainty'];
const CERTAINTY = ['supported', 'hypothesis'];
const RECOMMENDATION_TYPES = ['investigate', 'potential-fix', 'verify'];
const SUFFICIENCY = ['sufficient', 'limited', 'insufficient'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, field: string, max: number, errors: string[]): string {
  if (typeof value !== 'string') {
    errors.push(`${field}_type`);
    return '';
  }
  const trimmed = stripUnsafeText(value).trim();
  if (!trimmed) errors.push(`${field}_empty`);
  if (trimmed.length > max) errors.push(`${field}_length`);
  return trimmed.slice(0, max);
}

function evidenceIds(value: unknown, field: string, included: Set<string>, errors: string[]): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${field}_missing`);
    return [];
  }
  if (value.length > 6) errors.push(`${field}_count`);
  const output: string[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, 6)) {
    if (typeof entry !== 'string') {
      errors.push(`${field}_type`);
      continue;
    }
    const clean = stripUnsafeText(entry);
    if (seen.has(clean)) {
      errors.push(`${field}_duplicate`);
      continue;
    }
    seen.add(clean);
    if (!included.has(clean)) {
      errors.push('unknown_citation');
      continue;
    }
    output.push(clean);
  }
  if (output.length === 0) errors.push(`${field}_no_valid_citation`);
  return output;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: string[], field: string, errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${field}_unknown_key`);
  }
}

function parseFindings(value: unknown, included: Set<string>, errors: string[]): AnalysisFinding[] {
  if (!Array.isArray(value)) {
    errors.push('findings_type');
    return [];
  }
  if (value.length > 8) errors.push('findings_count');
  return value.slice(0, 8).map((entry, index) => {
    if (!isRecord(entry)) {
      errors.push('finding_type');
      return { statement: '', evidenceIds: [] };
    }
    rejectUnknownKeys(entry, ['statement', 'evidenceIds'], 'finding', errors);
    return {
      statement: text(entry.statement, `finding_${index}_statement`, 500, errors),
      evidenceIds: evidenceIds(entry.evidenceIds, `finding_${index}_evidence`, included, errors),
    };
  });
}

function parseCauses(value: unknown, included: Set<string>, errors: string[]): AnalysisCause[] {
  if (!Array.isArray(value)) {
    errors.push('likelyCauses_type');
    return [];
  }
  if (value.length > 5) errors.push('likelyCauses_count');
  return value.slice(0, 5).map((entry, index) => {
    if (!isRecord(entry)) {
      errors.push('likelyCause_type');
      return { description: '', evidenceIds: [], certainty: 'hypothesis' };
    }
    rejectUnknownKeys(entry, ['description', 'evidenceIds', 'certainty'], 'likelyCause', errors);
    const certainty = CERTAINTY.includes(String(entry.certainty))
      ? (entry.certainty as AnalysisCause['certainty'])
      : 'hypothesis';
    if (!CERTAINTY.includes(String(entry.certainty))) errors.push('likelyCause_certainty');
    return {
      description: text(entry.description, `likelyCause_${index}_description`, 500, errors),
      evidenceIds: evidenceIds(entry.evidenceIds, `likelyCause_${index}_evidence`, included, errors),
      certainty,
    };
  });
}

function parseRecommendations(value: unknown, included: Set<string>, errors: string[]): AnalysisRecommendation[] {
  if (!Array.isArray(value)) {
    errors.push('recommendations_type');
    return [];
  }
  if (value.length > 5) errors.push('recommendations_count');
  return value.slice(0, 5).map((entry, index) => {
    if (!isRecord(entry)) {
      errors.push('recommendation_type');
      return { description: '', rationale: '', evidenceIds: [], type: 'investigate' };
    }
    rejectUnknownKeys(entry, ['description', 'rationale', 'evidenceIds', 'type'], 'recommendation', errors);
    const type = RECOMMENDATION_TYPES.includes(String(entry.type))
      ? (entry.type as AnalysisRecommendation['type'])
      : 'investigate';
    if (!RECOMMENDATION_TYPES.includes(String(entry.type))) errors.push('recommendation_kind');
    return {
      description: text(entry.description, `recommendation_${index}_description`, 800, errors),
      rationale: text(entry.rationale, `recommendation_${index}_rationale`, 800, errors),
      evidenceIds: evidenceIds(entry.evidenceIds, `recommendation_${index}_evidence`, included, errors),
      type,
    };
  });
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('missing_json');
  return JSON.parse(withoutFence.slice(start, end + 1));
}

/**
 * Validation is the trust boundary between a probabilistic provider and the UI.
 * A valid citation only proves that an id was supplied; semantic grounding is
 * assessed separately by evaluations.
 */
export function validateAnalysis(raw: string, input: AnalysisValidationInput): AnalysisValidationResult {
  const errors: string[] = [];
  if (typeof raw !== 'string' || raw.length > 20000) {
    return { ok: false, errors: ['response_size'] };
  }
  if (containsRecognizableSecret(raw)) {
    return { ok: false, errors: ['sensitive_output'] };
  }
  if (containsDangerousCommand(raw)) {
    return { ok: false, errors: ['unsafe_output'] };
  }

  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    return { ok: false, errors: ['invalid_json'] };
  }
  if (!isRecord(parsed)) return { ok: false, errors: ['invalid_object'] };
  rejectUnknownKeys(parsed, TOP_LEVEL_KEYS, 'analysis', errors);

  const included = new Set(input.includedEvidenceIds);
  const summary = text(parsed.summary, 'summary', 2000, errors);
  const findings = parseFindings(parsed.findings, included, errors);
  const likelyCauses = parseCauses(parsed.likelyCauses, included, errors);
  const recommendations = parseRecommendations(parsed.recommendations, included, errors);

  const evidenceSufficiency: EvidenceSufficiency = SUFFICIENCY.includes(String(parsed.evidenceSufficiency))
    ? (parsed.evidenceSufficiency as EvidenceSufficiency)
    : 'limited';
  if (!SUFFICIENCY.includes(String(parsed.evidenceSufficiency))) errors.push('evidenceSufficiency_invalid');

  const uncertainty: string[] = [];
  if (!Array.isArray(parsed.uncertainty)) {
    errors.push('uncertainty_type');
  } else {
    if (parsed.uncertainty.length > 5) errors.push('uncertainty_count');
    for (let index = 0; index < Math.min(5, parsed.uncertainty.length); index += 1) {
      const entry = parsed.uncertainty[index];
      if (typeof entry !== 'string') {
        errors.push('uncertainty_entry_type');
        continue;
      }
      const value = stripUnsafeText(entry).trim();
      if (!value) errors.push('uncertainty_entry_empty');
      if (value.length > 300) errors.push('uncertainty_entry_length');
      uncertainty.push(value.slice(0, 300));
    }
  }

  if (evidenceSufficiency === 'sufficient' && findings.length === 0) errors.push('sufficient_without_findings');
  if (evidenceSufficiency === 'insufficient') {
    if (likelyCauses.length > 0) errors.push('insufficient_with_causes');
    if (uncertainty.length === 0) errors.push('insufficient_without_uncertainty');
  }

  if (errors.length > 0) return { ok: false, errors: Array.from(new Set(errors)) };

  const draft: DiagnosticAnalysisDraft = {
    summary,
    findings,
    likelyCauses,
    recommendations,
    evidenceSufficiency,
    uncertainty,
  };

  return {
    ok: true,
    analysis: {
      schemaVersion: 1,
      observerId: input.observerId,
      failureId: input.failureId,
      evidenceFingerprint: input.evidenceFingerprint,
      generatedAt: input.now().toISOString(),
      promptVersion: input.promptVersion,
      model: input.model,
      ...draft,
    },
  };
}
