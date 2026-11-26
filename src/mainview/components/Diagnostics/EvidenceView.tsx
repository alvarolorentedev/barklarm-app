import React from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { DiagnosticSnapshot, DiagnosticStatus, EvidenceItem } from '../../../types/Diagnostics';
import { translate } from '../../i18n';
import { client } from '../../rpc-client';

const STATUS_LABEL: Record<DiagnosticStatus, string> = {
  unsupported: 'Unsupported',
  disabled: 'Disabled',
  not_collected: 'Not collected',
  queued: 'Queued',
  collecting: 'Collecting',
  available: 'Complete',
  partial: 'Partial',
  unavailable: 'Unavailable',
  failed: 'Collection failed',
};

const STATUS_CLASS: Record<DiagnosticStatus, string> = {
  unsupported: 'idle',
  disabled: 'idle',
  not_collected: 'idle',
  queued: 'checking',
  collecting: 'checking',
  available: 'success',
  partial: 'checking',
  unavailable: 'failure',
  failed: 'failure',
};

const CATEGORY_LABEL: Record<EvidenceItem['category'], string> = {
  execution: 'Execution',
  job: 'Job',
  step: 'Step',
  error: 'Error',
  log: 'Log',
};

const LIMITATION_LABEL: Record<string, string> = {
  auth_failed: 'GitHub rejected the configured credentials.',
  forbidden: 'The configured credentials cannot read this workflow.',
  rate_limited: 'GitHub rate limited the diagnostic request.',
  run_not_found: 'The workflow run was deleted or is inaccessible.',
  run_mismatch: 'The evidence did not match the requested workflow run.',
  run_incomplete: 'The workflow run has not completed.',
  non_failure_conclusion: 'The workflow did not end in a diagnostic failure.',
  jobs_unavailable: 'Job metadata could not be retrieved.',
  logs_unavailable: 'Some job logs could not be retrieved.',
  log_empty: 'A failed job produced an empty log.',
  log_too_large: 'A job log was larger than the collection limit.',
  log_truncated: 'Some log content was truncated.',
  no_error_signal: 'No recognizable error signal was found in the logs.',
  content_truncated: 'Some evidence was truncated.',
  evidence_truncated: 'The evidence envelope reached its size limit.',
  items_truncated: 'Some evidence items were omitted.',
  content_redacted: 'Recognizable credentials were redacted.',
  jobs_truncated: 'Only part of the job list was collected.',
  failed_jobs_truncated: 'Only some failed jobs were collected.',
  log_requests_truncated: 'Log collection stopped at the configured limit.',
  job_steps_unavailable: 'Step metadata was not available for a failed job.',
  redirect_rejected: 'A job log redirect was rejected for safety.',
  invalid_response: 'The source returned an unexpected response.',
  response_too_large: 'The source response was too large.',
  request_failed: 'The source request failed.',
  no_failed_jobs: 'No failed job was returned for the failed run.',
};

export const limitationLabel = (limitation: string): string => translate(LIMITATION_LABEL[limitation] || limitation);

type EvidenceViewProps = {
  snapshot: DiagnosticSnapshot | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onRecollect: () => void;
  onEnableDiagnostics?: () => void;
};

export const EvidenceView = ({
  snapshot,
  loading,
  error,
  onRetry,
  onRecollect,
  onEnableDiagnostics,
}: EvidenceViewProps) => {
  const status = snapshot?.status;
  const canCollect =
    status === 'available' ||
    status === 'partial' ||
    status === 'not_collected' ||
    status === 'unavailable' ||
    status === 'failed';
  const busy = loading || status === 'collecting' || status === 'queued';
  const evidence = snapshot?.evidence;

  return (
    <section className="diagnostics" aria-label={translate('Diagnostic evidence')} aria-busy={busy}>
      <div className="diagnostics-header">
        <div>
          <h3 className="diagnostics-title">{translate('Diagnostic evidence')}</h3>
          <p className="diagnostics-note">{translate('Source evidence, not an AI explanation.')}</p>
        </div>
        {canCollect ? (
          <button type="button" className="button diagnostics-action" onClick={onRecollect}>
            <RefreshCw size={12} aria-hidden="true" />
            {status === 'available' || status === 'partial'
              ? translate('Collect again')
              : translate('Collect evidence')}
          </button>
        ) : null}
      </div>

      {status ? (
        <span className={`status-pill diagnostics-status ${STATUS_CLASS[status]}`}>
          <span className="status-pill-dot" aria-hidden="true" />
          {translate(STATUS_LABEL[status])}
        </span>
      ) : null}

      <div className="diagnostics-body" aria-live="polite">
        {error ? (
          <div className="diagnostics-error">
            <p className="diagnostics-message">{translate('Diagnostic evidence could not be loaded.')}</p>
            <button type="button" className="button diagnostics-action" onClick={onRetry}>
              {translate('Retry')}
            </button>
          </div>
        ) : null}

        {loading && !snapshot ? (
          <p className="diagnostics-message" role="status">
            {translate('Loading diagnostic evidence…')}
          </p>
        ) : null}

        {!loading && status === 'disabled' ? (
          <div className="diagnostics-message">
            <p>{translate('Diagnostics are disabled. Enable them in Settings.')}</p>
            {onEnableDiagnostics ? (
              <button type="button" className="button diagnostics-action" onClick={onEnableDiagnostics}>
                {translate('Turn on diagnostic evidence')}
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading && status === 'unsupported' ? (
          <p className="diagnostics-message">{translate('This integration does not provide diagnostic evidence.')}</p>
        ) : null}

        {!loading && (status === 'collecting' || status === 'queued') ? (
          <p className="diagnostics-message" role="status">
            {translate('Collecting diagnostic evidence…')}
          </p>
        ) : null}

        {!loading && status === 'not_collected' ? (
          <p className="diagnostics-message">{translate('No diagnostic evidence has been collected yet.')}</p>
        ) : null}

        {!loading && status === 'failed' ? (
          <p className="diagnostics-message">{translate('Evidence collection failed.')}</p>
        ) : null}

        {!loading && (status === 'available' || status === 'partial' || status === 'unavailable') ? (
          evidence ? (
            <>
              <p className="diagnostics-summary">{evidence.summary}</p>

              {evidence.limitations.length > 0 ? (
                <div className="diagnostics-limitations">
                  <h4>{translate('Limitations')}</h4>
                  <ul>
                    {evidence.limitations.map((limitation) => (
                      <li key={limitation}>{limitationLabel(limitation)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {evidence.items.length > 0 ? (
                <div className="evidence-list">
                  {evidence.items.map((item) => {
                    const sourceUrl = item.source?.url;
                    return (
                      <article className="evidence-item" key={item.id} id={`evidence-${item.id}`} tabIndex={-1}>
                        <div className="evidence-item-header">
                          <span className="evidence-category">{translate(CATEGORY_LABEL[item.category])}</span>
                          <h4 className="evidence-title">{item.title}</h4>
                          {item.timestamp ? <span className="evidence-time">{item.timestamp}</span> : null}
                        </div>
                        <pre className="evidence-content">{item.content}</pre>
                        {item.truncation ? <p className="evidence-note">{translate('Content truncated')}</p> : null}
                        {sourceUrl ? (
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              void client.openExternal(sourceUrl).catch(() => undefined);
                            }}
                          >
                            {translate('Open source')}
                            <ExternalLink size={11} aria-hidden="true" />
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="diagnostics-message">{translate('No diagnostic evidence is available.')}</p>
              )}
            </>
          ) : (
            <p className="diagnostics-message">{translate('No diagnostic evidence is available.')}</p>
          )
        ) : null}
      </div>
    </section>
  );
};
