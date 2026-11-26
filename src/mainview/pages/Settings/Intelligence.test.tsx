/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../rpc-client';
import { IntelligenceSettings } from './Intelligence';

vi.mock('../../rpc-client', () => ({
  client: {
    getStore: vi.fn(),
    setStore: vi.fn(),
    getIntelligenceStatus: vi.fn(),
    startModelDownload: vi.fn(),
    cancelModelDownload: vi.fn(),
    removeModel: vi.fn(),
    setProviderKey: vi.fn(),
    deleteProviderKey: vi.fn(),
    testInferenceProvider: vi.fn(),
    approveDestination: vi.fn(),
  },
}));

const mockClient = client as any;

function status(overrides: Record<string, any> = {}) {
  return {
    mode: 'disabled',
    model: {
      id: 'qwen',
      displayName: 'Qwen3 1.7B',
      version: '1',
      quantization: 'Q4_K_M',
      fileName: 'qwen.gguf',
      sizeBytes: 1107409472,
      sha256: 'x',
      license: 'Apache-2.0',
      licenseUrl: '',
      contextLength: 32768,
      recommendedContext: 8192,
      minRamGb: 8,
      recommendedRamGb: 16,
      runtimeMinBuild: 12732,
      installed: false,
      status: 'not_installed',
    },
    download: { modelId: 'qwen', status: 'idle', receivedBytes: 0, totalBytes: 1107409472 },
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
    ...overrides,
  };
}

describe('IntelligenceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.getStore.mockResolvedValue(undefined);
    mockClient.getIntelligenceStatus.mockResolvedValue(status());
    mockClient.setStore.mockResolvedValue(undefined);
    mockClient.startModelDownload.mockResolvedValue(undefined);
    mockClient.cancelModelDownload.mockResolvedValue(undefined);
    mockClient.removeModel.mockResolvedValue(undefined);
    mockClient.setProviderKey.mockResolvedValue(undefined);
    mockClient.deleteProviderKey.mockResolvedValue(undefined);
    mockClient.testInferenceProvider.mockResolvedValue({ ok: true });
    mockClient.approveDestination.mockResolvedValue(undefined);
  });

  it('starts disabled and persists a selected mode', async () => {
    render(<IntelligenceSettings />);
    expect(await screen.findByRole('radio', { name: /Disabled/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Built-in local AI/ }));
    await waitFor(() => expect(mockClient.setStore).toHaveBeenCalledWith('intelligenceMode', 'managed'));
    expect(screen.getByText('Download model')).toBeInTheDocument();
  });

  it('shows the diagnostics consent warning without toggling diagnostics silently', async () => {
    mockClient.getStore.mockImplementation(async (key: string) => {
      if (key === 'intelligenceMode') return 'managed';
      if (key === 'diagnosticsEnabled') return false;
      return undefined;
    });
    render(<IntelligenceSettings />);
    expect(
      await screen.findByText('Intelligence needs diagnostic evidence. Diagnostic collection remains opt-in.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enable diagnostic evidence' }));
    await waitFor(() => expect(mockClient.setStore).toHaveBeenCalledWith('diagnosticsEnabled', true));
  });

  it('downloads, cancels and removes the managed model', async () => {
    mockClient.getStore.mockImplementation(async (key: string) => (key === 'intelligenceMode' ? 'managed' : undefined));
    mockClient.getIntelligenceStatus
      .mockResolvedValueOnce(status())
      .mockResolvedValueOnce(
        status({
          download: { modelId: 'qwen', status: 'downloading', receivedBytes: 100, totalBytes: 1000 },
        })
      )
      .mockResolvedValueOnce(status({ model: { ...status().model, installed: true, status: 'installed' } }));
    render(<IntelligenceSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download model' }));
    await waitFor(() => expect(mockClient.startModelDownload).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Cancel download' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel download' }));
    expect(mockClient.cancelModelDownload).toHaveBeenCalled();
  });

  it('validates a custom endpoint, stores a key and requests consent', async () => {
    mockClient.getStore.mockImplementation(async (key: string) => {
      if (key === 'intelligenceMode') return 'custom';
      if (key === 'intelligenceProvider') {
        return { endpoint: 'https://inference.example.test/v1', model: 'remote-model' };
      }
      return undefined;
    });
    mockClient.getIntelligenceStatus.mockResolvedValue(
      status({
        mode: 'custom',
        destination: 'https://inference.example.test/v1',
        consentRequired: true,
        destinationApproved: false,
      })
    );
    render(<IntelligenceSettings />);
    expect(await screen.findByText('Evidence will be sent to:')).toBeInTheDocument();
    expect(screen.getByText('https://inference.example.test/v1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve destination' }));
    await waitFor(() => expect(mockClient.approveDestination).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('API key (optional)'), { target: { value: 'secret-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() => expect(mockClient.setProviderKey).toHaveBeenCalledWith('secret-key', expect.any(String)));

    mockClient.testInferenceProvider.mockResolvedValue({ ok: false, error: 'consent_required' });
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText(/Approve this destination before testing/)).toBeInTheDocument();
  });

  it('edits advanced provider budgets and persists them', async () => {
    mockClient.getStore.mockImplementation(async (key: string) => {
      if (key === 'intelligenceMode') return 'custom';
      if (key === 'intelligenceProvider') return { endpoint: 'http://127.0.0.1:8080/v1', model: 'model' };
      return undefined;
    });
    render(<IntelligenceSettings />);
    const context = await screen.findByLabelText('Context window (tokens)');
    fireEvent.change(context, { target: { value: '4096' } });
    fireEvent.blur(context);
    await waitFor(() =>
      expect(mockClient.setStore).toHaveBeenCalledWith(
        'intelligenceProvider',
        expect.objectContaining({ contextWindow: 4096 })
      )
    );
    fireEvent.change(screen.getByLabelText('Max output tokens'), { target: { value: '2048' } });
    fireEvent.blur(screen.getByLabelText('Max output tokens'));
    await waitFor(() =>
      expect(mockClient.setStore).toHaveBeenCalledWith(
        'intelligenceProvider',
        expect.objectContaining({ maxOutputTokens: 2048 })
      )
    );
  });

  it('surfaces native failures without unhandled errors', async () => {
    mockClient.getStore.mockImplementation(async (key: string) => (key === 'intelligenceMode' ? 'managed' : undefined));
    mockClient.startModelDownload.mockRejectedValueOnce(new Error('disk'));
    render(<IntelligenceSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download model' }));
    expect(await screen.findByText('The model download could not be started.')).toBeInTheDocument();
  });

  it('shows a successful connection result', async () => {
    mockClient.getStore.mockImplementation(async (key: string) => {
      if (key === 'intelligenceMode') return 'custom';
      if (key === 'intelligenceProvider') return { endpoint: 'http://127.0.0.1:8080/v1', model: 'model' };
      return undefined;
    });
    render(<IntelligenceSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('Connection successful.')).toBeInTheDocument();
  });

  it('reports a failed cancellation and a failed model removal', async () => {
    mockClient.getStore.mockImplementation(async (key: string) => (key === 'intelligenceMode' ? 'managed' : undefined));
    mockClient.getIntelligenceStatus.mockResolvedValue(
      status({ download: { modelId: 'qwen', status: 'downloading', receivedBytes: 10, totalBytes: 100 } })
    );
    mockClient.cancelModelDownload.mockRejectedValueOnce(new Error('native'));
    render(<IntelligenceSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel download' }));
    expect(await screen.findByText('The model download could not be cancelled.')).toBeInTheDocument();
  });

  it('shows installed and constrained hardware states', async () => {
    mockClient.getStore.mockImplementation(async (key: string) => (key === 'intelligenceMode' ? 'managed' : undefined));
    mockClient.getIntelligenceStatus.mockResolvedValue(
      status({
        model: { ...status().model, installed: true, status: 'installed', minRamGb: 32 },
        download: { modelId: 'qwen', status: 'installed', receivedBytes: 1107409472, totalBytes: 1107409472 },
        hardware: {
          ...status().hardware,
          totalMemoryBytes: 4294967296,
          managedRuntimeSupported: false,
          reason: 'unsupported_platform',
        },
      })
    );
    render(<IntelligenceSettings />);
    expect(await screen.findByText('Model installed and verified.')).toBeInTheDocument();
    expect(screen.getByText(/Managed inference is unavailable on this computer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove model' }));
    await waitFor(() => expect(mockClient.removeModel).toHaveBeenCalled());
  });

  it('handles key, consent and connectivity failures', async () => {
    mockClient.getStore.mockImplementation(async (key: string) => {
      if (key === 'intelligenceMode') return 'custom';
      if (key === 'intelligenceProvider') {
        return { endpoint: 'https://inference.example.test/v1', model: 'remote-model' };
      }
      return undefined;
    });
    mockClient.getIntelligenceStatus.mockResolvedValue(
      status({
        mode: 'custom',
        destination: 'https://inference.example.test/v1',
        consentRequired: true,
        destinationApproved: false,
        providerKeyPresent: true,
      })
    );
    mockClient.setProviderKey.mockRejectedValueOnce(new Error('keychain'));
    mockClient.deleteProviderKey.mockRejectedValueOnce(new Error('keychain'));
    mockClient.testInferenceProvider.mockRejectedValueOnce(new Error('network'));
    mockClient.approveDestination.mockRejectedValueOnce(new Error('keychain'));
    render(<IntelligenceSettings />);
    fireEvent.change(await screen.findByLabelText('API key (optional)'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByText('The API key could not be stored in the OS credential store.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Forget key' }));
    expect(await screen.findByText('The API key could not be removed.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText('The provider is unavailable.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve destination' }));
    expect(await screen.findByText('The destination could not be approved.')).toBeInTheDocument();
  });

  it('rejects invalid endpoints before testing', async () => {
    mockClient.getStore.mockImplementation(async (key: string) => {
      if (key === 'intelligenceMode') return 'custom';
      if (key === 'intelligenceProvider') return { endpoint: 'http://remote.example.test/v1', model: 'model' };
      return undefined;
    });
    render(<IntelligenceSettings />);
    expect(await screen.findByText('The endpoint is invalid. Use HTTPS for non-loopback hosts.')).toBeInTheDocument();
  });
});
