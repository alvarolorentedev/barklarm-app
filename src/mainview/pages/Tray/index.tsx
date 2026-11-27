import React, { useMemo } from 'react';
import { ArrowLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { buildRadiatorModel } from '../../../core/presentation/radiator';
import { Status } from '../../../types/Status';
import { useAnalysisSnapshot, useDiagnosticSnapshot } from '../../components/Diagnostics/hooks';
import { DiagnosisSetup } from '../../components/radiator/DiagnosisSetup';
import { HandoffCopyButton, HandoffSection } from '../../components/radiator/Handoff';
import { AllObserversList } from '../../components/radiator/AllObserversList';
import { StatusSummary } from '../../components/radiator/StatusSummary';
import { failureFacts } from '../../components/radiator/facts';
import { integrationLabel } from '../../components/radiator/integration';
import { safeExternalUrl } from '../../components/radiator/links';
import { STATUS_CLASS, STATUS_LABEL } from '../../components/status';
import { useTrayActions } from '../../components/TrayShell';
import { translate } from '../../i18n';
import { client } from '../../rpc-client';
import { useStatus } from '../../status-context';
import { useObservables } from '../Radiator/use-observables';
import { useIssueEndpoint } from '../Radiator/use-issue-endpoint';

const TrayFooter = ({ primary, onPrimary, onQuit }: { primary: string; onPrimary: () => void; onQuit: () => void }) => (
  <footer className="tray-footer">
    <button type="button" className="button primary" onClick={onPrimary}>
      {primary}
    </button>
    <span className="tray-footer-spacer" />
    <button type="button" className="tray-footer-link" onClick={onQuit}>
      {translate('Quit')}
    </button>
  </footer>
);

export const TrayRadiator = () => {
  const { states, loading } = useStatus();
  const observables = useObservables();
  const navigate = useNavigate();
  const actions = useTrayActions();

  const model = useMemo(() => buildRadiatorModel(states, observables), [states, observables]);

  if (loading && states.length === 0) {
    return (
      <div className="tray-page">
        <div className="tray-scroll">
          <div className="tray-content">
            <p className="tray-message" role="status">
              {translate('Checking your observers…')}
            </p>
          </div>
        </div>
        <TrayFooter
          primary={translate('Open Barklarm')}
          onPrimary={() => void actions.openMain('/radiator')}
          onQuit={() => void actions.quit()}
        />
      </div>
    );
  }

  if (model.health === 'empty') {
    return (
      <div className="tray-page">
        <div className="tray-scroll">
          <div className="tray-content">
            <div className="tray-empty">
              <span className="tray-empty-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </span>
              <h1>{translate('No observers yet')}</h1>
              <p>{translate('Add a source to see its status here and in your menu bar.')}</p>
              <p className="tray-note">{translate('GitHub Actions is the best first source. AI is optional.')}</p>
            </div>
          </div>
        </div>
        <TrayFooter
          primary={translate('Add observer')}
          onPrimary={() => void actions.openMain('/observers')}
          onQuit={() => void actions.quit()}
        />
      </div>
    );
  }

  return (
    <div className="tray-page">
      <div className="tray-scroll">
        <div className="tray-content">
          <StatusSummary summary={model.summary} compact />

          <div className="tray-section-head">
            <span className="tray-section-title">{translate('All observers')}</span>
            <span className="tray-section-count">
              {model.summary.total} {translate('configured')}
            </span>
          </div>
          <AllObserversList
            compact
            observers={model.observers}
            onOpenFailure={(observerId) => navigate(`/tray/observer/${encodeURIComponent(observerId)}`)}
          />
        </div>
      </div>
      <TrayFooter
        primary={translate('Open Barklarm')}
        onPrimary={() => void actions.openMain('/radiator')}
        onQuit={() => void actions.quit()}
      />
    </div>
  );
};

function useTrayFailure(observerId: string) {
  const { states } = useStatus();
  const globalIssueEndpoint = useIssueEndpoint();
  const observables = useObservables();
  const state = states.find((candidate) => candidate.id === observerId);
  const diagnostic = useDiagnosticSnapshot(observerId, state?.error?.id);
  const evidenceVersion = diagnostic.snapshot?.evidence?.collectedAt;
  const analysis = useAnalysisSnapshot(observerId, state?.error?.id, evidenceVersion);
  const failure = useMemo(() => {
    if (!state || state.status !== Status.FAILURE) return undefined;
    return buildRadiatorModel([state], observables, {
      [observerId]: { evidence: diagnostic.snapshot ?? undefined, analysis: analysis.snapshot ?? undefined },
    }).failures[0];
  }, [state, observables, observerId, diagnostic.snapshot, analysis.snapshot]);
  return { state, failure, diagnostic, analysis, globalIssueEndpoint };
}

export const TrayFailureDetail = () => {
  const { observerId = '' } = useParams();
  const navigate = useNavigate();
  const actions = useTrayActions();
  const { state, failure, diagnostic, analysis, globalIssueEndpoint } = useTrayFailure(observerId);

  const back = () => navigate('/tray');
  const openFull = (): void => {
    void actions.openMain(`/radiator/observer/${encodeURIComponent(observerId)}`);
  };

  if (!state) {
    return (
      <div className="tray-page">
        <div className="tray-scroll">
          <div className="tray-content">
            <button type="button" className="tray-back" onClick={back}>
              <ArrowLeft size={10} aria-hidden="true" /> {translate('Radiator')}
            </button>
            <p className="tray-message">{translate('Observer not found.')}</p>
          </div>
        </div>
        <TrayFooter
          primary={translate('Open Barklarm')}
          onPrimary={() => void actions.openMain('/radiator')}
          onQuit={() => void actions.quit()}
        />
      </div>
    );
  }

  if (state.status !== Status.FAILURE || !failure) {
    const resolved = state.status === Status.SUCCESS;
    const checking = state.status === Status.CHECKING;
    return (
      <div className="tray-page">
        <div className="tray-scroll">
          <div className="tray-content">
            <button type="button" className="tray-back" onClick={back}>
              <ArrowLeft size={10} aria-hidden="true" /> {translate('Radiator')}
            </button>
            <div className="tray-resolved" role="status">
              <span className={`status-pill ${STATUS_CLASS[state.status]}`}>
                <span className="status-pill-dot" aria-hidden="true" />
                {translate(STATUS_LABEL[state.status])}
              </span>
              <h1>
                {resolved
                  ? translate('This failure resolved')
                  : checking
                    ? translate('Checking this observer')
                    : translate('Observer unavailable')}
              </h1>
              <p>
                {resolved
                  ? translate('The previous diagnosis was discarded because the observer is no longer failing.')
                  : checking
                    ? translate('The previous failure diagnosis is not shown while the source is still checking.')
                    : translate(
                        'Barklarm cannot confirm whether the failure cleared while the observer is unavailable.'
                      )}
              </p>
            </div>
          </div>
        </div>
        <TrayFooter
          primary={translate('Open Barklarm')}
          onPrimary={() => void actions.openMain('/radiator')}
          onQuit={() => void actions.quit()}
        />
      </div>
    );
  }

  const typeLabel = integrationLabel(failure.type) || failure.type || '';
  const sourceLabel = typeLabel || failure.validEvidence?.sourceType || translate('Integration');
  const recommendation = failure.validAnalysis?.recommendations[0];
  const cause = failure.validAnalysis?.likelyCauses[0];
  const facts = failureFacts(failure);

  const enableDiagnostics = async () => {
    try {
      await client.setStore('diagnosticsEnabled', true);
    } catch {
      return;
    }
    await diagnostic.reload();
    await analysis.reload();
  };

  return (
    <div className="tray-page">
      <div className="tray-scroll">
        <div className="tray-content">
          <button type="button" className="tray-back" onClick={back}>
            <ArrowLeft size={10} aria-hidden="true" /> {translate('Radiator')}
          </button>
          <h1 className="tray-detail-name">{failure.name}</h1>
          <div className="tray-detail-meta">
            <span className="status-pill failure">
              <span className="status-pill-dot" aria-hidden="true" />
              {translate('Failed')}
            </span>
            {typeLabel ? <span>{typeLabel}</span> : null}
            {failure.failureId ? <span>· {failure.failureId}</span> : null}
            {failure.muted ? <span className="radiator-muted-chip">{translate('Muted')}</span> : null}
          </div>

          <section className="tray-section">
            <h2>{translate('What happened')}</h2>
            <p>{failure.description || translate('The observer reported a failure.')}</p>
            {facts.length > 0 ? (
              <dl className="tray-facts">
                {facts.slice(0, 4).map((fact) => (
                  <React.Fragment key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </React.Fragment>
                ))}
              </dl>
            ) : null}
          </section>

          <section className="tray-section">
            <h2>{translate('Why it happened')}</h2>
            {cause ? (
              <div className="tray-cause">
                <span className={`certainty certainty-${cause.certainty}`}>{translate(cause.certainty)}</span>
                <span>{cause.description}</span>
              </div>
            ) : failure.validAnalysis?.summary ? (
              <p>{failure.validAnalysis.summary}</p>
            ) : analysis.snapshot?.status === 'queued' || analysis.snapshot?.status === 'analyzing' ? (
              <p>{translate('Analyzing evidence…')}</p>
            ) : analysis.snapshot?.status === 'waiting_for_evidence' ? (
              <p>{translate('Waiting for diagnostic evidence.')}</p>
            ) : analysis.snapshot?.status === 'insufficient_evidence' ? (
              <p>{translate('Not enough evidence for a diagnosis.')}</p>
            ) : analysis.snapshot?.status === 'failed' ? (
              <p>{translate('Analysis failed. Open full details to retry.')}</p>
            ) : analysis.snapshot?.status === 'available' ? (
              <p>{translate('Analysis available. Open full details for findings and citations.')}</p>
            ) : null}
            <DiagnosisSetup
              failure={failure}
              onEnableDiagnostics={() => void enableDiagnostics()}
              onOpenSettings={() => void actions.openMain('/settings#intelligence')}
            />
          </section>

          <section className="tray-section">
            <h2>{translate('What to do next')}</h2>
            {recommendation ? (
              <div className="radiator-next-step is-detail">
                <span className="radiator-micro-label">{translate(recommendation.type)}</span>
                <p>{recommendation.description}</p>
              </div>
            ) : (
              <p>
                {failure.evidenceStatus === 'disabled'
                  ? translate('Turn on diagnostic evidence to collect facts for this failure.')
                  : failure.evidenceStatus === 'collecting' ||
                      failure.evidenceStatus === 'queued' ||
                      failure.evidenceStatus === 'not_collected'
                    ? translate('Barklarm is collecting evidence. A recommendation will appear when it is ready.')
                    : failure.evidenceStatus === 'unsupported'
                      ? translate(
                          'This source does not provide detailed evidence. Open the source for the failure details.'
                        )
                      : failure.evidenceStatus === 'unavailable' || failure.evidenceStatus === 'failed'
                        ? translate(
                            'Evidence is not available. Open the source or collect again from the full details.'
                          )
                        : translate('No recommendation is available. Open the full details.')}
              </p>
            )}
            <div className="tray-actions">
              <HandoffCopyButton
                state={failure.state}
                sourceLabel={sourceLabel}
                evidence={failure.evidence}
                analysis={failure.analysis}
                label={translate('Copy agent prompt')}
                className="button primary"
              />
              {failure.evidence ? (
                <button
                  type="button"
                  className="tray-footer-link"
                  onClick={() => navigate(`/tray/handoff/${encodeURIComponent(observerId)}`)}
                >
                  {translate('Preview prompt')}
                  <ChevronRight size={10} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </section>

          {failure.state.issueEndpoint || globalIssueEndpoint ? (
            <div className="tray-actions">
              <button
                type="button"
                className="tray-footer-link"
                onClick={() => void client.openIssue(observerId).catch(() => undefined)}
              >
                {translate('Open issue')}
              </button>
            </div>
          ) : null}

          {safeExternalUrl(failure.link) ? (
            <button
              type="button"
              className="tray-source-link"
              onClick={() => void client.openExternal(failure.link).catch(() => undefined)}
            >
              {translate('Open source')} <ExternalLink size={9} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <TrayFooter primary={translate('Open full details')} onPrimary={openFull} onQuit={() => void actions.quit()} />
    </div>
  );
};

export const TrayHandoff = () => {
  const { observerId = '' } = useParams();
  const navigate = useNavigate();
  const actions = useTrayActions();
  const { failure } = useTrayFailure(observerId);

  const openFull = (): void => {
    void actions.openMain(`/radiator/observer/${encodeURIComponent(observerId)}`);
  };

  return (
    <div className="tray-page">
      <div className="tray-scroll">
        <div className="tray-content">
          <button
            type="button"
            className="tray-back"
            onClick={() => navigate(`/tray/observer/${encodeURIComponent(observerId)}`)}
          >
            <ArrowLeft size={10} aria-hidden="true" /> {failure?.name || translate('Radiator')}
          </button>
          {failure ? (
            <HandoffSection
              state={failure.state}
              sourceLabel={integrationLabel(failure.type) || failure.type || translate('Integration')}
              evidence={failure.evidence}
              analysis={failure.analysis}
              defaultOpen
            />
          ) : (
            <p className="tray-message">{translate('Evidence is not available for this failure.')}</p>
          )}
        </div>
      </div>
      <TrayFooter primary={translate('Open in app')} onPrimary={openFull} onQuit={() => void actions.quit()} />
    </div>
  );
};
