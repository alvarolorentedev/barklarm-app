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
import { FailureCard } from './FailureCard';
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

  it('renders a complete failure card and copies the handoff', async () => {
    const onOpen = vi.fn();
    render(<FailureCard failure={failure()} onOpenDetails={onOpen} />);

    expect(screen.getByText('Production build')).toBeInTheDocument();
    expect(screen.getByText('GitHub Actions')).toBeInTheDocument();
    expect(screen.getByText('Dependency installation failed.')).toBeInTheDocument();
    expect(screen.getByText('A peer dependency conflicts.')).toBeInTheDocument();
    expect(screen.getByText('Inspect the lockfile.')).toBeInTheDocument();
    expect(screen.getByText('hypothesis')).toBeInTheDocument();
    expect(screen.getByText(/investigate/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Details/ }));
    expect(onOpen).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Copy prompt/ }));
    await screen.findByText('Prompt copied. Pasting elsewhere may transmit it.');
    expect(mockClient.writeClipboard).toHaveBeenCalledWith(expect.stringContaining('[TRUSTED TASK]'));
  });

  it('renders card variants without evidence and for muted failures', () => {
    const { rerender } = render(
      <FailureCard
        failure={failure({
          evidence: undefined,
          analysis: undefined,
          evidenceStatus: 'collecting',
          analysisStatus: 'waiting_for_evidence',
        })}
        onOpenDetails={() => undefined}
      />
    );
    expect(screen.getByText(/Collecting evidence/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy prompt/ })).toBeDisabled();

    rerender(
      <FailureCard
        failure={failure({
          muted: true,
          evidenceStatus: 'unsupported',
          analysisStatus: 'disabled',
          validAnalysis: undefined,
          analysis: undefined,
          cause: undefined,
          recommendation: undefined,
        })}
        onOpenDetails={() => undefined}
      />
    );
    expect(screen.getByText('Muted')).toBeInTheDocument();
    expect(screen.getByText(/No detailed evidence for this source/)).toBeInTheDocument();
    expect(screen.getByText(/AI off/)).toBeInTheDocument();
  });

  it('shows a concise summary when no cause is available', () => {
    const withoutCause = analysis.likelyCauses[0];
    render(
      <FailureCard
        failure={failure({
          validAnalysis: { ...analysis, likelyCauses: [], recommendations: [] },
          cause: undefined,
          recommendation: undefined,
        })}
        onOpenDetails={() => undefined}
      />
    );
    expect(screen.getByText('AI summary')).toBeInTheDocument();
    expect(screen.getByText('Dependencies could not be resolved.')).toBeInTheDocument();
    expect(withoutCause.description).toBeTruthy();
  });

  it('opens safe source links and hides unsafe ones', () => {
    const { rerender } = render(<FailureCard failure={failure()} onOpenDetails={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open source' }));
    expect(mockClient.openExternal).toHaveBeenCalledWith(state.link);

    rerender(
      <FailureCard
        failure={failure({ link: 'https://user:pass@example.test/build' })}
        onOpenDetails={() => undefined}
      />
    );
    expect(screen.queryByRole('button', { name: 'Open source' })).not.toBeInTheDocument();
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
    const { rerender } = render(<StatusSummary summary={summary} />);
    expect(screen.getByLabelText('System health')).toHaveTextContent('2');
    expect(screen.getByText('Failed')).toBeInTheDocument();

    rerender(<StatusSummary summary={summary} compact />);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1 muted')).toBeInTheDocument();
  });

  it('renders observer rows and opens failures', () => {
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
    expect(screen.queryByRole('button', { name: /Healthy one/ })).not.toBeInTheDocument();
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

  it('renders the compact healthy summary without zero categories', () => {
    render(
      <StatusSummary
        compact
        summary={{ total: 2, healthy: 2, failed: 0, mutedFailures: 0, checking: 0, unavailable: 0 }}
      />
    );
    expect(document.querySelector('.radiator-health-line')?.textContent).toContain('2');
    expect(document.querySelector('.radiator-health-line')?.textContent).toContain('healthy');
    expect(document.querySelector('.radiator-health-line')?.textContent).not.toContain('failed');
  });

  it('renders each compact evidence and analysis status', () => {
    const cases: Array<[any, any, string, string]> = [
      ['queued', 'queued', 'Collecting evidence…', 'Analyzing…'],
      ['partial', 'available', 'Evidence partial', 'AI diagnosis'],
      ['unavailable', 'insufficient_evidence', 'Evidence unavailable', 'Not enough evidence'],
      ['failed', 'failed', 'Evidence collection failed', 'Analysis failed'],
      ['not_collected', 'runtime_unavailable', 'Waiting for evidence', 'AI unavailable'],
      ['disabled', 'disabled', 'Diagnostics off', 'AI off'],
      ['unsupported', 'waiting_for_evidence', 'No detailed evidence for this source', ''],
      [undefined, undefined, 'Checking evidence…', ''],
    ];

    const { rerender } = render(
      <FailureCard
        failure={failure({
          evidence: undefined,
          analysis: undefined,
          validAnalysis: undefined,
          cause: undefined,
          recommendation: undefined,
        })}
        onOpenDetails={() => undefined}
        compact
      />
    );
    for (const [evidenceStatus, analysisStatus, evidenceCopy, analysisCopy] of cases) {
      rerender(
        <FailureCard
          compact
          failure={failure({
            evidence: undefined,
            analysis: undefined,
            evidenceStatus,
            analysisStatus,
            validAnalysis: undefined,
            cause: undefined,
            recommendation: undefined,
          })}
          onOpenDetails={() => undefined}
        />
      );
      const card = document.querySelector('.radiator-failure') as HTMLElement;
      expect(card.textContent).toContain(evidenceCopy);
      if (analysisCopy) expect(card.textContent).toContain(analysisCopy);
      if (analysisStatus === 'waiting_for_evidence') expect(card.textContent).not.toContain('Waiting for AI');
    }
  });

  it('renders compact observer rows and invalid source links', () => {
    render(
      <AllObserversList
        compact
        observers={[
          { observerId: 'a', name: 'Build', type: 'githubAction', status: Status.FAILURE, muted: false, state },
        ]}
        onOpenFailure={() => undefined}
      />
    );
    expect(screen.getByText('Build')).toBeInTheDocument();

    const { unmount } = render(
      <FailureCard failure={failure({ link: 'not-a-url' })} onOpenDetails={() => undefined} />
    );
    expect(screen.queryByRole('button', { name: 'Open source' })).not.toBeInTheDocument();
    unmount();
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
