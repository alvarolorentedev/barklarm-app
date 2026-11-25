import { describe, expect, it } from 'vitest';
import { DiagnosticLimits, EvidenceDraft } from '../../types/Diagnostics';
import { DIAGNOSTIC_LIMITS } from './limits';
import { normalizeEvidence } from './normalize';

const now = () => new Date('2026-01-15T12:00:00.000Z');
const limits: DiagnosticLimits = {
  ...DIAGNOSTIC_LIMITS,
  maxItemChars: 20,
  maxEvidenceChars: 40,
  maxItems: 3,
};

function draft(overrides: Partial<EvidenceDraft> = {}): EvidenceDraft {
  return {
    completeness: 'complete',
    summary: 'Workflow failed.',
    items: [{ id: 'execution', category: 'execution', title: 'Execution', content: 'run 1 failed' }],
    limitations: [],
    ...overrides,
  };
}

function normalize(value: EvidenceDraft, knownSecrets: string[] = []) {
  return normalizeEvidence(value, {
    observerId: 'observer-1',
    failureId: '1:2',
    sourceType: 'githubAction',
    now,
    limits,
    knownSecrets,
  });
}

describe('normalizeEvidence', () => {
  it('stamps the envelope identity and clock', () => {
    expect(normalize(draft())).toMatchObject({
      schemaVersion: 1,
      observerId: 'observer-1',
      failureId: '1:2',
      sourceType: 'githubAction',
      collectedAt: '2026-01-15T12:00:00.000Z',
      completeness: 'complete',
    });
  });

  it('sanitizes content and records redaction', () => {
    const token = `ghp_${'B'.repeat(24)}`;
    const evidence = normalize(
      draft({ items: [{ id: 'log:1', category: 'log', title: 'Log', content: `Authorization: Bearer ${token}` }] }),
      [token]
    );

    expect(JSON.stringify(evidence)).not.toContain(token);
    expect(evidence.limitations).toContain('content_redacted');
    expect(evidence.completeness).toBe('partial');
  });

  it('truncates oversized items and downgrades completeness', () => {
    const evidence = normalize(
      draft({ items: [{ id: 'log:1', category: 'log', title: 'Long', content: 'x'.repeat(30) }] })
    );

    expect(evidence.items[0].content).toHaveLength(20);
    expect(evidence.items[0].truncation).toMatchObject({ reason: 'item_limit', originalLength: 30 });
    expect(evidence.limitations).toContain('content_truncated');
    expect(evidence.completeness).toBe('partial');
  });

  it('enforces the total evidence size', () => {
    const evidence = normalize(
      draft({
        items: [
          { id: 'a', category: 'log', title: 'A', content: 'a'.repeat(20) },
          { id: 'b', category: 'log', title: 'B', content: 'b'.repeat(20) },
          { id: 'c', category: 'log', title: 'C', content: 'c'.repeat(20) },
        ],
      })
    );

    expect(evidence.items).toHaveLength(2);
    expect(evidence.limitations).toContain('evidence_truncated');
    expect(evidence.completeness).toBe('partial');
  });

  it('drops duplicate, invalid and unknown items', () => {
    const evidence = normalize(
      draft({
        items: [
          { id: 'execution', category: 'execution', title: 'One', content: '1' },
          { id: 'execution', category: 'execution', title: 'Two', content: '2' },
          { id: '', category: 'log', title: 'Bad', content: 'bad' },
          { id: 'x', category: 'unknown' as any, title: 'Bad', content: 'bad' },
        ],
      })
    );

    expect(evidence.items).toHaveLength(1);
    expect(evidence.limitations).toEqual(
      expect.arrayContaining(['duplicate_evidence_id', 'invalid_evidence_id', 'invalid_evidence_category'])
    );
  });

  it('rejects non-HTTP source links, URL credentials and invalid limitations', () => {
    const evidence = normalize(
      draft({
        items: [
          {
            id: 'job:1',
            category: 'job',
            title: 'Job',
            content: 'failed',
            source: { url: 'javascript:alert(1)' },
          },
          {
            id: 'job:2',
            category: 'job',
            title: 'Job 2',
            content: 'failed',
            source: { url: 'https://user:pass@example.test/job/2' },
          },
        ],
        limitations: ['logs_unavailable', 'not a code!', 'UPPER'],
      })
    );

    expect(evidence.items[0].source).toBeUndefined();
    expect(evidence.items[1].source).toBeUndefined();
    expect(evidence.limitations).toContain('invalid_source_url');
    expect(evidence.limitations).toContain('logs_unavailable');
    expect(evidence.limitations).not.toContain('not a code!');
    expect(evidence.limitations).not.toContain('UPPER');
  });

  it('never presents unavailable evidence with items as unavailable', () => {
    const evidence = normalize(draft({ completeness: 'unavailable' }));

    expect(evidence.completeness).toBe('partial');
    expect(evidence.limitations).toContain('inconsistent_completeness');
  });

  it('returns unavailable when there is nothing to show', () => {
    const evidence = normalize(draft({ completeness: 'complete', items: [] }));

    expect(evidence.completeness).toBe('unavailable');
    expect(evidence.items).toEqual([]);
  });

  it('keeps bounded metadata and strips unsafe values', () => {
    const evidence = normalize(
      draft({
        items: [
          {
            id: 'job:1',
            category: 'job',
            title: 'Job',
            content: 'failed',
            metadata: {
              jobId: 12,
              conclusion: 'failure',
              enabled: true,
              ignored: { nested: true },
              'bad key': 'x',
              token: 'secret-value',
            } as any,
          },
        ],
      })
    );

    expect(evidence.items[0].metadata).toEqual({
      jobId: 12,
      conclusion: 'failure',
      enabled: true,
      token: '[REDACTED]',
    });
  });

  it('caps metadata keys', () => {
    const metadata = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`k${index}`, `v${index}`]));
    const evidence = normalize(
      draft({ items: [{ id: 'job:1', category: 'job', title: 'Job', content: 'failed', metadata }] })
    );

    expect(Object.keys(evidence.items[0].metadata || {})).toHaveLength(20);
    expect(evidence.limitations).toContain('metadata_truncated');
  });

  it('preserves valid source truncation and rejects malformed shapes', () => {
    const evidence = normalize(
      draft({
        items: [
          {
            id: 'log:1',
            category: 'log',
            title: 'Log',
            content: 'partial',
            source: { url: 'not a url', label: 'unsafe label' },
            truncation: { truncated: true, originalLength: 100, returnedLength: 40, reason: 'source_limit' },
          },
          {
            id: 'log:2',
            category: 'log',
            title: 'Log 2',
            content: 'partial',
            truncation: { truncated: false } as any,
          },
        ],
      })
    );

    expect(evidence.items[0].truncation).toEqual({
      truncated: true,
      originalLength: 100,
      returnedLength: 40,
      reason: 'source_limit',
    });
    expect(evidence.items[0].source).toBeUndefined();
    expect(evidence.limitations).toContain('invalid_source_url');
    expect(evidence.items[1].truncation).toBeUndefined();
  });

  it('truncates to the remaining envelope size instead of only dropping items', () => {
    const evidence = normalizeEvidence(
      draft({
        items: [
          { id: 'a', category: 'log', title: 'A', content: 'a'.repeat(8) },
          { id: 'b', category: 'log', title: 'B', content: 'b'.repeat(8) },
        ],
      }),
      {
        observerId: 'observer-1',
        failureId: '1:2',
        sourceType: 'githubAction',
        now,
        limits: { ...limits, maxEvidenceChars: 10 },
        knownSecrets: [],
      }
    );

    expect(evidence.items).toHaveLength(2);
    expect(evidence.items[1].content).toHaveLength(2);
    expect(evidence.items[1].truncation).toMatchObject({ reason: 'evidence_limit' });
    expect(evidence.limitations).toContain('evidence_truncated');
  });

  it('caps the item count', () => {
    const capped = normalizeEvidence(
      {
        ...draft(),
        items: [
          { id: 'a', category: 'log', title: 'A', content: 'a' },
          { id: 'b', category: 'log', title: 'B', content: 'b' },
        ],
      },
      {
        observerId: 'observer-1',
        failureId: '1:2',
        sourceType: 'githubAction',
        now,
        limits: { ...limits, maxItems: 1 },
        knownSecrets: [],
      }
    );

    expect(capped.items).toHaveLength(1);
    expect(capped.limitations).toContain('items_truncated');
  });

  it('skips malformed items and invalid completeness values', () => {
    const evidence = normalize({
      completeness: 'unknown' as any,
      summary: 'summary',
      items: [
        null as any,
        { id: 12, category: 'log', title: 'Bad', content: 'x' } as any,
        { id: 'ok', category: 'log', title: 'Good', content: 'x' },
      ],
      limitations: [],
    });

    expect(evidence.items).toHaveLength(1);
    expect(evidence.completeness).toBe('partial');
    expect(evidence.limitations).toEqual(
      expect.arrayContaining(['invalid_evidence_item', 'invalid_evidence_id', 'invalid_completeness'])
    );
  });

  it('sanitizes titles, summaries and source labels', () => {
    const token = `ghp_${'D'.repeat(24)}`;
    const evidence = normalize(
      {
        completeness: 'complete',
        summary: `summary ${token}`,
        items: [
          {
            id: 'job:1',
            category: 'job',
            title: `title ${token}`,
            content: 'content',
            source: { url: 'https://example.test/job/1', label: `label ${token}` },
            timestamp: token,
          },
        ],
        limitations: [],
      },
      [token]
    );

    expect(JSON.stringify(evidence)).not.toContain(token);
    expect(evidence.items[0].title.length).toBeLessThan(200);
    expect(evidence.limitations).toContain('content_redacted');
  });
});
