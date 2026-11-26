import React from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { RadiatorObserver } from '../../../core/presentation/radiator';
import { Status } from '../../../types/Status';
import { translate } from '../../i18n';
import { client } from '../../rpc-client';
import { STATUS_CLASS, STATUS_LABEL } from '../status';
import { integrationLabel } from './integration';
import { safeExternalUrl } from './links';

type AllObserversListProps = {
  observers: RadiatorObserver[];
  onOpenFailure: (observerId: string) => void;
  compact?: boolean;
};

export const AllObserversList = ({ observers, onOpenFailure, compact = false }: AllObserversListProps) => (
  <div className={`radiator-observers${compact ? ' is-compact' : ''}`}>
    {observers.map((observer, index) => {
      const failed = observer.status === Status.FAILURE;
      const typeLabel = integrationLabel(observer.type) || observer.type || '';
      const content = (
        <>
          <span className={`status-pill ${STATUS_CLASS[observer.status]}`}>
            <span className="status-pill-dot" aria-hidden="true" />
            {translate(STATUS_LABEL[observer.status])}
          </span>
          <span className="radiator-observer-name">{observer.name}</span>
          {typeLabel && !compact ? <span className="radiator-observer-type">{typeLabel}</span> : null}
          {observer.muted ? <span className="radiator-muted-chip">{translate('Muted')}</span> : null}
          {failed ? <ChevronRight size={12} aria-hidden="true" className="radiator-observer-chevron" /> : null}
        </>
      );

      if (failed && observer.observerId) {
        return (
          <button
            type="button"
            className="radiator-observer-row is-failed"
            key={observer.observerId}
            onClick={() => onOpenFailure(observer.observerId as string)}
          >
            {content}
          </button>
        );
      }

      return (
        <div className="radiator-observer-row" key={observer.observerId || `observer-${index}`}>
          {content}
          {!compact && safeExternalUrl(observer.state.link) ? (
            <button
              type="button"
              className="radiator-icon-action"
              aria-label={`${translate('Open latest result')}: ${observer.name}`}
              title={translate('Open latest result')}
              onClick={() => void client.openExternal(observer.state.link).catch(() => undefined)}
            >
              <ExternalLink size={11} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      );
    })}
  </div>
);
