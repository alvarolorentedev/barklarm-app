import React, { useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { buildRadiatorModel } from '../../../core/presentation/radiator';
import { Status } from '../../../types/Status';
import { AllObserversList } from '../../components/radiator/AllObserversList';
import { StatusSummary } from '../../components/radiator/StatusSummary';
import { translate } from '../../i18n';
import { client } from '../../rpc-client';
import { useStatus } from '../../status-context';
import { useObservables } from './use-observables';

type Filter = 'all' | 'failed' | 'healthy' | 'other' | 'muted';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  failed: 'Failed',
  healthy: 'Healthy',
  other: 'Checking or unavailable',
  muted: 'Muted',
};

export const Radiator = () => {
  const { states, loading, refresh } = useStatus();
  const observables = useObservables();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const model = useMemo(() => buildRadiatorModel(states, observables), [states, observables]);

  const filteredObservers = useMemo(() => {
    if (filter === 'all') return model.observers;
    return model.observers.filter((observer) => {
      if (filter === 'failed') return observer.status === Status.FAILURE;
      if (filter === 'healthy') return observer.status === Status.SUCCESS;
      if (filter === 'muted') return observer.muted;
      return observer.status === Status.CHECKING || observer.status === Status.NA;
    });
  }, [model.observers, filter]);

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      await client.refreshObservers();
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading && states.length === 0) {
    return (
      <div className="page radiator-page">
        <header className="page-header">
          <h1 className="page-title">{translate('Radiator')}</h1>
          <p className="page-description">{translate('What needs your attention right now.')}</p>
        </header>
        <p className="radiator-loading" role="status">
          {translate('Checking your observers…')}
        </p>
      </div>
    );
  }

  return (
    <div className="page radiator-page">
      <header className="page-header radiator-page-head">
        <div>
          <h1 className="page-title">{translate('Radiator')}</h1>
          <p className="page-description">{translate('What needs your attention right now.')}</p>
        </div>
        <button type="button" className="button" onClick={() => void doRefresh()} disabled={refreshing}>
          <RefreshCw size={12} aria-hidden="true" />
          {translate('Refresh')}
        </button>
      </header>

      {model.health === 'empty' ? (
        <section className="radiator-empty" aria-labelledby="radiator-empty-title">
          <div className="radiator-empty-icon" aria-hidden="true">
            <Plus size={18} />
          </div>
          <h2 id="radiator-empty-title">{translate('Add your first observer')}</h2>
          <p>
            {translate(
              'Barklarm watches builds, releases and monitoring sources. Add one source to see its status here and in your menu bar.'
            )}
          </p>
          <button type="button" className="button primary" onClick={() => navigate('/observers')}>
            {translate('Add observer')}
          </button>
          <p className="radiator-empty-note">
            {translate(
              'GitHub Actions is the best first source: it also supports detailed diagnostic evidence. Barklarm works without AI.'
            )}
          </p>
        </section>
      ) : (
        <>
          <StatusSummary summary={model.summary} />
          {model.summary.mutedFailures > 0 ? (
            <p className="radiator-summary-note">
              {translate('Muted failures stay visible and keep their operational status.')}
            </p>
          ) : null}

          <section className="radiator-section" aria-labelledby="all-observers">
            <div className="radiator-section-head">
              <h2 id="all-observers" className="radiator-section-title">
                {translate('All observers')}
              </h2>
              <span className="radiator-section-count">
                {model.summary.total} {translate('configured')}
              </span>
            </div>
            {model.observers.length > 6 ? (
              <div className="radiator-filters" role="group" aria-label={translate('Filter observers')}>
                {(Object.keys(FILTER_LABEL) as Filter[]).map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={`radiator-filter${filter === value ? ' is-active' : ''}`}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {translate(FILTER_LABEL[value])}
                  </button>
                ))}
              </div>
            ) : null}
            <AllObserversList
              observers={filteredObservers}
              onOpenFailure={(observerId) => navigate(`/radiator/observer/${encodeURIComponent(observerId)}`)}
            />
          </section>
        </>
      )}
    </div>
  );
};
