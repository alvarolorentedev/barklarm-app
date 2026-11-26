import React, { useEffect, useMemo } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { buildRadiatorModel, isAnalysisCurrent, isEvidenceCurrent } from '../../../core/presentation/radiator';
import { Status } from '../../../types/Status';
import { AnalysisView } from '../../components/Diagnostics/AnalysisView';
import { EvidenceView } from '../../components/Diagnostics/EvidenceView';
import { useAnalysisSnapshot, useDiagnosticSnapshot } from '../../components/Diagnostics/hooks';
import { DiagnosisSetup } from '../../components/radiator/DiagnosisSetup';
import { HandoffSection } from '../../components/radiator/Handoff';
import { failureFacts } from '../../components/radiator/facts';
import { integrationLabel } from '../../components/radiator/integration';
import { STATUS_CLASS, STATUS_LABEL } from '../../components/status';
import { translate } from '../../i18n';
import { client } from '../../rpc-client';
import { useStatus } from '../../status-context';
import { safeExternalUrl } from '../../components/radiator/links';
import { useObservables } from './use-observables';
import { useIssueEndpoint } from './use-issue-endpoint';

export const FailureDetail = () => {
  const { observerId = '' } = useParams();
  const navigate = useNavigate();
  const { states, loading } = useStatus();
  const observables = useObservables();
  const globalIssueEndpoint = useIssueEndpoint();
  const state = states.find((candidate) => candidate.id === observerId);
  const failureKey = state?.error?.id;
  const diagnostic = useDiagnosticSnapshot(observerId, failureKey);
  const evidenceVersion = diagnostic.snapshot?.evidence?.collectedAt;
  const analysis = useAnalysisSnapshot(observerId, failureKey, evidenceVersion);

  const failure = useMemo(() => {
    if (!state || state.status !== Status.FAILURE) return undefined;
    return buildRadiatorModel([state], observables, {
      [observerId]: { evidence: diagnostic.snapshot ?? undefined, analysis: analysis.snapshot ?? undefined },
    }).failures[0];
  }, [state, observables, observerId, diagnostic.snapshot, analysis.snapshot]);

  const focusEvidence = (evidenceId: string) => {
    const target = document.getElementById(`evidence-${evidenceId}`);
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (loading) return;
    const heading = document.querySelector<HTMLElement>(
      '.radiator-detail .page-title, .radiator-resolved h1, .radiator-page .page-title'
    );
    heading?.focus({ preventScroll: true });
  }, [loading, state?.status]);

  const enableDiagnostics = async () => {
    try {
      await client.setStore('diagnosticsEnabled', true);
    } catch {
      return;
    }
    await diagnostic.reload();
    await analysis.reload();
  };

  if (loading && !state) {
    return (
      <div className="page radiator-page">
        <button type="button" className="link-button radiator-back" onClick={() => navigate('/radiator')}>
          <ArrowLeft size={12} aria-hidden="true" /> {translate('Radiator')}
        </button>
        <p className="radiator-loading" role="status">
          {translate('Loading failure…')}
        </p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="page radiator-page">
        <button type="button" className="link-button radiator-back" onClick={() => navigate('/radiator')}>
          <ArrowLeft size={12} aria-hidden="true" /> {translate('Radiator')}
        </button>
        <h1 className="page-title" tabIndex={-1}>
          {translate('Observer not found')}
        </h1>
        <p className="page-description">{translate('It may have been removed or renamed while you were away.')}</p>
      </div>
    );
  }

  if (state.status !== Status.FAILURE) {
    const resolved = state.status === Status.SUCCESS;
    const checking = state.status === Status.CHECKING;
    return (
      <div className="page radiator-page">
        <button type="button" className="link-button radiator-back" onClick={() => navigate('/radiator')}>
          <ArrowLeft size={12} aria-hidden="true" /> {translate('Radiator')}
        </button>
        <div className="radiator-resolved" role="status">
          <span className={`status-pill ${STATUS_CLASS[state.status]}`}>
            <span className="status-pill-dot" aria-hidden="true" />
            {translate(STATUS_LABEL[state.status])}
          </span>
          <h1 tabIndex={-1}>
            {resolved
              ? translate('This failure resolved')
              : checking
                ? translate('Checking this observer')
                : translate('Observer unavailable')}
          </h1>
          <p>
            {resolved
              ? translate('Barklarm discarded the previous diagnosis because the observer is no longer failing.')
              : checking
                ? translate(
                    'Barklarm is checking the source. The previous failure diagnosis is not shown while the status is unknown.'
                  )
                : translate(
                    'Barklarm cannot confirm whether the failure cleared. The previous diagnosis is not shown while the observer is unavailable.'
                  )}
          </p>
          <button type="button" className="button" onClick={() => navigate('/radiator')}>
            {translate('Back to Radiator')}
          </button>
        </div>
      </div>
    );
  }

  if (!failure) return null;

  const typeLabel = integrationLabel(failure.type) || failure.type || '';
  const recommendation = failure.validAnalysis?.recommendations[0];
  const secondary = failure.validAnalysis?.recommendations.slice(1) || [];
  const facts = failureFacts(failure);
  const sourceLabel = typeLabel || failure.validEvidence?.sourceType || translate('Integration');
  const canOpenIssue = Boolean(failure.state.issueEndpoint || globalIssueEndpoint);
  const evidenceSnapshot =
    diagnostic.snapshot && isEvidenceCurrent(state, diagnostic.snapshot)
      ? diagnostic.snapshot
      : diagnostic.snapshot?.evidence
        ? { status: 'unavailable' as const }
        : diagnostic.snapshot;
  const analysisSnapshot =
    analysis.snapshot && isAnalysisCurrent(state, analysis.snapshot)
      ? analysis.snapshot
      : analysis.snapshot?.analysis
        ? { status: 'failed' as const, reason: 'stale' as const }
        : analysis.snapshot;

  return (
    <div className="page radiator-page radiator-detail">
      <button type="button" className="link-button radiator-back" onClick={() => navigate('/radiator')}>
        <ArrowLeft size={12} aria-hidden="true" /> {translate('Radiator')}
      </button>

      <header className="radiator-detail-head">
        <div>
          <h1 className="page-title" tabIndex={-1}>
            {failure.name}
          </h1>
          <div className="radiator-detail-meta">
            <span className={`status-pill ${STATUS_CLASS[Status.FAILURE]}`}>
              <span className="status-pill-dot" aria-hidden="true" />
              {translate('Failed')}
            </span>
            {typeLabel ? <span>{typeLabel}</span> : null}
            {failure.failureId ? (
              <span>
                · {translate('Failure')} {failure.failureId}
              </span>
            ) : null}
          </div>
        </div>
        {safeExternalUrl(failure.link) ? (
          <button
            type="button"
            className="button"
            onClick={() => void client.openExternal(failure.link).catch(() => undefined)}
          >
            {translate('Open source')}
            <ExternalLink size={11} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      {canOpenIssue ? (
        <div className="radiator-detail-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => void client.openIssue(observerId).catch(() => undefined)}
          >
            {translate('Open issue')}
          </button>
        </div>
      ) : null}

      <section className="radiator-detail-section" aria-labelledby="what-happened">
        <h2 id="what-happened">{translate('What happened')}</h2>
        <p className="radiator-detail-lead">{failure.description || translate('The observer reported a failure.')}</p>
        {facts.length > 0 ? (
          <dl className="radiator-facts">
            {facts.map((fact) => (
              <React.Fragment key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </React.Fragment>
            ))}
          </dl>
        ) : null}
      </section>

      {recommendation ? (
        <section className="radiator-detail-section" aria-labelledby="what-next">
          <h2 id="what-next">{translate('What to do next')}</h2>
          <div className="radiator-next-step is-detail">
            <span className="radiator-micro-label">{translate(recommendation.type)}</span>
            <p>{recommendation.description}</p>
            {recommendation.rationale ? <small>{recommendation.rationale}</small> : null}
          </div>
          {secondary.length > 0 ? (
            <details className="radiator-more-steps">
              <summary>
                {translate('More next steps')} ({secondary.length})
              </summary>
              <ul>
                {secondary.map((item, index) => (
                  <li key={`${item.description}-${index}`}>
                    <span className="recommendation-type">{translate(item.type)}</span>
                    <span>{item.description}</span>
                    {item.rationale ? <small>{item.rationale}</small> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      <section className="radiator-detail-section" aria-labelledby="why-happened">
        <h2 id="why-happened">{translate('Why it happened')}</h2>
        <DiagnosisSetup
          failure={failure}
          onEnableDiagnostics={() => void enableDiagnostics()}
          onOpenSettings={() => navigate('/settings#intelligence')}
        />
        <AnalysisView
          snapshot={analysisSnapshot}
          loading={analysis.loading}
          error={analysis.error}
          onRetry={() => void analysis.reload()}
          onReanalyze={() => void analysis.reanalyze()}
          onFocusEvidence={focusEvidence}
          showRecommendations={false}
        />
      </section>

      <EvidenceView
        snapshot={evidenceSnapshot}
        loading={diagnostic.loading}
        error={diagnostic.error}
        onRetry={() => void diagnostic.reload()}
        onRecollect={() => void diagnostic.recollect()}
        onEnableDiagnostics={() => void enableDiagnostics()}
      />

      <HandoffSection
        state={failure.state}
        sourceLabel={sourceLabel}
        evidence={failure.evidence}
        analysis={failure.analysis}
      />
    </div>
  );
};
