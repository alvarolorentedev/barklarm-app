import React, { useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { observersComponentBuilderMap } from '../../../extensions/observersComponentBuilderMap';
import { observersTitleBuilderMap } from '../../../extensions/observersTitleBuilderMap';
import { observersList } from '../../../extensions/observersList';
import { ObserversParams } from '../../../types/ObserversParams';
import { State } from '../../../types/State';
import { Status } from '../../../types/Status';
import { DiagnosticPanel } from '../Diagnostics';
import { StatusPill } from '../StatusPill';
import Select, { MenuItem } from '../fields/Select';
import Switch from '../fields/Switch';
import TextField from '../fields/TextField';

type ObserversProps = ObserversParams & {
  states?: State[];
  search?: string;
};

export const Observers = ({
  observables,
  add,
  remove,
  update,
  translate,
  states = [],
  search = '',
}: ObserversProps) => {
  const [expanded, setExpanded] = useState<number | null>(null);

  const getTitle = (observable: any): string => {
    if (!observable.type) return translate('New observer');
    try {
      return observersTitleBuilderMap[observable.type](observable);
    } catch {
      return translate('Unkown');
    }
  };

  const getTypeLabel = (type: string): string => {
    if (!type) return translate('Not configured');
    return observersList.find((item: any) => item.value === type)?.label || translate('Unkown');
  };

  const getComponent = (observable: any, index: number): React.ReactNode => {
    try {
      return observersComponentBuilderMap[observable.type](observable, index, update, translate);
    } catch {
      return null;
    }
  };

  const query = search.trim().toLowerCase();
  const statesById = new Map(states.filter((state) => state.id).map((state) => [state.id as string, state]));
  const visible = observables
    .map((observable, index) => ({ observable, index }))
    .filter(({ observable }) => {
      if (!query) return true;
      return (
        getTitle(observable).toLowerCase().includes(query) ||
        getTypeLabel(observable.type).toLowerCase().includes(query)
      );
    });

  const addObserver = () => {
    add({ type: '' });
    setExpanded(observables.length);
  };

  const removeObserver = (index: number) => {
    remove(index);
    setExpanded(null);
  };

  return (
    <div className="observers">
      <div className="observer-table">
        <div className="observer-table-header">
          <span className="col-name">{translate('Observer')}</span>
          <span className="col-type">{translate('Type')}</span>
          <span className="col-status">{translate('Status')}</span>
          <span className="col-actions" />
        </div>

        {observables.length === 0 ? (
          <div className="observer-empty">
            <strong>{translate('No observers yet')}</strong>
            <span>{translate('Add your first source to start monitoring.')}</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="observer-empty">
            <span>{translate('No observers match your search.')}</span>
          </div>
        ) : (
          visible.map(({ observable, index }) => {
            const isExpanded = expanded === index;
            const state = statesById.get(observable.id) ?? states[index];
            return (
              <div className="observer-item" key={`observer-${index}`}>
                <div className={`observer-row${isExpanded ? ' is-expanded' : ''}`}>
                  <button
                    type="button"
                    className="observer-row-main"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded(isExpanded ? null : index)}
                  >
                    <span className="observer-name">
                      <ChevronRight size={14} className="chevron" aria-hidden="true" />
                      <span className="observer-name-text">{getTitle(observable)}</span>
                    </span>
                    <span className="observer-type">{getTypeLabel(observable.type)}</span>
                    <span className="observer-status">
                      <StatusPill status={state?.status} />
                    </span>
                  </button>
                  <button type="button" className="observer-remove" onClick={() => removeObserver(index)}>
                    {translate('Remove')}
                  </button>
                </div>

                {isExpanded ? (
                  <div className="observer-editor">
                    <div className="observer-editor-grid">
                      <Select
                        label={translate('Type')}
                        value={observable.type || ''}
                        placeholder={translate('Select a source')}
                        onChange={(event) => update('type', index, event.target.value)}
                      >
                        {observersList.map(({ value, label }: any) => (
                          <MenuItem key={value} value={value}>
                            {label}
                          </MenuItem>
                        ))}
                      </Select>
                      <TextField
                        label={translate('Alias')}
                        value={observable.alias}
                        onChange={(event) => update('alias', index, event.target.value)}
                      />
                      <TextField
                        label={translate('Issue Creation Endpoint')}
                        value={observable.issueEndpoint}
                        className="field-full"
                        onChange={(event) => update('issueEndpoint', index, event.target.value)}
                      />
                    </div>

                    {observable.type ? (
                      <div className="observer-form-fields">{getComponent(observable, index)}</div>
                    ) : (
                      <p className="observer-hint">{translate('Choose a source type to configure it.')}</p>
                    )}

                    {observable.id && state?.status === Status.FAILURE ? (
                      <DiagnosticPanel observerId={observable.id} failureKey={state.error?.id} />
                    ) : null}

                    <div className="observer-editor-footer">
                      <Switch
                        label={translate('Muted')}
                        checked={!!observable.muted}
                        onChange={(event) => update('muted', index, event.target.checked)}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="observer-footer">
        <button type="button" className="button primary" onClick={addObserver}>
          <Plus size={14} aria-hidden="true" />
          {translate('New observer')}
        </button>
      </div>
    </div>
  );
};
