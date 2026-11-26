import React from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { RadiatorFailure } from '../../../core/presentation/radiator';
import { translate } from '../../i18n';
import { client } from '../../rpc-client';
import { HandoffCopyButton } from './Handoff';
import { integrationLabel } from './integration';
import { safeExternalUrl } from './links';

function evidenceText(failure: RadiatorFailure): string {
  switch (failure.evidenceStatus) {
    case 'collecting':
    case 'queued':
      return translate('Collecting evidence…');
    case 'available':
      return translate('Evidence complete');
    case 'partial':
      return translate('Evidence partial');
    case 'unavailable':
      return translate('Evidence unavailable');
    case 'failed':
      return translate('Evidence collection failed');
    case 'disabled':
      return translate('Diagnostics off');
    case 'unsupported':
      return translate('No detailed evidence for this source');
    case 'not_collected':
      return translate('Waiting for evidence');
    default:
      return translate('Checking evidence…');
  }
}

function analysisText(failure: RadiatorFailure): string {
  switch (failure.analysisStatus) {
    case 'available':
      return translate('AI diagnosis');
    case 'analyzing':
    case 'queued':
      return translate('Analyzing…');
    case 'insufficient_evidence':
      return translate('Not enough evidence');
    case 'failed':
      return translate('Analysis failed');
    case 'runtime_unavailable':
      return translate('AI unavailable');
    case 'waiting_for_evidence':
      return failure.evidenceStatus === 'unsupported' ? '' : translate('Waiting for AI');
    case 'disabled':
      return translate('AI off');
    default:
      return '';
  }
}

type FailureCardProps = {
  failure: RadiatorFailure;
  onOpenDetails: () => void;
  compact?: boolean;
};

export const FailureCard = ({ failure, onOpenDetails, compact = false }: FailureCardProps) => {
  const typeLabel = integrationLabel(failure.type) || failure.type || '';
  const cause = failure.validAnalysis?.likelyCauses[0];
  const recommendation = failure.validAnalysis?.recommendations[0];
  const summary = failure.validAnalysis?.summary;
  const sourceLabel = typeLabel || failure.validEvidence?.sourceType || translate('Integration');
  const meta = [
    failure.runStartedAt ? `${translate('Run started')} ${failure.runStartedAt}` : '',
    evidenceText(failure),
    analysisText(failure),
  ]
    .filter(Boolean)
    .join(' · ');
  const titleId = `failure-${failure.observerId.replace(/[^A-Za-z0-9_-]/g, '-')}`;

  return (
    <article
      className={`radiator-failure${compact ? ' is-compact' : ''}${failure.muted ? ' is-muted' : ''}`}
      aria-labelledby={titleId}
      data-observer-id={failure.observerId}
    >
      <div className="radiator-failure-top">
        <span className="status-pill failure">
          <span className="status-pill-dot" aria-hidden="true" />
          {translate('Failed')}
        </span>
        <h3 className="radiator-failure-name" id={titleId}>
          {failure.name}
        </h3>
        {typeLabel ? <span className="radiator-failure-type">{typeLabel}</span> : null}
        {failure.muted ? <span className="radiator-muted-chip">{translate('Muted')}</span> : null}
        <span className="radiator-failure-spacer" />
        {safeExternalUrl(failure.link) ? (
          <button
            type="button"
            className="radiator-icon-action"
            aria-label={translate('Open source')}
            title={translate('Open source')}
            onClick={() => void client.openExternal(failure.link).catch(() => undefined)}
          >
            <ExternalLink size={11} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <p className="radiator-failure-description">
        {failure.description || translate('The observer reported a failure.')}
      </p>
      {meta ? <p className="radiator-failure-meta">{meta}</p> : null}

      {cause ? (
        <div className="radiator-failure-cause">
          <span className="radiator-micro-label">
            {translate('Likely cause')}{' '}
            <span className={`certainty certainty-${cause.certainty}`}>{translate(cause.certainty)}</span>
          </span>
          <p>{cause.description}</p>
        </div>
      ) : summary ? (
        <div className="radiator-failure-cause">
          <span className="radiator-micro-label">{translate('AI summary')}</span>
          <p>{summary}</p>
        </div>
      ) : null}

      {recommendation ? (
        <div className="radiator-next-step">
          <span className="radiator-micro-label">
            {translate('Next step')} · {translate(recommendation.type)}
          </span>
          <p>
            {recommendation.description}
            {recommendation.evidenceIds[0] ? (
              <span className="citation-chip">{recommendation.evidenceIds[0]}</span>
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="radiator-failure-actions">
        <button type="button" className="button primary" onClick={onOpenDetails}>
          {translate('Details')}
          <ChevronRight size={11} aria-hidden="true" />
        </button>
        <HandoffCopyButton
          state={failure.state}
          sourceLabel={sourceLabel}
          evidence={failure.evidence}
          analysis={failure.analysis}
          label={translate('Copy prompt')}
          className="text-button"
        />
      </div>
    </article>
  );
};
