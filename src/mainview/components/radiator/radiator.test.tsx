/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RadiatorFailure } from '../../../core/presentation/radiator';
import { DiagnosticEvidence } from '../../../types/Diagnostics';
import { DiagnosticAnalysis } from '../../../types/Intelligence';
import { State } from '../../../types/State';
import { Status } from '../../../types/Status';
import { client } from '../../rpc-client';
import { HandoffCopyButton, HandoffSection } from './Handoff';
import { DiagnosisSetup } from './DiagnosisSetup';
import { StatusSummary } from './StatusSummary';
import { AllObserversList } from './AllObserversList';
import { safeExternalUrl } from './links';

vi.mock('../../rpc-client', () => ({
  client: {
    writeClipboard: vi.fn(),
    openExternal: vi.fn(),
  },
}));

const mockClient = client as any;

const state: State = {
  id: 'observer-1',
  name: 'GitHub: owner/repo',
  status: Status.FAILURE,
  link: 'https://github.com/acme/project/actions/runs/1001',
  error: { id: '1001:1', description: 'Dependency installation failed.' },
};

const evidence: DiagnosticEvidence = {
  schemaVersion: 1,
  observerId: 'observer-1',
  failureId: '1001:1',
  sourceType: 'githubAction',
  collectedAt: '2026-01-15T12:00:00.000Z',
  completeness: 'complete',
  summary: 'Workflow run 1001 failed.',
  items: [
    {
      id: 'execution',
      category: 'execution',
      title: 'Workflow execution: CI',
      content: 'Repository: acme/project',
      timestamp: '2026-01-15T10:00:00.000Z',
    },
    { id: 'error:1:0', category: 'error', title: 'Error excerpt', content: 'npm ERR! code ERESOLVE' },
  ],
  limitations: [],
};

const analysis: DiagnosticAnalysis = {
  schemaVersion: 1,
  observerId: 'observer-1',
  failureId: '1001:1',
  evidenceFingerprint: 'x',
  generatedAt: '2026-01-15T12:01:00.000Z',
  promptVersion: 'v1',
  model: { provider: 'managed', name: 'Mock model' },
  summary: 'Dependencies could not be resolved.',
  findings: [],
  likelyCauses: [{ description: 'A peer dependency conflicts.', evidenceIds: ['error:1:0'], certainty: 'hypothesis' }],
  recommendations: [
    {
      description: 'Inspect the lockfile.',
      rationale: 'The error points there.',
      evidenceIds: ['error:1:0'],
      type: 'investigate',
    },
    {
      description: 'Update the dependency.',
      rationale: 'Resolve the conflict.',
      evidenceIds: ['error:1:0'],
      type: 'potential-fix',
    },
  ],
  evidenceSufficiency: 'sufficient',
  uncertainty: [],
};

const failure = (overrides: Partial<RadiatorFailure> = {}): RadiatorFailure => ({
  observerId: 'observer-1',
  failureId: '1001:1',
  failureKey: 'observer-1:1001:1',
  name: 'Production build',
  type: 'githubAction',
  link: state.link,
  muted: false,
  description: state.error?.description,
  state,
  evidence: { status: 'available', evidence },
  analysis: { status: 'available', analysis },
  evidenceStatus: 'available',
  analysisStatus: 'available',
  validEvidence: evidence,
  validAnalysis: analysis,
  runStartedAt: '2026-01-15T10:00:00.000Z',
  evidenceCollectedAt: '2026-01-15T12:00:00.000Z',
  cause: analysis.likelyCauses[0],
  recommendation: analysis.recommendations[0],
  ...overrides,
});

describe('radiator components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.writeClipboard.mockResolvedValue(true);
    mockClient.openExternal.mockResolvedValue(true);
  });

  it('renders compact and full summaries', () => {
    const summary = {
      total: 4,
      healthy: 2,
      failed: 1,
      mutedFailures: 1,
      checking: 1,
      unavailable: 0,
    };
    const { container, rerender } = render(<StatusSummary summary={summary} />);
    expect(screen.getByLabelText('System health')).toHaveTextContent('2');
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(container.querySelector('.radiator-summary')).not.toHaveClass('is-compact');

    rerender(<StatusSummary summary={summary} compact />);
    expect(container.querySelector('.radiator-summary')).toHaveClass('is-compact');
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('1 muted')).not.toBeInTheDocument();
  });

  it('renders observer rows, opens failures and links healthy sources', () => {
    const onOpen = vi.fn();
    render(
      <AllObserversList
        observers={[
          { observerId: 'a', name: 'Failed one', type: 'githubAction', status: Status.FAILURE, muted: false, state },
          { observerId: 'b', name: 'Healthy one', type: 'sentry', status: Status.SUCCESS, muted: false, state },
        ]}
        onOpenFailure={onOpen}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Failed one/ }));
    expect(onOpen).toHaveBeenCalledWith('a');
    expect(screen.getByText('Healthy one')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open latest result: Healthy one' }));
    expect(mockClient.openExternal).toHaveBeenCalledWith(state.link);
  });

  it('explains diagnosis setup states', () => {
    const onEnable = vi.fn();
    const onSettings = vi.fn();
    const { rerender } = render(
      <DiagnosisSetup
        failure={failure({ evidenceStatus: 'disabled' })}
        onEnableDiagnostics={onEnable}
        onOpenSettings={onSettings}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Turn on diagnostic evidence' }));
    expect(onEnable).toHaveBeenCalled();

    rerender(
      <DiagnosisSetup
        failure={failure({ evidenceStatus: 'unsupported' })}
        onEnableDiagnostics={onEnable}
        onOpenSettings={onSettings}
      />
    );
    expect(screen.getByText(/No detailed evidence for this source/)).toBeInTheDocument();

    rerender(
      <DiagnosisSetup
        failure={failure({ analysisStatus: 'disabled' })}
        onEnableDiagnostics={onEnable}
        onOpenSettings={onSettings}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set up built-in AI' }));
    expect(onSettings).toHaveBeenCalled();

    rerender(
      <DiagnosisSetup
        failure={failure({ analysisStatus: 'runtime_unavailable', analysisReason: 'model_missing' })}
        onEnableDiagnostics={onEnable}
        onOpenSettings={onSettings}
      />
    );
    expect(screen.getByText('The local model is not installed')).toBeInTheDocument();

    rerender(
      <DiagnosisSetup
        failure={failure({ analysisStatus: 'runtime_unavailable', analysisReason: 'consent_required' })}
        onEnableDiagnostics={onEnable}
        onOpenSettings={onSettings}
      />
    );
    expect(screen.getByText('Review the inference destination')).toBeInTheDocument();

    rerender(
      <DiagnosisSetup
        failure={failure({ analysisStatus: 'runtime_unavailable', analysisReason: 'unsupported_hardware' })}
        onEnableDiagnostics={onEnable}
        onOpenSettings={onSettings}
      />
    );
    expect(screen.getByText('Built-in AI is not supported on this computer')).toBeInTheDocument();

    rerender(
      <DiagnosisSetup
        failure={failure({ analysisStatus: 'runtime_unavailable', analysisReason: 'runtime_missing' })}
        onEnableDiagnostics={onEnable}
        onOpenSettings={onSettings}
      />
    );
    expect(screen.getByText('AI is not available right now')).toBeInTheDocument();

    rerender(
      <DiagnosisSetup
        failure={failure({ analysisStatus: 'insufficient_evidence' })}
        onEnableDiagnostics={onEnable}
        onOpenSettings={onSettings}
      />
    );
    expect(screen.getByText('Not enough evidence for a diagnosis')).toBeInTheDocument();

    rerender(<DiagnosisSetup failure={failure()} onEnableDiagnostics={onEnable} onOpenSettings={onSettings} />);
    expect(screen.queryByText('Turn on diagnostic evidence')).not.toBeInTheDocument();
  });

  it('previews, discloses and copies a handoff', async () => {
    render(
      <HandoffSection
        state={state}
        sourceLabel="GitHub Actions"
        evidence={{ status: 'available', evidence }}
        analysis={{ status: 'available', analysis }}
      />
    );

    expect(screen.getByText('Includes AI interpretation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview prompt' }));
    expect(screen.getByText(/\[TRUSTED TASK\]/)).toBeInTheDocument();
    expect(screen.getByText(/Pattern-based redaction is a safety net/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    await screen.findByText('Prompt copied to clipboard.');
    expect(mockClient.writeClipboard).toHaveBeenCalled();
  });

  it('handles evidence-only, missing and failed clipboard handoffs', async () => {
    const { rerender } = render(
      <HandoffSection
        state={state}
        sourceLabel="GitHub Actions"
        evidence={{ status: 'available', evidence }}
        analysis={{ status: 'disabled' }}
      />
    );
    expect(screen.getByText('Evidence only')).toBeInTheDocument();

    rerender(<HandoffSection state={state} sourceLabel="GitHub Actions" />);
    expect(screen.getByText(/Evidence is not available yet/)).toBeInTheDocument();

    mockClient.writeClipboard.mockResolvedValueOnce(false);
    rerender(
      <HandoffSection
        state={state}
        sourceLabel="GitHub Actions"
        evidence={{ status: 'available', evidence }}
        analysis={{ status: 'disabled' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    await screen.findByText('Clipboard unavailable. Select the prompt and copy it manually.');
  });

  it('offers a compact copy control with success, failure and disabled states', async () => {
    const { rerender } = render(
      <HandoffCopyButton
        state={state}
        sourceLabel="GitHub Actions"
        evidence={{ status: 'available', evidence }}
        analysis={{ status: 'available', analysis }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Copy agent prompt/ }));
    await screen.findByText('Prompt copied. Pasting elsewhere may transmit it.');

    mockClient.writeClipboard.mockRejectedValueOnce(new Error('denied'));
    rerender(
      <HandoffCopyButton
        state={state}
        sourceLabel="GitHub Actions"
        evidence={{ status: 'available', evidence }}
        analysis={{ status: 'disabled' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Copy agent prompt/ }));
    await screen.findByText('Clipboard unavailable. Open details to copy manually.');

    rerender(<HandoffCopyButton state={state} sourceLabel="GitHub Actions" />);
    expect(screen.getByRole('button', { name: /Copy agent prompt/ })).toBeDisabled();
  });
});

describe('compact status variants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.writeClipboard.mockResolvedValue(true);
  });

  it('renders all four compact summary counts including zero', () => {
    render(
      <StatusSummary
        compact
        summary={{ total: 2, healthy: 2, failed: 0, mutedFailures: 0, checking: 0, unavailable: 0 }}
      />
    );
    expect(document.querySelector('.radiator-summary.is-compact')).toBeInTheDocument();
    expect(document.querySelectorAll('.radiator-summary-cell')).toHaveLength(4);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Checking')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('muted')).not.toBeInTheDocument();
  });

  it('keeps compact observer rows in-app and hides external links', () => {
    render(
      <AllObserversList
        compact
        observers={[
          { observerId: 'a', name: 'Build', type: 'githubAction', status: Status.FAILURE, muted: false, state },
          { observerId: 'b', name: 'Healthy', type: 'sentry', status: Status.SUCCESS, muted: false, state },
        ]}
        onOpenFailure={() => undefined}
      />
    );
    expect(screen.getByText('Build')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open latest result/ })).not.toBeInTheDocument();
  });

  it('hides unsafe latest-result links in the full list', () => {
    render(
      <AllObserversList
        observers={[
          {
            observerId: 'b',
            name: 'Healthy',
            type: 'sentry',
            status: Status.SUCCESS,
            muted: false,
            state: { ...state, link: 'https://user:pass@example.test/build' },
          },
        ]}
        onOpenFailure={() => undefined}
      />
    );
    expect(screen.queryByRole('button', { name: /Open latest result/ })).not.toBeInTheDocument();
  });
});

describe('safe external links', () => {
  it('rejects credentials, non-http schemes and malformed URLs', () => {
    expect(safeExternalUrl('https://github.com/acme/project/actions/runs/1')).toBe(true);
    expect(safeExternalUrl('https://user:pass@github.com/acme')).toBe(false);
    expect(safeExternalUrl('file:///tmp/build')).toBe(false);
    expect(safeExternalUrl('not a url')).toBe(false);
    expect(safeExternalUrl(undefined)).toBe(false);
  });
});
