import React from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { translate } from '../../i18n';
import { AnalysisReason, AnalysisSnapshot, AnalysisStatus } from '../../../types/Intelligence';

const STATUS_LABEL: Record<AnalysisStatus, string> = {
  disabled: 'Intelligence is disabled.',
  waiting_for_evidence: 'Waiting for diagnostic evidence.',
  runtime_unavailable: 'Inference is not available right now.',
  queued: 'Analysis queued.',
  analyzing: 'Analyzing evidence…',
  available: 'Analysis available',
  insufficient_evidence: 'Not enough evidence for a diagnosis.',
  failed: 'Analysis failed.',
};

const REASON_LABEL: Record<AnalysisReason, string> = {
  diagnostics_disabled: 'Enable diagnostic evidence in Settings first.',
  no_evidence: 'No diagnostic evidence has been collected for this failure.',
  evidence_unavailable: 'The source did not return enough usable evidence.',
  model_missing: 'The local model is not installed.',
  runtime_missing: 'The local runtime is not running.',
  runtime_failed: 'The local runtime could not start.',
  unsupported_hardware: 'This computer does not meet the managed runtime requirements.',
  provider_unavailable: 'The inference provider is unavailable.',
  consent_required: 'Review and approve the destination before sending evidence.',
  configuration_invalid: 'The inference configuration is invalid.',
  queue_full: 'Too many analyses are queued. Try again shortly.',
  timeout: 'The analysis timed out.',
  cancelled: 'The analysis was cancelled.',
  invalid_response: 'The model returned a response that failed validation.',
  sensitive_output: 'The response was rejected because it contained credential-like text.',
  unsafe_output: 'The response was rejected because it contained a destructive command.',
  stale: 'The analysis was discarded because the evidence changed.',
};

export function CitationLinks({
  ids,
  onFocusEvidence,
}: {
  ids: string[];
  onFocusEvidence: (evidenceId: string) => void;
}) {
  if (ids.length === 0) return null;
  return (
    <span className="analysis-citations">
      {ids.map((id) => (
        <button
          type="button"
          className="citation-button"
          key={id}
          onClick={() => onFocusEvidence(id)}
          aria-label={`${translate('Show evidence')} ${id}`}
        >
          {id}
        </button>
      ))}
    </span>
  );
}

type AnalysisViewProps = {
  snapshot: AnalysisSnapshot | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onReanalyze: () => void;
  onFocusEvidence: (evidenceId: string) => void;
  showRecommendations?: boolean;
};

export const AnalysisView = ({
  snapshot,
  loading,
  error,
  onRetry,
  onReanalyze,
  onFocusEvidence,
  showRecommendations = true,
}: AnalysisViewProps) => {
  const status = snapshot?.status;
  const analysis = snapshot?.analysis;
  const busy = loading || status === 'queued' || status === 'analyzing';
  const canReanalyze =
    status === 'available' ||
    status === 'insufficient_evidence' ||
    status === 'failed' ||
    status === 'runtime_unavailable';

  return (
    <section className="analysis" aria-label={translate('AI analysis')} aria-busy={busy}>
      <div className="analysis-header">
        <div>
          <h3 className="analysis-title">
            <Sparkles size={14} aria-hidden="true" />
            {translate('AI analysis')}
          </h3>
          <p className="analysis-note">
            {translate('Model interpretation of the evidence above. Verify before acting.')}
          </p>
        </div>
        <div className="button-row">
          {canReanalyze ? (
            <button type="button" className="button analysis-action" onClick={onReanalyze}>
              <RefreshCw size={12} aria-hidden="true" />
              {translate('Analyze again')}
            </button>
          ) : null}
        </div>
      </div>

      {status ? (
        <span
          className={`status-pill analysis-status ${status === 'available' ? 'success' : status === 'failed' ? 'failure' : 'checking'}`}
        >
          <span className="status-pill-dot" aria-hidden="true" />
          {translate(STATUS_LABEL[status])}
        </span>
      ) : null}

      <div className="analysis-body" aria-live="polite">
        {error ? (
          <div className="analysis-error">
            <p className="analysis-message">{translate('Analysis could not be loaded.')}</p>
            <button type="button" className="button analysis-action" onClick={onRetry}>
              {translate('Retry')}
            </button>
          </div>
        ) : null}

        {loading && !snapshot ? (
          <p className="analysis-message" role="status">
            {translate('Loading analysis…')}
          </p>
        ) : null}

        {!loading && status && status !== 'available' ? (
          <p className="analysis-message">
            {snapshot?.reason ? translate(REASON_LABEL[snapshot.reason]) : translate(STATUS_LABEL[status])}
          </p>
        ) : null}

        {!loading && status === 'insufficient_evidence' && !snapshot?.reason ? (
          <p className="analysis-message">{translate('Collect more logs or step details and try again.')}</p>
        ) : null}

        {status === 'available' && analysis ? (
          <>
            <div className="analysis-meta">
              <span>
                {translate('Model')}: {analysis.model.name}
              </span>
              <span>
                {translate('Provider')}: {analysis.model.provider}
              </span>
              {snapshot?.assembly ? (
                <span>
                  {translate('Evidence used')}: {snapshot.assembly.includedEvidenceIds.length}
                  {snapshot.assembly.omittedEvidenceIds.length > 0
                    ? ` / ${snapshot.assembly.includedEvidenceIds.length + snapshot.assembly.omittedEvidenceIds.length}`
                    : ''}
                </span>
              ) : null}
            </div>

            <p className="analysis-summary">{analysis.summary}</p>

            {analysis.findings.length > 0 ? (
              <div className="analysis-group">
                <h4>{translate('Observed findings')}</h4>
                <ul>
                  {analysis.findings.map((finding, index) => (
                    <li key={`${finding.statement}-${index}`}>
                      <span>{finding.statement}</span>
                      <CitationLinks ids={finding.evidenceIds} onFocusEvidence={onFocusEvidence} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {analysis.likelyCauses.length > 0 ? (
              <div className="analysis-group">
                <h4>{translate('Likely causes')}</h4>
                <ul>
                  {analysis.likelyCauses.map((cause, index) => (
                    <li key={`${cause.description}-${index}`}>
                      <span className={`certainty certainty-${cause.certainty}`}>{translate(cause.certainty)}</span>
                      <span>{cause.description}</span>
                      <CitationLinks ids={cause.evidenceIds} onFocusEvidence={onFocusEvidence} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {showRecommendations && analysis.recommendations.length > 0 ? (
              <div className="analysis-group">
                <h4>{translate('Recommended next steps')}</h4>
                <ul>
                  {analysis.recommendations.map((recommendation, index) => (
                    <li key={`${recommendation.description}-${index}`}>
                      <span className="recommendation-type">{translate(recommendation.type)}</span>
                      <span>{recommendation.description}</span>
                      <span className="analysis-rationale">{recommendation.rationale}</span>
                      <CitationLinks ids={recommendation.evidenceIds} onFocusEvidence={onFocusEvidence} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {analysis.uncertainty.length > 0 ? (
              <div className="analysis-group analysis-uncertainty">
                <h4>{translate('Uncertainty')}</h4>
                <ul>
                  {analysis.uncertainty.map((entry, index) => (
                    <li key={`${entry}-${index}`}>{entry}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="analysis-note">
              {translate('Evidence sufficiency')}: {translate(analysis.evidenceSufficiency)}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
};
