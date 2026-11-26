import React from 'react';
import { client } from '../../rpc-client';
import { AnalysisSection } from './Analysis';
import { EvidenceView } from './EvidenceView';
import { useDiagnosticSnapshot } from './hooks';

type DiagnosticPanelProps = {
  observerId: string;
  failureKey?: string;
};

export const DiagnosticPanel = ({ observerId, failureKey }: DiagnosticPanelProps) => {
  const { snapshot, loading, error, reload, recollect } = useDiagnosticSnapshot(observerId, failureKey);

  const enableDiagnostics = async () => {
    try {
      await client.setStore('diagnosticsEnabled', true);
    } catch {
      // The panel keeps the disabled explanation visible; the user can retry.
    }
    await reload();
  };

  return (
    <>
      <EvidenceView
        snapshot={snapshot}
        loading={loading}
        error={error}
        onRetry={() => void reload()}
        onRecollect={() => void recollect()}
        onEnableDiagnostics={() => void enableDiagnostics()}
      />
      <AnalysisSection
        observerId={observerId}
        failureKey={`${failureKey || ''}:${snapshot?.evidence?.collectedAt || ''}`}
        onFocusEvidence={(evidenceId) => {
          const target = document.getElementById(`evidence-${evidenceId}`);
          if (!target) return;
          target.scrollIntoView({ block: 'center' });
          target.focus({ preventScroll: true });
        }}
      />
    </>
  );
};
