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

  if (compact) {
    const compactLabels: Record<string, { one: string; other: string }> = {
      healthy: { one: translate('healthy source'), other: translate('healthy sources') },
      failed: { one: translate('failed source'), other: translate('failed sources') },
      checking: { one: translate('checking source'), other: translate('checking sources') },
      unavailable: { one: translate('unavailable source'), other: translate('unavailable sources') },
    };
    return (
      <p className="radiator-health-line" aria-label={translate('System health')}>
        {items
          .filter((item) => item.count > 0)
          .map((item) => (
            <span key={item.key}>
              <span className={`status-dot ${item.dot}`} aria-hidden="true" />
              <strong>{item.count}</strong>{' '}
              {item.count === 1 ? compactLabels[item.key].one : compactLabels[item.key].other}
            </span>
          ))}
        {summary.mutedFailures > 0 ? (
          <span className="radiator-muted-note">
            {summary.mutedFailures} {translate(summary.mutedFailures === 1 ? 'muted source' : 'muted sources')}
          </span>
        ) : null}
      </p>
    );
  }

  return (
    <div className="radiator-summary" aria-label={translate('System health')}>
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
