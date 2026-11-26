import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { client } from '../../rpc-client';
import { DiagnosticSnapshot } from '../../../types/Diagnostics';
import { AnalysisSnapshot } from '../../../types/Intelligence';
import { State } from '../../../types/State';
import { Status } from '../../../types/Status';

export type FailureSnapshot = {
  evidence?: DiagnosticSnapshot;
  analysis?: AnalysisSnapshot;
  loading: boolean;
  error: boolean;
};

const TRANSIENT_DIAGNOSTIC = new Set(['queued', 'collecting', 'not_collected']);
const TRANSIENT_ANALYSIS = new Set(['queued', 'analyzing', 'waiting_for_evidence']);

function failureSignature(states: State[]): string {
  return states
    .filter((state) => state.status === Status.FAILURE)
    .map((state) => `${state.id || state.name}:${state.error?.id || 'failure'}`)
    .sort()
    .join('|');
}

export function useRadiatorData(states: State[]) {
  const signature = useMemo(() => failureSignature(states), [states]);
  const failures = useMemo(() => states.filter((state) => state.status === Status.FAILURE), [states]);
  const failuresRef = useRef<State[]>(failures);
  failuresRef.current = failures;
  const [snapshots, setSnapshots] = useState<Record<string, FailureSnapshot>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  const attempts = useRef(0);

  const load = useCallback(async () => {
    const current = request.current + 1;
    request.current = current;
    const targets = failuresRef.current.filter((state) => state.id);
    if (targets.length === 0) {
      setSnapshots({});
      setInitialLoading(false);
      return;
    }

    setSnapshots((previous) => {
      const next: Record<string, FailureSnapshot> = {};
      for (const state of targets) {
        if (!state.id) continue;
        next[state.id] = previous[state.id]
          ? { ...previous[state.id], loading: true }
          : { loading: true, error: false };
      }
      return next;
    });

    const results = await Promise.all(
      targets.map(async (state) => {
        const observerId = state.id as string;
        const [evidence, analysis] = await Promise.allSettled([
          client.getDiagnosticEvidence(observerId),
          client.getAnalysis(observerId),
        ]);
        return { observerId, evidence, analysis };
      })
    );

    if (current !== request.current) return;

    const next: Record<string, FailureSnapshot> = {};
    for (const result of results) {
      const evidence = result.evidence.status === 'fulfilled' ? result.evidence.value : undefined;
      const analysis = result.analysis.status === 'fulfilled' ? result.analysis.value : undefined;
      next[result.observerId] = {
        evidence,
        analysis,
        loading: false,
        error: result.evidence.status === 'rejected' || result.analysis.status === 'rejected',
      };
    }
    setSnapshots(next);
    setInitialLoading(false);
  }, []);

  useEffect(() => {
    attempts.current = 0;
    void load();
    return () => {
      request.current += 1;
    };
  }, [signature, attempt, load]);

  const needsPolling = useMemo(() => {
    if (failures.length === 0) return false;
    if (attempts.current >= 120) return false;
    return failures.some((state) => {
      const snapshot = state.id ? snapshots[state.id] : undefined;
      if (!snapshot) return true;
      if (snapshot.error) return false;
      const diagnostic = snapshot.evidence?.status;
      const analysis = snapshot.analysis?.status;
      if (diagnostic && TRANSIENT_DIAGNOSTIC.has(diagnostic)) return true;
      if (analysis && TRANSIENT_ANALYSIS.has(analysis)) return true;
      return false;
    });
  }, [failures, snapshots]);

  useEffect(() => {
    if (!needsPolling) return;
    const timer = setInterval(() => {
      attempts.current += 1;
      void load();
    }, 1500);
    return () => clearInterval(timer);
  }, [needsPolling, load]);

  useEffect(() => {
    if (failuresRef.current.length === 0) return;
    // Slow refresh keeps TTL-expired evidence/analysis from remaining on screen.
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [signature, load]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return { snapshots, initialLoading, reload };
}
