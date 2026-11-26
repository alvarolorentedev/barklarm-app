import { useCallback, useEffect, useRef, useState } from 'react';
import { client } from '../../rpc-client';
import { DiagnosticSnapshot } from '../../../types/Diagnostics';
import { AnalysisSnapshot } from '../../../types/Intelligence';

type SnapshotState<T> = {
  snapshot: T | null;
  loading: boolean;
  error: boolean;
};

export function useDiagnosticSnapshot(observerId: string, failureKey?: string) {
  const [state, setState] = useState<SnapshotState<DiagnosticSnapshot>>({
    snapshot: null,
    loading: true,
    error: false,
  });
  const request = useRef(0);

  const load = useCallback(async () => {
    const current = request.current + 1;
    request.current = current;
    try {
      const next = await client.getDiagnosticEvidence(observerId);
      if (current !== request.current) return;
      setState({ snapshot: next, loading: false, error: false });
    } catch {
      if (current !== request.current) return;
      setState((previous) => ({ ...previous, loading: false, error: true }));
    }
  }, [observerId]);

  useEffect(() => {
    setState({ snapshot: null, loading: true, error: false });
    void load();
    return () => {
      request.current += 1;
    };
  }, [load, failureKey]);

  useEffect(() => {
    const status = state.snapshot?.status;
    if (status !== 'collecting' && status !== 'queued') return;
    const timer = setInterval(() => void load(), 1200);
    return () => clearInterval(timer);
  }, [state.snapshot?.status, load]);

  useEffect(() => {
    const status = state.snapshot?.status;
    if (status !== 'available' && status !== 'partial' && status !== 'unavailable') return;
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [state.snapshot?.status, load]);

  const recollect = useCallback(async () => {
    setState((previous) => ({ ...previous, error: false, snapshot: { status: 'collecting' } }));
    try {
      await client.recollectDiagnosticEvidence(observerId);
    } catch {
      setState((previous) => ({ ...previous, error: true }));
    }
    await load();
  }, [load, observerId]);

  return { ...state, reload: load, recollect };
}

export function useAnalysisSnapshot(observerId: string, failureKey?: string, evidenceVersion?: string) {
  const [state, setState] = useState<SnapshotState<AnalysisSnapshot>>({
    snapshot: null,
    loading: true,
    error: false,
  });
  const request = useRef(0);

  const load = useCallback(async () => {
    const current = request.current + 1;
    request.current = current;
    try {
      const next = await client.getAnalysis(observerId);
      if (current !== request.current) return;
      setState({ snapshot: next, loading: false, error: false });
    } catch {
      if (current !== request.current) return;
      setState((previous) => ({ ...previous, loading: false, error: true }));
    }
  }, [observerId]);

  useEffect(() => {
    setState({ snapshot: null, loading: true, error: false });
    void load();
    return () => {
      request.current += 1;
    };
  }, [load, failureKey, evidenceVersion]);

  useEffect(() => {
    const status = state.snapshot?.status;
    if (status !== 'queued' && status !== 'analyzing') return;
    const timer = setInterval(() => void load(), 1200);
    return () => clearInterval(timer);
  }, [state.snapshot?.status, load]);

  useEffect(() => {
    const status = state.snapshot?.status;
    if (
      status !== 'available' &&
      status !== 'insufficient_evidence' &&
      status !== 'failed' &&
      status !== 'runtime_unavailable'
    ) {
      return;
    }
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [state.snapshot?.status, load]);

  const reanalyze = useCallback(async () => {
    setState((previous) => ({ ...previous, error: false, snapshot: { status: 'queued' } }));
    try {
      await client.reanalyze(observerId);
    } catch {
      setState((previous) => ({ ...previous, error: true }));
    }
    await load();
  }, [load, observerId]);

  return { ...state, reload: load, reanalyze };
}
