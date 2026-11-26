import { DiagnosticSnapshot, DiagnosticStatus } from '../../types/Diagnostics';
import {
  AnalysisReason,
  AnalysisSnapshot,
  AnalysisStatus,
  AnalysisCause,
  AnalysisRecommendation,
  DiagnosticAnalysis,
} from '../../types/Intelligence';
import { ObserverConfiguration } from '../../types/ObserverConfiguration';
import { State } from '../../types/State';
import { Status } from '../../types/Status';

export type RadiatorHealth = 'empty' | 'healthy' | 'attention' | 'unresolved';

export type RadiatorSummary = {
  total: number;
  healthy: number;
  failed: number;
  mutedFailures: number;
  checking: number;
  unavailable: number;
};

export type RadiatorFailure = {
  observerId: string;
  failureId?: string;
  failureKey: string;
  name: string;
  type?: string;
  link: string;
  muted: boolean;
  description?: string;
  state: State;
  evidence?: DiagnosticSnapshot;
  analysis?: AnalysisSnapshot;
  evidenceStatus?: DiagnosticStatus;
  analysisStatus?: AnalysisStatus;
  analysisReason?: AnalysisReason;
  validEvidence?: DiagnosticSnapshot['evidence'];
  validAnalysis?: DiagnosticAnalysis;
  runStartedAt?: string;
  evidenceCollectedAt?: string;
  cause?: AnalysisCause;
  recommendation?: AnalysisRecommendation;
};

export type RadiatorObserver = {
  observerId?: string;
  name: string;
  type?: string;
  status: Status;
  muted: boolean;
  state: State;
};

export type RadiatorModel = {
  health: RadiatorHealth;
  summary: RadiatorSummary;
  failures: RadiatorFailure[];
  observers: RadiatorObserver[];
};

export function failureKeyOf(state: State): string {
  const observerId = state.id || state.name;
  return `${observerId}:${state.error?.id || 'failure'}`;
}

export function isEvidenceCurrent(
  state: State,
  snapshot?: DiagnosticSnapshot
): snapshot is DiagnosticSnapshot & {
  evidence: NonNullable<DiagnosticSnapshot['evidence']>;
} {
  const evidence = snapshot?.evidence;
  if (!evidence || !state.id || !state.error?.id) return false;
  return evidence.observerId === state.id && evidence.failureId === state.error.id;
}

export function isAnalysisCurrent(
  state: State,
  snapshot?: AnalysisSnapshot
): snapshot is AnalysisSnapshot & { analysis: DiagnosticAnalysis } {
  const analysis = snapshot?.analysis;
  if (!analysis || !state.id || !state.error?.id) return false;
  return analysis.observerId === state.id && analysis.failureId === state.error.id;
}

export function calculateGlobalStatus(states: State[]): Status {
  if (states.length === 0) return Status.NA;
  if (states.some((state) => state.status === Status.FAILURE)) return Status.FAILURE;
  if (states.some((state) => state.status === Status.NA)) return Status.NA;
  if (states.some((state) => state.status === Status.CHECKING)) return Status.CHECKING;
  return Status.SUCCESS;
}

function configurationById(observables: ObserverConfiguration[]): Map<string, ObserverConfiguration> {
  const map = new Map<string, ObserverConfiguration>();
  for (const observable of observables) {
    if (observable.id) map.set(observable.id, observable);
  }
  return map;
}

function observerName(state: State, configuration?: ObserverConfiguration): string {
  const alias = typeof configuration?.alias === 'string' ? configuration.alias.trim() : '';
  return alias || state.name;
}

function runStartedAt(evidence?: DiagnosticSnapshot['evidence']): string | undefined {
  return evidence?.items.find((item) => item.category === 'execution' && item.timestamp)?.timestamp;
}

export type RadiatorSnapshots = Record<
  string,
  { evidence?: DiagnosticSnapshot; analysis?: AnalysisSnapshot } | undefined
>;

export function buildRadiatorModel(
  states: State[],
  observables: ObserverConfiguration[] = [],
  snapshots: RadiatorSnapshots = {}
): RadiatorModel {
  const byId = configurationById(observables);
  const summary: RadiatorSummary = {
    total: states.length,
    healthy: 0,
    failed: 0,
    mutedFailures: 0,
    checking: 0,
    unavailable: 0,
  };

  const failures: Array<RadiatorFailure & { order: number }> = [];
  const observers: RadiatorObserver[] = states.map((state, index) => {
    const configuration = state.id ? byId.get(state.id) : observables[index];
    const muted = Boolean(state.muted ?? configuration?.muted);
    const name = observerName(state, configuration);
    const type = configuration?.type;

    if (state.status === Status.SUCCESS) summary.healthy += 1;
    else if (state.status === Status.FAILURE) {
      summary.failed += 1;
      if (muted) summary.mutedFailures += 1;
    } else if (state.status === Status.CHECKING) summary.checking += 1;
    else summary.unavailable += 1;

    if (state.status === Status.FAILURE) {
      const snapshot = state.id ? snapshots[state.id] : undefined;
      const evidenceSnapshot = snapshot?.evidence;
      const analysisSnapshot = snapshot?.analysis;
      const evidence = isEvidenceCurrent(state, evidenceSnapshot) ? evidenceSnapshot.evidence : undefined;
      const analysis = isAnalysisCurrent(state, analysisSnapshot) ? analysisSnapshot.analysis : undefined;

      failures.push({
        order: index,
        observerId: state.id || name,
        failureId: state.error?.id,
        failureKey: failureKeyOf(state),
        name,
        type,
        link: state.link,
        muted,
        description: state.error?.description,
        state,
        evidence: evidence ? evidenceSnapshot : undefined,
        analysis: analysis ? analysisSnapshot : undefined,
        evidenceStatus: evidenceSnapshot?.status,
        analysisStatus: analysisSnapshot?.status,
        analysisReason: analysisSnapshot?.reason,
        validEvidence: evidence,
        validAnalysis: analysis,
        runStartedAt: runStartedAt(evidence),
        evidenceCollectedAt: evidence?.collectedAt,
        cause: analysis?.likelyCauses[0],
        recommendation: analysis?.recommendations[0],
      });
    }

    return {
      observerId: state.id,
      name,
      type,
      status: state.status,
      muted,
      state,
    };
  });

  failures.sort((left, right) => {
    if (left.muted !== right.muted) return left.muted ? 1 : -1;
    if (left.order !== right.order) return left.order - right.order;
    return left.observerId.localeCompare(right.observerId);
  });

  const health: RadiatorHealth =
    summary.total === 0
      ? 'empty'
      : summary.failed > 0
        ? 'attention'
        : summary.checking === 0 && summary.unavailable === 0
          ? 'healthy'
          : 'unresolved';

  return {
    health,
    summary,
    failures: failures.map((failure) => {
      const { order, ...publicFailure } = failure;
      void order;
      return publicFailure;
    }),
    observers,
  };
}
