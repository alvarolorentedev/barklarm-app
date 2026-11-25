import { DiagnosticEvidence } from '../../types/Diagnostics';

/**
 * A failed job and step without a log or error excerpt cannot support a
 * diagnosis. Avoiding inference here is both cheaper and more honest than
 * asking a model to guess.
 */
export function hasDiagnosticSignal(evidence: DiagnosticEvidence): boolean {
  return (evidence.items || []).some(
    (item) => (item.category === 'error' || item.category === 'log') && String(item.content || '').trim().length > 0
  );
}

export function canAnalyzeEvidence(evidence: DiagnosticEvidence): boolean {
  return evidence.completeness !== 'unavailable' && hasDiagnosticSignal(evidence);
}
