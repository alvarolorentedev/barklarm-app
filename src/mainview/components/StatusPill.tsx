import React from 'react';
import { Status } from '../../types/Status';
import { translate } from '../i18n';

const STATUS_META: Record<Status, { className: string; label: string }> = {
  [Status.SUCCESS]: { className: 'success', label: 'Succeeded' },
  [Status.FAILURE]: { className: 'failure', label: 'Failed' },
  [Status.CHECKING]: { className: 'checking', label: 'Checking' },
  [Status.NA]: { className: 'idle', label: 'Unavailable' },
};

export const StatusPill = ({ status }: { status?: Status }) => {
  const meta = status === undefined ? { className: 'idle', label: 'Unavailable' } : STATUS_META[status];

  return (
    <span className={`status-pill ${meta.className}`}>
      <span className="status-pill-dot" />
      {translate(meta.label)}
    </span>
  );
};
