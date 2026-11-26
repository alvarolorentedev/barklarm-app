/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from './rpc-client';
import { App } from './app';
import { DiagnosticEvidence } from '../types/Diagnostics';
import { DiagnosticAnalysis } from '../types/Intelligence';
import { State } from '../types/State';
import { Status } from '../types/Status';

vi.mock('./rpc-client', () => ({
  client: {
    getStore: vi.fn(),
    setStore: vi.fn(),
    refreshObservers: vi.fn(),
    getObserverStates: vi.fn(),
    getDiagnosticEvidence: vi.fn(),
    recollectDiagnosticEvidence: vi.fn(),
    getAnalysis: vi.fn(),
    reanalyze: vi.fn(),
    getIntelligenceStatus: vi.fn(),
    startModelDownload: vi.fn(),
    cancelModelDownload: vi.fn(),
    removeModel: vi.fn(),
    ensureManagedRuntime: vi.fn(),
    stopManagedRuntime: vi.fn(),
    getProviderKey: vi.fn(),
    setProviderKey: vi.fn(),
    deleteProviderKey: vi.fn(),
    isDestinationApproved: vi.fn(),
    approveDestination: vi.fn(),
    revokeDestination: vi.fn(),
    testInferenceProvider: vi.fn(),
    writeClipboard: vi.fn(),
    openIssue: vi.fn(),
    openMainWindow: vi.fn(),
    hideWindow: vi.fn(),
    setTrayPanelHeight: vi.fn(),
    openExternal: vi.fn(),
    importConfig: vi.fn(),
    exportConfig: vi.fn(),
    quit: vi.fn(),
    logError: vi.fn(),
  },
}));

const mockClient = client as any;

const failureState: State = {
  id: 'o1',
  name: 'GitHub: acme/project',
  status: Status.FAILURE,
  link: 'https://github.com/acme/project/actions/runs/1001',
  error: { id: '1001:1', description: 'Dependency installation failed.' },
};

const evidence: DiagnosticEvidence = {
  schemaVersion: 1,
  observerId: 'o1',
  failureId: '1001:1',
  sourceType: 'githubAction',
  collectedAt: '2026-01-15T12:00:00.000Z',
  completeness: 'complete',
  summary: 'Workflow run 1001 failed.',
  items: [
    {
      id: 'error:1:0',
      category: 'error',
      title: 'Error excerpt',
      content: 'npm ERR! code ERESOLVE',
      source: { url: 'https://github.com/acme/project/actions/runs/1001' },
    },
  ],
  limitations: [],
};

const analysis: DiagnosticAnalysis = {
  schemaVersion: 1,
  observerId: 'o1',
  failureId: '1001:1',
  evidenceFingerprint: 'fingerprint',
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
  ],
  evidenceSufficiency: 'sufficient',
  uncertainty: [],
};

const configs = [{ id: 'o1', type: 'githubAction', alias: 'CloudLink · CI' }];

const renderApp = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getStore.mockImplementation((key: string) =>
      Promise.resolve(key === 'observables' ? configs : undefined)
    );
    mockClient.getObserverStates.mockResolvedValue([failureState]);
    mockClient.getDiagnosticEvidence.mockResolvedValue({ status: 'available', evidence });
    mockClient.getAnalysis.mockResolvedValue({ status: 'available', analysis });
    mockClient.recollectDiagnosticEvidence.mockResolvedValue(undefined);
    mockClient.reanalyze.mockResolvedValue(undefined);
    mockClient.writeClipboard.mockResolvedValue(true);
    mockClient.openExternal.mockResolvedValue(true);
    mockClient.openIssue.mockResolvedValue(true);
    mockClient.openMainWindow.mockResolvedValue(undefined);
    mockClient.hideWindow.mockResolvedValue(undefined);
    mockClient.setTrayPanelHeight.mockResolvedValue(undefined);
    mockClient.setStore.mockResolvedValue(undefined);
    mockClient.quit.mockResolvedValue(true);
  });

  it('redirects to the radiator by default and shows the empty state', async () => {
    mockClient.getObserverStates.mockResolvedValue([]);
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Add your first observer' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Radiator' })).toBeInTheDocument();
    expect(screen.getByText('Barklarm')).toBeInTheDocument();
  });

  it('redirects the legacy general route to settings', async () => {
    mockClient.getObserverStates.mockResolvedValue([]);
    renderApp('/general');

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
  });

  it('renders the Radiator, opens a failure and focuses cited evidence', async () => {
    renderApp('/radiator');

    const card = await screen.findByRole('article', { name: /CloudLink · CI/ });
    expect(card).toHaveTextContent('Dependency installation failed.');
    await waitFor(() => expect(card).toHaveTextContent('Likely cause'));
    expect(card).toHaveTextContent('Next step');

    fireEvent.click(screen.getByRole('button', { name: /Details/ }));
    expect(await screen.findByRole('heading', { name: 'What happened' })).toBeInTheDocument();
    expect(screen.getByText('Inspect the lockfile.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show evidence error:1:0/ }));
    expect(document.getElementById('evidence-error:1:0')).toHaveFocus();
  });

  it('renders the compact tray overlay and keeps detail and handoff inside it', async () => {
    renderApp('/tray');

    expect(await screen.findByText('1 needs attention')).toBeInTheDocument();
    expect(screen.getAllByText('CloudLink · CI').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Radiator' })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Details/ })[0]);
    expect(await screen.findByRole('heading', { name: 'What happened' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Preview prompt/ }));
    expect(await screen.findByText('Hand off to a coding agent')).toBeInTheDocument();
    expect(screen.getByText(/\[TRUSTED TASK\]/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));
    expect(mockClient.writeClipboard).toHaveBeenCalledWith(expect.stringContaining('[UNTRUSTED EVIDENCE'));
  });

  it('handles tray escape, close and settings actions', async () => {
    renderApp('/tray');
    await screen.findByText('1 needs attention');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockClient.hideWindow).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockClient.hideWindow).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(mockClient.openMainWindow).toHaveBeenCalled());
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('renders compact healthy and empty tray states without the healthy panel', async () => {
    mockClient.getObserverStates.mockResolvedValue([
      { id: 'o1', name: 'Build', status: Status.SUCCESS, link: 'https://example.test' },
    ]);
    const { unmount } = renderApp('/tray');
    expect(await screen.findByText('All healthy')).toBeInTheDocument();
    expect(document.querySelector('.radiator-health-line')?.textContent).toContain('1');
    expect(document.querySelector('.radiator-health-line')?.textContent).toContain('healthy');
    expect(screen.queryByText('All monitored systems are healthy.')).not.toBeInTheDocument();
    unmount();

    mockClient.getObserverStates.mockResolvedValue([]);
    renderApp('/tray');
    expect(await screen.findByText('No observers yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add observer' })).toBeInTheDocument();
  });

  it('shows a resolved state instead of a stale diagnosis', async () => {
    mockClient.getObserverStates.mockResolvedValue([
      { id: 'o1', name: 'CloudLink · CI', status: Status.SUCCESS, link: 'https://example.test' },
    ]);
    renderApp('/radiator/observer/o1');

    expect(await screen.findByText('This failure resolved')).toBeInTheDocument();
    expect(screen.queryByText('AI analysis')).not.toBeInTheDocument();
  });
});

describe('tray and detail edge states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getStore.mockImplementation((key: string) =>
      Promise.resolve(key === 'observables' ? configs : undefined)
    );
    mockClient.getObserverStates.mockResolvedValue([failureState]);
    mockClient.getDiagnosticEvidence.mockResolvedValue({ status: 'available', evidence });
    mockClient.getAnalysis.mockResolvedValue({ status: 'available', analysis });
    mockClient.openMainWindow.mockResolvedValue(undefined);
    mockClient.hideWindow.mockResolvedValue(undefined);
    mockClient.setTrayPanelHeight.mockResolvedValue(undefined);
    mockClient.writeClipboard.mockResolvedValue(true);
    mockClient.quit.mockResolvedValue(true);
  });

  it('describes checking and unavailable tray headers', async () => {
    mockClient.getObserverStates.mockResolvedValue([
      { id: 'o1', name: 'Checking build', status: Status.CHECKING, link: 'https://example.test' },
    ]);
    const first = renderApp('/tray');
    await waitFor(() => expect(document.querySelector('.tray-head-status')?.textContent).toContain('Checking'));
    first.unmount();

    mockClient.getObserverStates.mockResolvedValue([
      { id: 'o1', name: 'Unavailable build', status: Status.NA, link: 'https://example.test' },
    ]);
    renderApp('/tray');
    await waitFor(() =>
      expect(document.querySelector('.tray-head-status')?.textContent).toContain('No active failures')
    );
  });

  it('handles missing and resolved tray failures', async () => {
    mockClient.getObserverStates.mockResolvedValue([]);
    const missing = renderApp('/tray/observer/missing');
    expect(await screen.findByText('Observer not found.')).toBeInTheDocument();
    missing.unmount();

    mockClient.getObserverStates.mockResolvedValue([
      { id: 'o1', name: 'CloudLink · CI', status: Status.SUCCESS, link: 'https://example.test' },
    ]);
    renderApp('/tray/observer/o1');
    expect(await screen.findByText('This failure resolved')).toBeInTheDocument();
  });

  it('handles a missing full failure and a tray handoff without a failure', async () => {
    mockClient.getObserverStates.mockResolvedValue([]);
    const missing = renderApp('/radiator/observer/missing');
    expect(await screen.findByText('Observer not found')).toBeInTheDocument();
    missing.unmount();

    renderApp('/tray/handoff/missing');
    expect(await screen.findByText('Evidence is not available for this failure.')).toBeInTheDocument();
  });
});

describe('presentation edge states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getStore.mockImplementation((key: string) =>
      Promise.resolve(key === 'observables' ? configs : undefined)
    );
    mockClient.openMainWindow.mockResolvedValue(undefined);
    mockClient.hideWindow.mockResolvedValue(undefined);
    mockClient.setTrayPanelHeight.mockResolvedValue(undefined);
    mockClient.writeClipboard.mockResolvedValue(true);
    mockClient.quit.mockResolvedValue(true);
  });

  it('renders the full healthy and unresolved Radiator states', async () => {
    mockClient.getObserverStates.mockResolvedValue([
      { id: 'o1', name: 'Build', status: Status.SUCCESS, link: 'https://example.test' },
    ]);
    const healthy = renderApp('/radiator');
    expect(await screen.findByText('All monitored systems are healthy.')).toBeInTheDocument();
    healthy.unmount();

    mockClient.getObserverStates.mockResolvedValue([
      { id: 'o1', name: 'Build', status: Status.NA, link: 'https://example.test' },
    ]);
    renderApp('/radiator');
    expect(await screen.findByText('No active failures')).toBeInTheDocument();
  });

  it('does not claim a checking or unavailable observer resolved', async () => {
    mockClient.getObserverStates.mockResolvedValue([
      { id: 'o1', name: 'Build', status: Status.CHECKING, link: 'https://example.test' },
    ]);
    const checking = renderApp('/radiator/observer/o1');
    expect(await screen.findByText('Checking this observer')).toBeInTheDocument();
    expect(screen.queryByText('This failure resolved')).not.toBeInTheDocument();
    checking.unmount();

    mockClient.getObserverStates.mockResolvedValue([
      { id: 'o1', name: 'Build', status: Status.NA, link: 'https://example.test' },
    ]);
    renderApp('/tray/observer/o1');
    expect(await screen.findByText('Observer unavailable')).toBeInTheDocument();
    expect(screen.queryByText('This failure resolved')).not.toBeInTheDocument();
  });

  it('rejects stale evidence and analysis on a failure detail', async () => {
    mockClient.getObserverStates.mockResolvedValue([failureState]);
    mockClient.getDiagnosticEvidence.mockResolvedValue({
      status: 'available',
      evidence: { ...evidence, failureId: 'old' },
    });
    mockClient.getAnalysis.mockResolvedValue({ status: 'available', analysis: { ...analysis, failureId: 'old' } });

    renderApp('/radiator/observer/o1');

    expect(await screen.findByText('No diagnostic evidence is available.')).toBeInTheDocument();
    expect(await screen.findByText('The analysis was discarded because the evidence changed.')).toBeInTheDocument();
    expect(screen.queryByText('npm ERR! code ERESOLVE')).not.toBeInTheDocument();
    expect(screen.queryByText('A peer dependency conflicts.')).not.toBeInTheDocument();
  });
});

describe('Radiator filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getStore.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => ({ id: `o${index}`, type: 'githubAction', alias: `Observer ${index}` }))
    );
    mockClient.getObserverStates.mockResolvedValue([
      { id: 'o0', name: 'Healthy A', status: Status.SUCCESS, link: '' },
      { id: 'o1', name: 'Healthy B', status: Status.SUCCESS, link: '' },
      { id: 'o2', name: 'Healthy C', status: Status.SUCCESS, link: '' },
      { id: 'o3', name: 'Failed A', status: Status.FAILURE, link: '', muted: true, error: { id: 'f1' } },
      { id: 'o4', name: 'Failed B', status: Status.FAILURE, link: '', error: { id: 'f2' } },
      { id: 'o5', name: 'Checking', status: Status.CHECKING, link: '' },
      { id: 'o6', name: 'Unavailable', status: Status.NA, link: '' },
    ]);
    mockClient.getDiagnosticEvidence.mockResolvedValue({ status: 'disabled' });
    mockClient.getAnalysis.mockResolvedValue({ status: 'disabled' });
    mockClient.refreshObservers.mockResolvedValue(undefined);
  });

  it('filters the all-observer list without changing the underlying model', async () => {
    renderApp('/radiator');

    await waitFor(() => expect(document.querySelectorAll('.radiator-observer-row')).toHaveLength(7));

    fireEvent.click(screen.getByRole('button', { name: 'Failed' }));
    expect(document.querySelectorAll('.radiator-observer-row')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Healthy' }));
    expect(document.querySelectorAll('.radiator-observer-row')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Checking or unavailable' }));
    expect(document.querySelectorAll('.radiator-observer-row')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Muted' }));
    expect(document.querySelectorAll('.radiator-observer-row')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(document.querySelectorAll('.radiator-observer-row')).toHaveLength(7);
  });
});
