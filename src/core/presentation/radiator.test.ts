import { describe, expect, it } from 'vitest';
import { buildRadiatorModel, calculateGlobalStatus, isAnalysisCurrent, isEvidenceCurrent } from './radiator';
import { DiagnosticEvidence, DiagnosticSnapshot } from '../../types/Diagnostics';
import { AnalysisSnapshot } from '../../types/Intelligence';
import { State } from '../../types/State';
import { Status } from '../../types/Status';

const state = (id: string, name: string, status: Status, errorId?: string, muted = false): State => ({
  id,
  name,
  status,
  link: `https://example.test/${id}`,
  muted,
  ...(errorId ? { error: { id: errorId, description: `${name} failed` } } : {}),
});

const evidence = (observerId: string, failureId: string): DiagnosticEvidence => ({
  schemaVersion: 1,
  observerId,
  failureId,
  sourceType: 'githubAction',
  collectedAt: '2026-01-15T12:00:00.000Z',
  completeness: 'complete',
  summary: 'Evidence summary',
  items: [
    {
      id: 'execution',
      category: 'execution',
      title: 'Workflow execution: CI',
      content: 'Run: 1001',
      timestamp: '2026-01-15T10:00:00.000Z',
    },
  ],
  limitations: [],
});

const evidenceSnapshot = (observerId: string, failureId: string): DiagnosticSnapshot => ({
  status: 'available',
  evidence: evidence(observerId, failureId),
});

const analysisSnapshot = (observerId: string, failureId: string): AnalysisSnapshot => ({
  status: 'available',
  analysis: {
    schemaVersion: 1,
    observerId,
    failureId,
    evidenceFingerprint: 'x',
    generatedAt: '2026-01-15T12:01:00.000Z',
    promptVersion: 'v1',
    model: { provider: 'managed', name: 'Mock' },
    summary: 'Summary',
    findings: [],
    likelyCauses: [{ description: 'Cause', evidenceIds: ['execution'], certainty: 'hypothesis' }],
    recommendations: [
      { description: 'Check it', rationale: 'Because', evidenceIds: ['execution'], type: 'investigate' },
    ],
    evidenceSufficiency: 'sufficient',
    uncertainty: [],
  },
});

describe('radiator projection', () => {
  it('counts operational states without treating NA as healthy', () => {
    const model = buildRadiatorModel(
      [
        state('a', 'A', Status.SUCCESS),
        state('b', 'B', Status.FAILURE, 'run-1'),
        state('c', 'C', Status.CHECKING),
        state('d', 'D', Status.NA),
      ],
      [
        { id: 'a', type: 'githubAction', alias: 'A' },
        { id: 'b', type: 'githubAction', alias: 'B' },
        { id: 'c', type: 'ccTray', alias: 'C' },
        { id: 'd', type: 'sentry', alias: 'D' },
      ]
    );

    expect(model.summary).toEqual({
      total: 4,
      healthy: 1,
      failed: 1,
      mutedFailures: 0,
      checking: 1,
      unavailable: 1,
    });
    expect(model.health).toBe('attention');
  });

  it('counts muted failures as failures and orders them last', () => {
    const model = buildRadiatorModel(
      [
        state('muted', 'Muted', Status.FAILURE, 'run-1', true),
        state('active', 'Active', Status.FAILURE, 'run-2'),
        state('ok', 'OK', Status.SUCCESS),
      ],
      [
        { id: 'muted', type: 'githubAction', alias: 'Muted' },
        { id: 'active', type: 'githubAction', alias: 'Active' },
        { id: 'ok', type: 'sentry', alias: 'OK' },
      ]
    );

    expect(model.summary.failed).toBe(2);
    expect(model.summary.mutedFailures).toBe(1);
    expect(model.failures.map((failure) => failure.name)).toEqual(['Active', 'Muted']);
    expect(model.observers.map((observer) => observer.name)).toEqual(['Muted', 'Active', 'OK']);
  });

  it('distinguishes empty, healthy and unresolved states', () => {
    expect(buildRadiatorModel([]).health).toBe('empty');
    expect(buildRadiatorModel([state('a', 'A', Status.SUCCESS)]).health).toBe('healthy');
    expect(buildRadiatorModel([state('a', 'A', Status.NA)]).health).toBe('unresolved');
    expect(buildRadiatorModel([state('a', 'A', Status.CHECKING)]).health).toBe('unresolved');
  });

  it('uses aliases and structured evidence metadata without inventing facts', () => {
    const model = buildRadiatorModel(
      [state('a', 'GitHub: owner/repo', Status.FAILURE, '1001:1')],
      [{ id: 'a', type: 'githubAction', alias: 'Production build' }],
      { a: { evidence: evidenceSnapshot('a', '1001:1'), analysis: analysisSnapshot('a', '1001:1') } }
    );

    expect(model.failures[0].name).toBe('Production build');
    expect(model.failures[0].type).toBe('githubAction');
    expect(model.failures[0].runStartedAt).toBe('2026-01-15T10:00:00.000Z');
    expect(model.failures[0].cause?.description).toBe('Cause');
    expect(model.failures[0].recommendation?.description).toBe('Check it');
  });

  it('rejects evidence and analysis for a newer failure identity', () => {
    const current = state('a', 'A', Status.FAILURE, 'run-2');
    const oldEvidence = evidenceSnapshot('a', 'run-1');
    const oldAnalysis = analysisSnapshot('a', 'run-1');

    expect(isEvidenceCurrent(current, oldEvidence)).toBe(false);
    expect(isAnalysisCurrent(current, oldAnalysis)).toBe(false);

    const model = buildRadiatorModel([current], [{ id: 'a', type: 'githubAction' }], {
      a: { evidence: oldEvidence, analysis: oldAnalysis },
    });
    expect(model.failures[0].evidence).toBeUndefined();
    expect(model.failures[0].analysis).toBeUndefined();
    expect(model.failures[0].cause).toBeUndefined();
  });

  it('derives the global status with failure first and NA never healthy', () => {
    expect(calculateGlobalStatus([])).toBe(Status.NA);
    expect(calculateGlobalStatus([state('a', 'A', Status.SUCCESS)])).toBe(Status.SUCCESS);
    expect(calculateGlobalStatus([state('a', 'A', Status.SUCCESS), state('b', 'B', Status.CHECKING)])).toBe(
      Status.CHECKING
    );
    expect(calculateGlobalStatus([state('a', 'A', Status.NA), state('b', 'B', Status.SUCCESS)])).toBe(Status.NA);
    expect(calculateGlobalStatus([state('a', 'A', Status.FAILURE, 'run-1'), state('b', 'B', Status.NA)])).toBe(
      Status.FAILURE
    );
  });
});
