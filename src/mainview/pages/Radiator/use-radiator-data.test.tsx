/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../rpc-client';
import { DiagnosticEvidence } from '../../../types/Diagnostics';
import { DiagnosticAnalysis } from '../../../types/Intelligence';
import { State } from '../../../types/State';
import { Status } from '../../../types/Status';
import { useRadiatorData } from './use-radiator-data';

vi.mock('../../rpc-client', () => ({
  client: {
    getDiagnosticEvidence: vi.fn(),
    getAnalysis: vi.fn(),
  },
}));

const mockClient = client as any;

const evidence: DiagnosticEvidence = {
  schemaVersion: 1,
  observerId: 'o1',
  failureId: 'run-1',
  sourceType: 'githubAction',
  collectedAt: '2026-01-15T12:00:00.000Z',
  completeness: 'complete',
  summary: 'Failed',
  items: [{ id: 'execution', category: 'execution', title: 'Execution', content: 'Run: 1' }],
  limitations: [],
};

const analysis: DiagnosticAnalysis = {
  schemaVersion: 1,
  observerId: 'o1',
  failureId: 'run-1',
  evidenceFingerprint: 'x',
  generatedAt: '2026-01-15T12:01:00.000Z',
  promptVersion: 'v1',
  model: { provider: 'managed', name: 'Mock' },
  summary: 'Summary',
  findings: [],
  likelyCauses: [],
  recommendations: [],
  evidenceSufficiency: 'sufficient',
  uncertainty: [],
};

const failure = (errorId = 'run-1'): State => ({
  id: 'o1',
  name: 'Build',
  status: Status.FAILURE,
  link: 'https://example.test',
  error: { id: errorId, description: 'Failed' },
});

describe('useRadiatorData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getDiagnosticEvidence.mockResolvedValue({ status: 'available', evidence });
    mockClient.getAnalysis.mockResolvedValue({ status: 'available', analysis });
  });

  it('fetches once per failure identity and exposes snapshots', async () => {
    const { result, rerender } = renderHook(({ states }) => useRadiatorData(states), {
      initialProps: { states: [failure()] },
    });

    await waitFor(() => expect(result.current.snapshots.o1?.loading).toBe(false));
    expect(result.current.snapshots.o1?.evidence?.status).toBe('available');
    expect(mockClient.getDiagnosticEvidence).toHaveBeenCalledTimes(1);

    rerender({ states: [{ ...failure(), name: 'Renamed build' }] });
    await waitFor(() => expect(result.current.snapshots.o1?.evidence?.status).toBe('available'));
    expect(mockClient.getDiagnosticEvidence).toHaveBeenCalledTimes(1);

    rerender({ states: [failure('run-2')] });
    await waitFor(() => expect(mockClient.getDiagnosticEvidence).toHaveBeenCalledTimes(2));
  });

  it('reloads explicitly and handles absent failures', async () => {
    const { result, rerender } = renderHook(({ states }) => useRadiatorData(states), {
      initialProps: { states: [failure()] },
    });
    await waitFor(() => expect(result.current.snapshots.o1?.loading).toBe(false));

    act(() => result.current.reload());
    await waitFor(() => expect(mockClient.getDiagnosticEvidence).toHaveBeenCalledTimes(2));

    rerender({ states: [{ id: 'o2', name: 'Healthy', status: Status.SUCCESS, link: '' }] });
    await waitFor(() => expect(result.current.snapshots).toEqual({}));
  });

  it('marks a failed read without hiding the observer', async () => {
    mockClient.getDiagnosticEvidence.mockRejectedValueOnce(new Error('runtime'));
    const { result } = renderHook(() => useRadiatorData([failure()]));

    await waitFor(() => expect(result.current.snapshots.o1?.error).toBe(true));
    expect(result.current.snapshots.o1?.loading).toBe(false);
  });
});
