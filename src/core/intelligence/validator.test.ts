import { describe, expect, it } from 'vitest';
import { validateAnalysis, AnalysisValidationInput } from './validator';

const input: AnalysisValidationInput = {
  observerId: 'observer-1',
  failureId: 'run-1:1',
  evidenceFingerprint: 'fingerprint',
  promptVersion: 'diagnostic-analysis-v1',
  model: { provider: 'openai-compatible', name: 'model' },
  includedEvidenceIds: ['error:1', 'job:1'],
  now: () => new Date('2026-01-15T12:00:00.000Z'),
};

const valid = {
  summary: 'The build failed while compiling.',
  findings: [{ statement: 'TypeScript reported TS2322.', evidenceIds: ['error:1'] }],
  likelyCauses: [
    {
      description: 'A string value is assigned to a number property.',
      evidenceIds: ['error:1'],
      certainty: 'supported',
    },
  ],
  recommendations: [
    {
      description: 'Inspect the reported type at the cited line.',
      rationale: 'The compiler identifies the mismatch.',
      evidenceIds: ['error:1'],
      type: 'investigate',
    },
  ],
  evidenceSufficiency: 'sufficient',
  uncertainty: [] as string[],
};

function validate(value: unknown) {
  return validateAnalysis(typeof value === 'string' ? value : JSON.stringify(value), input);
}

describe('analysis validator', () => {
  it('accepts a schema-valid response and stamps identity', () => {
    const result = validate(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.observerId).toBe('observer-1');
    expect(result.analysis.evidenceFingerprint).toBe('fingerprint');
    expect(result.analysis.generatedAt).toBe('2026-01-15T12:00:00.000Z');
  });

  it('accepts a fenced JSON object', () => {
    const result = validate('```json\n' + JSON.stringify(valid) + '\n```');
    expect(result.ok).toBe(true);
  });

  it('rejects unknown or omitted citations', () => {
    const result = validate({
      ...valid,
      findings: [{ statement: 'Invented.', evidenceIds: ['error:99'] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    expect((result as { ok: false; errors: string[] }).errors).toContain('unknown_citation');
  });

  it('rejects duplicate citations and invalid enums', () => {
    const result = validate({
      ...valid,
      findings: [{ statement: 'Duplicate.', evidenceIds: ['error:1', 'error:1'] }],
      likelyCauses: [{ ...valid.likelyCauses[0], certainty: 'certain' }],
      recommendations: [{ ...valid.recommendations[0], type: 'auto-fix' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    expect((result as { ok: false; errors: string[] }).errors).toContain('finding_0_evidence_duplicate');
    expect((result as { ok: false; errors: string[] }).errors).toContain('likelyCause_certainty');
    expect((result as { ok: false; errors: string[] }).errors).toContain('recommendation_kind');
  });

  it('rejects extra fields and oversized values', () => {
    const result = validate({
      ...valid,
      extra: true,
      summary: 'x'.repeat(2001),
      findings: [{ statement: 'y'.repeat(501), evidenceIds: ['error:1'] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    expect((result as { ok: false; errors: string[] }).errors).toContain('analysis_unknown_key');
    expect((result as { ok: false; errors: string[] }).errors).toContain('summary_length');
    expect((result as { ok: false; errors: string[] }).errors).toContain('finding_0_statement_length');
  });

  it('rejects insufficient evidence with forced causes', () => {
    const result = validate({
      ...valid,
      evidenceSufficiency: 'insufficient',
      likelyCauses: valid.likelyCauses,
      uncertainty: [] as string[],
    });
    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    expect((result as { ok: false; errors: string[] }).errors).toContain('insufficient_with_causes');
    expect((result as { ok: false; errors: string[] }).errors).toContain('insufficient_without_uncertainty');
  });

  it('accepts a useful uncertainty response without causes', () => {
    const result = validate({
      ...valid,
      evidenceSufficiency: 'insufficient',
      likelyCauses: [],
      recommendations: [
        {
          description: 'Collect the missing job log.',
          rationale: 'The failure cause is not observable.',
          evidenceIds: ['job:1'],
          type: 'investigate',
        },
      ],
      uncertainty: ['The log is unavailable.'],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects recognizable secrets in model output', () => {
    const result = validate({
      ...valid,
      summary: 'Use token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
    });
    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    expect((result as { ok: false; errors: string[] }).errors).toContain('sensitive_output');
  });

  it('strips control and bidi characters from displayed text', () => {
    const result = validate({ ...valid, summary: 'safe\u202Etext' });
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.analysis.summary).toBe('safetext');
  });

  it('rejects destructive commands in model output', () => {
    const result = validate({
      ...valid,
      recommendations: [
        {
          description: 'Run rm -rf / to clean the workspace.',
          rationale: 'The log suggested it.',
          evidenceIds: ['error:1'],
          type: 'potential-fix',
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    expect((result as { ok: false; errors: string[] }).errors).toContain('unsafe_output');
  });

  it('reports missing, wrongly typed and oversized collections', () => {
    const result = validate({
      summary: 42,
      findings: 'nope',
      likelyCauses: {},
      recommendations: [],
      evidenceSufficiency: 'certain',
      uncertainty: [1, '', 'x'.repeat(301)],
    });
    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    const errors = (result as { ok: false; errors: string[] }).errors;
    expect(errors).toContain('summary_type');
    expect(errors).toContain('findings_type');
    expect(errors).toContain('likelyCauses_type');
    expect(errors).toContain('evidenceSufficiency_invalid');
    expect(errors).toContain('uncertainty_entry_type');
    expect(errors).toContain('uncertainty_entry_empty');
    expect(errors).toContain('uncertainty_entry_length');
  });

  it('rejects malformed array entries and excessive counts', () => {
    const result = validate({
      ...valid,
      findings: Array.from({ length: 9 }, () => null),
      likelyCauses: Array.from({ length: 6 }, () => null),
      recommendations: Array.from({ length: 6 }, () => null),
      uncertainty: Array.from({ length: 6 }, () => 'u'),
    });
    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    const errors = (result as { ok: false; errors: string[] }).errors;
    expect(errors).toContain('findings_count');
    expect(errors).toContain('finding_type');
    expect(errors).toContain('likelyCauses_count');
    expect(errors).toContain('likelyCause_type');
    expect(errors).toContain('recommendations_count');
    expect(errors).toContain('recommendation_type');
    expect(errors).toContain('uncertainty_count');
  });

  it('rejects sufficient evidence without findings', () => {
    const result = validate({ ...valid, findings: [] });
    expect(result.ok).toBe(false);
    if (result.ok === true) return;
    expect((result as { ok: false; errors: string[] }).errors).toContain('sufficient_without_findings');
  });

  it('rejects malformed and oversized responses', () => {
    expect(validate('not json').ok).toBe(false);
    expect(validate('x'.repeat(21000)).ok).toBe(false);
    expect(validate([]).ok).toBe(false);
  });
});
