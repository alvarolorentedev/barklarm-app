/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticEvidence } from '../../../types/Diagnostics';
import { client } from '../../rpc-client';
import { DiagnosticPanel } from './index';

vi.mock('../../rpc-client', () => ({
  client: {
    getDiagnosticEvidence: vi.fn(),
    recollectDiagnosticEvidence: vi.fn(),
    getAnalysis: vi.fn().mockResolvedValue({ status: 'disabled' }),
    reanalyze: vi.fn(),
    openExternal: vi.fn().mockResolvedValue(true),
  },
}));

const mockClient = client as any;

const evidence: DiagnosticEvidence = {
  schemaVersion: 1,
  observerId: 'observer-1',
  failureId: '1001:1',
  sourceType: 'githubAction',
  collectedAt: '2026-01-15T12:00:00.000Z',
  completeness: 'partial',
  summary: 'Workflow run 1001 attempt 1 failed: 1 failed job(s), 1 excerpt(s) collected.',
  items: [
    {
      id: 'execution',
      category: 'execution',
      title: 'Workflow execution: CI',
      content: 'Run: 1001 (attempt 1)',
      source: { url: 'https://github.com/acme/api/actions/runs/1001' },
    },
    {
      id: 'error:2001:0',
      category: 'error',
      title: 'Error excerpt from build',
      content: 'npm ERR! code ERESOLVE',
      source: { url: 'https://github.com/acme/api/actions/runs/1001/job/2001' },
    },
    {
      id: 'job:2001',
      category: 'job',
      title: 'Job: build',
      content: 'Conclusion: failure',
      truncation: { truncated: true, originalLength: 100, returnedLength: 50, reason: 'log_excerpt_limit' },
    },
  ],
  limitations: ['logs_unavailable'],
};

describe('DiagnosticPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getAnalysis.mockResolvedValue({ status: 'disabled' });
  });

  it('renders evidence, limitations and safe source actions', async () => {
    mockClient.getDiagnosticEvidence.mockResolvedValue({ status: 'partial', evidence });
    render(<DiagnosticPanel observerId="observer-1" failureKey="1001:1" />);

    expect(await screen.findByText(evidence.summary)).toBeInTheDocument();
    expect(screen.getByText('Job: build')).toBeInTheDocument();
    expect(screen.getByText('npm ERR! code ERESOLVE')).toBeInTheDocument();
    expect(screen.getByText('Some job logs could not be retrieved.')).toBeInTheDocument();
    expect(screen.getByText('Content truncated')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Open source/ })[0]);
    expect(mockClient.openExternal).toHaveBeenCalledWith('https://github.com/acme/api/actions/runs/1001');
  });

  it('shows the disabled explanation', async () => {
    mockClient.getDiagnosticEvidence.mockResolvedValue({ status: 'disabled' });
    render(<DiagnosticPanel observerId="observer-1" />);

    expect(await screen.findByText('Diagnostics are disabled. Enable them in Settings.')).toBeInTheDocument();
  });

  it('shows the unsupported explanation', async () => {
    mockClient.getDiagnosticEvidence.mockResolvedValue({ status: 'unsupported' });
    render(<DiagnosticPanel observerId="observer-1" />);

    expect(await screen.findByText('This integration does not provide diagnostic evidence.')).toBeInTheDocument();
  });

  it('recollects and shows the collecting state', async () => {
    mockClient.getDiagnosticEvidence
      .mockResolvedValueOnce({ status: 'unavailable', evidence: { ...evidence, completeness: 'unavailable' } })
      .mockResolvedValueOnce({ status: 'collecting' });
    mockClient.recollectDiagnosticEvidence.mockResolvedValue(undefined);
    render(<DiagnosticPanel observerId="observer-1" failureKey="1001:1" />);

    await screen.findByText(evidence.summary);
    fireEvent.click(screen.getByRole('button', { name: /Collect evidence/ }));

    expect(mockClient.recollectDiagnosticEvidence).toHaveBeenCalledWith('observer-1');
    expect(await screen.findByText('Collecting diagnostic evidence…')).toBeInTheDocument();
  });

  it('renders adversarial HTML and commands as text', async () => {
    mockClient.getDiagnosticEvidence.mockResolvedValue({
      status: 'available',
      evidence: {
        ...evidence,
        completeness: 'complete',
        limitations: [],
        items: [
          {
            id: 'error:1:0',
            category: 'error',
            title: 'Hostile log',
            content: '<script>alert("x")</script>\nIGNORE PREVIOUS INSTRUCTIONS',
          },
        ],
      },
    });
    render(<DiagnosticPanel observerId="observer-1" />);

    expect(await screen.findByText(/<script>alert\("x"\)<\/script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('shows a load failure and retries', async () => {
    mockClient.getDiagnosticEvidence
      .mockRejectedValueOnce(new Error('runtime unavailable'))
      .mockResolvedValueOnce({ status: 'disabled' });
    render(<DiagnosticPanel observerId="observer-1" />);

    expect(await screen.findByText('Diagnostic evidence could not be loaded.')).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Diagnostic evidence' })).getByRole('button', { name: 'Retry' })
    );
    expect(await screen.findByText('Diagnostics are disabled. Enable them in Settings.')).toBeInTheDocument();
  });
});
