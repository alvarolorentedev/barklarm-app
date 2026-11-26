import React from 'react';
import { RadiatorSummary } from '../../../core/presentation/radiator';
import { translate } from '../../i18n';

type StatusSummaryProps = {
  summary: RadiatorSummary;
  compact?: boolean;
};

export const StatusSummary = ({ summary, compact = false }: StatusSummaryProps) => {
  const items = [
    { key: 'healthy', count: summary.healthy, label: translate('Healthy'), dot: 'success' },
    { key: 'failed', count: summary.failed, label: translate('Failed'), dot: 'failure' },
    { key: 'checking', count: summary.checking, label: translate('Checking'), dot: 'checking' },
    { key: 'unavailable', count: summary.unavailable, label: translate('Unavailable'), dot: 'idle' },
  ];

  return (
    <div className={`radiator-summary${compact ? ' is-compact' : ''}`} aria-label={translate('System health')}>
      {items.map((item) => (
        <div className="radiator-summary-cell" key={item.key}>
          <div className={`radiator-summary-value ${item.key === 'failed' && item.count > 0 ? 'is-failed' : ''}`}>
            <span className={`status-dot ${item.dot}`} aria-hidden="true" />
            {item.count}
          </div>
          <div className="radiator-summary-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
};
