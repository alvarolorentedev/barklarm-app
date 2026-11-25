import { describe, expect, it } from 'vitest';
import { DiagnosticEvidence } from '../../types/Diagnostics';
import { analysisCacheKey, evidenceFingerprint, hashString } from './fingerprint';

const base: DiagnosticEvidence = {
  schemaVersion: 1,
  observerId: 'observer-1',
  failureId: 'run-1:1',
  sourceType: 'githubAction',
  collectedAt: '2026-01-15T12:00:00.000Z',
  completeness: 'complete',
  summary: 'Failed.',
  items: [{ id: 'error:1', category: 'error', title: 'Error', content: 'boom' }],
  limitations: [],
};

describe('intelligence fingerprints', () => {
  it('ignores collection time and source links', () => {
    const later = {
      ...base,
      collectedAt: '2026-01-15T13:00:00.000Z',
      items: [{ ...base.items[0], source: { url: 'https://example.test/run' } }],
    };
    expect(evidenceFingerprint(base)).toBe(evidenceFingerprint(later));
  });

  it('changes when evidence content changes', () => {
    const changed = { ...base, items: [{ ...base.items[0], content: 'different' }] };
    expect(evidenceFingerprint(base)).not.toBe(evidenceFingerprint(changed));
  });

  it('changes when the failure identity changes', () => {
    expect(evidenceFingerprint({ ...base, failureId: 'run-2:1' })).not.toBe(evidenceFingerprint(base));
  });

  it('excludes credentials from the cache identity shape', () => {
    const identity = {
      observerId: 'observer-1',
      failureId: 'run-1:1',
      evidenceFingerprint: evidenceFingerprint(base),
      provider: 'openai-compatible',
      model: 'qwen',
      promptVersion: 'v1',
      contextWindow: 8192,
      maxOutputTokens: 1024,
      temperature: 0.2,
    };
    expect(analysisCacheKey(identity)).toBe(analysisCacheKey({ ...identity }));
    expect(analysisCacheKey(identity)).not.toBe(analysisCacheKey({ ...identity, model: 'phi' }));
  });

  it('produces stable hex strings', () => {
    expect(hashString('barklarm')).toMatch(/^[0-9a-f]{16}$/);
    expect(hashString('barklarm')).toBe(hashString('barklarm'));
  });
});
