import React from 'react';
import { AnalysisView } from './AnalysisView';
import { useAnalysisSnapshot } from './hooks';

type AnalysisSectionProps = {
  observerId: string;
  failureKey?: string;
  onFocusEvidence: (evidenceId: string) => void;
};

export const AnalysisSection = ({ observerId, failureKey, onFocusEvidence }: AnalysisSectionProps) => {
  const { snapshot, loading, error, reload, reanalyze } = useAnalysisSnapshot(observerId, failureKey);

  return (
    <AnalysisView
      snapshot={snapshot}
      loading={loading}
      error={error}
      onRetry={() => void reload()}
      onReanalyze={() => void reanalyze()}
      onFocusEvidence={onFocusEvidence}
    />
  );
};
