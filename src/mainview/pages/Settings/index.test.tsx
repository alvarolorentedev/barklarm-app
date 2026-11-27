/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Settings } from './index';
import { expect, describe, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  saveBrowser: vi.fn(),
}));

vi.mock('../../rpc-client', () => ({
  client: {
    getStore: vi.fn().mockResolvedValue(undefined),
    setStore: vi.fn().mockResolvedValue(undefined),
    getIntelligenceStatus: vi.fn().mockResolvedValue({
      mode: 'disabled',
      model: {
        id: 'mock',
        displayName: 'Mock model',
        version: '1',
        quantization: 'Q4',
        fileName: 'mock.gguf',
        sizeBytes: 1000,
        sha256: 'x',
        license: 'Apache-2.0',
        licenseUrl: '',
        contextLength: 8192,
        recommendedContext: 8192,
        minRamGb: 8,
        recommendedRamGb: 16,
        runtimeMinBuild: 1,
        installed: false,
        status: 'not_installed',
      },
      download: { modelId: 'mock', status: 'idle', receivedBytes: 0, totalBytes: 1000 },
      runtime: { state: 'stopped' },
      hardware: {
        os: 'macOS',
        arch: 'arm64',
        totalMemoryBytes: 17179869184,
        availableMemoryBytes: 8589934592,
        freeDiskBytes: 34359738368,
        cpuCount: 8,
        managedRuntimeSupported: true,
      },
      providerConfigured: false,
      providerKeyPresent: false,
      consentRequired: false,
      destinationApproved: false,
    }),
    startModelDownload: vi.fn(),
    cancelModelDownload: vi.fn(),
    removeModel: vi.fn(),
    setProviderKey: vi.fn(),
    deleteProviderKey: vi.fn(),
    testInferenceProvider: vi.fn(),
    approveDestination: vi.fn(),
  },
}));

vi.mock('./helpers/storage', () => ({
  storage: () => ({
    getSslDisabled: vi.fn().mockResolvedValue(false),
    saveSslDisabled: vi.fn(),
    getRefreshInterval: vi.fn().mockResolvedValue(60000),
    saveRefreshInterval: vi.fn(),
    getissueGlobalEndpoint: vi.fn().mockResolvedValue(''),
    saveissueGlobalEndpoint: vi.fn(),
    getBrowser: vi.fn().mockResolvedValue(''),
    saveBrowser: storageMocks.saveBrowser,
    listBrowsers: vi.fn().mockResolvedValue([
      { id: 'chrome', name: 'Google Chrome' },
      { id: 'firefox', name: 'Firefox' },
    ]),
    getAutostart: vi.fn().mockResolvedValue(true),
    saveAutostart: vi.fn(),
    getDiagnosticsEnabled: vi.fn().mockResolvedValue(false),
    saveDiagnosticsEnabled: vi.fn(),
    importConfig: vi.fn(),
    exportConfig: vi.fn(),
    quit: vi.fn(),
  }),
}));

describe('Settings', () => {
  it('renders the native settings groups', async () => {
    render(<Settings />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Monitoring')).toBeInTheDocument();
    expect(screen.getByLabelText('Refresh interval')).toHaveValue(1);
    expect(screen.getByRole('switch', { name: 'Diagnostic evidence' })).not.toBeChecked();
    expect(screen.getByText('Startup')).toBeInTheDocument();
    expect(screen.getByLabelText('Start at login')).toBeInTheDocument();
    expect(screen.getByText('Backup')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('Quit Barklarm')).toBeInTheDocument();
  });

  it('toggles diagnostic collection locally', async () => {
    render(<Settings />);
    const toggle = screen.getByRole('switch', { name: 'Diagnostic evidence' });
    await screen.findByText('Diagnostics');

    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
  });

  it('chooses a browser and resets it to the system default', async () => {
    render(<Settings />);
    const select = screen.getByLabelText('Browser') as HTMLSelectElement;
    await screen.findByRole('option', { name: 'Google Chrome' });
    expect(select).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Firefox' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'firefox' } });
    expect(select).toHaveValue('firefox');
    expect(storageMocks.saveBrowser).toHaveBeenCalledWith('firefox');

    fireEvent.change(select, { target: { value: '' } });
    expect(select).toHaveValue('');
    expect(storageMocks.saveBrowser).toHaveBeenLastCalledWith('');
  });
});
