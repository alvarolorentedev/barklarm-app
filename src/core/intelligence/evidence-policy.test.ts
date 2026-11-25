import { describe, expect, it } from 'vitest';
import { DiagnosticEvidence } from '../../types/Diagnostics';
import { canAnalyzeEvidence, hasDiagnosticSignal } from './evidence-policy';

function evidence(overrides: Partial<DiagnosticEvidence> = {}): DiagnosticEvidence {
  return {
    schemaVersion: 1,
    observerId: 'observer',
    failureId: 'run:1',
    sourceType: 'githubAction',
    collectedAt: '2026-01-15T12:00:00.000Z',
    completeness: 'complete',
    summary: 'failed',
    items: [],
    limitations: [],
    ...overrides,
  };
}

describe('evidence policy', () => {
  it('requires a non-empty error or log item', () => {
    expect(hasDiagnosticSignal(evidence())).toBe(false);
    expect(
      hasDiagnosticSignal(evidence({ items: [{ id: 'error:1', category: 'error', title: '', content: '  ' }] }))
    ).toBe(false);
    expect(
      hasDiagnosticSignal(evidence({ items: [{ id: 'log:1', category: 'log', title: '', content: 'boom' }] }))
    ).toBe(true);
    expect(
      hasDiagnosticSignal(evidence({ items: [{ id: 'job:1', category: 'job', title: '', content: 'failed' }] }))
    ).toBe(false);
  });

  it('rejects empty evidence and unavailable evidence without items', () => {
    expect(canAnalyzeEvidence(evidence())).toBe(false);
    expect(canAnalyzeEvidence(evidence({ completeness: 'unavailable' }))).toBe(false);
  });

  it('does not analyze unavailable evidence even when an item exists', () => {
    expect(
      canAnalyzeEvidence(
        evidence({
          completeness: 'unavailable',
          items: [{ id: 'error:1', category: 'error', title: 'Error', content: 'boom' }],
        })
      )
    ).toBe(false);
    expect(
      canAnalyzeEvidence(
        evidence({
          completeness: 'partial',
          items: [{ id: 'error:1', category: 'error', title: 'Error', content: 'boom' }],
        })
      )
    ).toBe(true);
  });
});
