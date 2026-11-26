import React from 'react';
import { ChevronRight } from 'lucide-react';
import { RadiatorObserver } from '../../../core/presentation/radiator';
import { Status } from '../../../types/Status';
import { translate } from '../../i18n';
import { STATUS_CLASS, STATUS_LABEL } from '../status';
import { integrationLabel } from './integration';

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

      return failed && observer.observerId ? (
        <button
          type="button"
          className="radiator-observer-row is-failed"
          key={observer.observerId || `observer-${index}`}
          onClick={() => onOpenFailure(observer.observerId as string)}
        >
          {content}
        </button>
      ) : (
        <div className="radiator-observer-row" key={observer.observerId || `observer-${index}`}>
          {content}
        </div>
      );
    })}
  </div>
);
