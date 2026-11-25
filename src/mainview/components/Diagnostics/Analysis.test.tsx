/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../rpc-client';
import { AnalysisSection } from './Analysis';

vi.mock('../../rpc-client', () => ({
  client: {
    getAnalysis: vi.fn(),
    reanalyze: vi.fn(),
  },
}));

const mockClient = client as any;

const available = {
  status: 'available',
  provider: 'managed',
  model: 'Qwen3',
  assembly: {
    includedEvidenceIds: ['error:1', 'job:1'],
    omittedEvidenceIds: [] as string[],
    truncatedEvidenceIds: [] as string[],
    originalChars: 100,
    includedChars: 100,
    estimatedTokens: 30,
    budgetTokens: 500,
  },
  analysis: {
    schemaVersion: 1,
    observerId: 'observer-1',
    failureId: 'run-1:1',
    evidenceFingerprint: 'fingerprint',
    generatedAt: '2026-01-15T12:00:00.000Z',
    promptVersion: 'diagnostic-analysis-v1',
    model: { provider: 'managed', name: 'Qwen3' },
    summary: 'The build failed on a type error.',
    findings: [{ statement: 'TypeScript reported TS2322.', evidenceIds: ['error:1'] }],
    likelyCauses: [
      { description: 'A string is assigned to a number.', evidenceIds: ['error:1'], certainty: 'supported' },
    ],
    recommendations: [
      {
        description: 'Inspect the cited line.',
        rationale: 'The compiler identifies it.',
        evidenceIds: ['error:1'],
        type: 'investigate',
      },
    ],
    evidenceSufficiency: 'sufficient',
    uncertainty: [] as string[],
  },
};

describe('AnalysisSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders findings, causes, recommendations and citations', async () => {
    mockClient.getAnalysis.mockResolvedValue(available);
    const focus = vi.fn();
    render(<AnalysisSection observerId="observer-1" onFocusEvidence={focus} />);

    expect(await screen.findByText('The build failed on a type error.')).toBeInTheDocument();
    expect(screen.getByText('Observed findings')).toBeInTheDocument();
    expect(screen.getByText('Likely causes')).toBeInTheDocument();
    expect(screen.getByText('Recommended next steps')).toBeInTheDocument();
    expect(screen.getByText(/Evidence used:\s*2/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Show evidence error:1/ })[0]);
    expect(focus).toHaveBeenCalledWith('error:1');
  });

  it('shows disabled, insufficient and failed states', async () => {
    mockClient.getAnalysis.mockResolvedValue({ status: 'disabled' });
    const { unmount } = render(<AnalysisSection observerId="observer-1" onFocusEvidence={() => undefined} />);
    expect((await screen.findAllByText('Intelligence is disabled.')).length).toBeGreaterThan(0);
    unmount();

    mockClient.getAnalysis.mockResolvedValue({
      status: 'insufficient_evidence',
      reason: 'evidence_unavailable',
    });
    const second = render(<AnalysisSection observerId="observer-1" onFocusEvidence={() => undefined} />);
    expect(await screen.findByText('The source did not return enough usable evidence.')).toBeInTheDocument();
    second.unmount();

    mockClient.getAnalysis.mockResolvedValue({ status: 'failed', reason: 'invalid_response' });
    render(<AnalysisSection observerId="observer-1" onFocusEvidence={() => undefined} />);
    expect(await screen.findByText('The model returned a response that failed validation.')).toBeInTheDocument();
  });

  it('exposes an accessible reanalysis action', async () => {
    mockClient.getAnalysis.mockResolvedValue({ status: 'available', analysis: available.analysis });
    mockClient.reanalyze.mockResolvedValue(undefined);
    render(<AnalysisSection observerId="observer-1" onFocusEvidence={() => undefined} />);
    await screen.findByText('The build failed on a type error.');
    fireEvent.click(screen.getByRole('button', { name: 'Analyze again' }));
    expect(mockClient.reanalyze).toHaveBeenCalledWith('observer-1');
  });

  it('shows a load error and retries', async () => {
    mockClient.getAnalysis
      .mockRejectedValueOnce(new Error('runtime unavailable'))
      .mockResolvedValueOnce({ status: 'disabled' });
    render(<AnalysisSection observerId="observer-1" onFocusEvidence={() => undefined} />);
    expect(await screen.findByText('Analysis could not be loaded.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect((await screen.findAllByText('Intelligence is disabled.')).length).toBeGreaterThan(0);
  });
});
