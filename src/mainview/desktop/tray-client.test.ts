/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRPCClient } from '../runtime/types';
import { createTrayClient } from './tray-client';
import { MAIN_WINDOW, TRAY_READY, TRAY_RPC_REQUEST, TRAY_RPC_RESPONSE } from './tray-ipc';

const { listen, emitTo, invoke } = vi.hoisted(() => ({
  listen: vi.fn(),
  emitTo: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({ listen, emitTo }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

const handlers = new Map<string, (event: { payload: unknown }) => void>();

describe('tray client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    listen.mockImplementation((event: string, handler: (event: { payload: unknown }) => void) => {
      handlers.set(event, handler);
      return Promise.resolve(vi.fn());
    });
    emitTo.mockResolvedValue(undefined);
    invoke.mockResolvedValue(undefined);
  });

  it('proxies reads and browser-aware actions to the main window', async () => {
    const client = await createTrayClient();
    handlers.get(TRAY_READY)?.({ payload: {} });

    const states = client.getObserverStates();
    await vi.waitFor(() =>
      expect(emitTo).toHaveBeenCalledWith(MAIN_WINDOW, TRAY_RPC_REQUEST, {
        id: 1,
        method: 'getObserverStates',
        args: [],
      })
    );
    handlers.get(TRAY_RPC_RESPONSE)?.({ payload: { id: 1, ok: true, result: [{ id: 'o1' }] } });
    await expect(states).resolves.toEqual([{ id: 'o1' }]);

    const opened = client.openExternal('https://example.test/run/1');
    await vi.waitFor(() =>
      expect(emitTo).toHaveBeenCalledWith(MAIN_WINDOW, TRAY_RPC_REQUEST, {
        id: 2,
        method: 'openExternal',
        args: ['https://example.test/run/1'],
      })
    );
    handlers.get(TRAY_RPC_RESPONSE)?.({ payload: { id: 2, ok: true, result: true } });
    await expect(opened).resolves.toBe(true);
  });

  it('opens a specific main route through the bridge', async () => {
    const client = await createTrayClient();
    handlers.get(TRAY_READY)?.({ payload: {} });

    const opened = client.openMainWindow('/settings');
    await vi.waitFor(() =>
      expect(emitTo).toHaveBeenCalledWith(MAIN_WINDOW, TRAY_RPC_REQUEST, {
        id: 1,
        method: 'openMainWindow',
        args: ['/settings'],
      })
    );
    handlers.get(TRAY_RPC_RESPONSE)?.({ payload: { id: 1, ok: true, result: undefined } });
    await expect(opened).resolves.toBeUndefined();
  });

  it('forwards the shared client surface used by tray components', async () => {
    const client = await createTrayClient();
    handlers.get(TRAY_READY)?.({ payload: {} });
    const cases: Array<{ method: keyof AppRPCClient; args: unknown[]; result: unknown }> = [
      { method: 'getStore', args: ['observables'], result: [] },
      { method: 'setStore', args: ['diagnosticsEnabled', true], result: undefined },
      { method: 'refreshObservers', args: [], result: undefined },
      { method: 'getDiagnosticEvidence', args: ['o1'], result: { status: 'disabled' } },
      { method: 'recollectDiagnosticEvidence', args: ['o1'], result: undefined },
      { method: 'getAnalysis', args: ['o1'], result: { status: 'disabled' } },
      { method: 'reanalyze', args: ['o1'], result: undefined },
      { method: 'getIntelligenceStatus', args: [], result: { mode: 'disabled' } },
      { method: 'startModelDownload', args: [], result: undefined },
      { method: 'cancelModelDownload', args: [], result: undefined },
      { method: 'removeModel', args: [], result: undefined },
      { method: 'ensureManagedRuntime', args: [], result: { baseUrl: 'http://127.0.0.1:8080' } },
      { method: 'stopManagedRuntime', args: [], result: undefined },
      { method: 'getProviderKey', args: ['fingerprint'], result: undefined },
      { method: 'setProviderKey', args: ['secret', 'fingerprint'], result: undefined },
      { method: 'deleteProviderKey', args: ['fingerprint'], result: undefined },
      { method: 'isDestinationApproved', args: ['fingerprint'], result: false },
      { method: 'approveDestination', args: ['fingerprint'], result: undefined },
      { method: 'revokeDestination', args: ['fingerprint'], result: undefined },
      {
        method: 'testInferenceProvider',
        args: [{ endpoint: 'https://example.test/v1' }],
        result: { ok: true, models: [] },
      },
      { method: 'writeClipboard', args: ['prompt'], result: true },
      { method: 'openIssue', args: ['o1'], result: true },
      { method: 'listBrowsers', args: [], result: [] },
      { method: 'importConfig', args: [], result: false },
      { method: 'exportConfig', args: [], result: false },
      { method: 'quit', args: [], result: true },
    ];

    for (const [index, testCase] of cases.entries()) {
      const id = index + 1;
      const promise = (client[testCase.method] as (...args: unknown[]) => Promise<unknown>)(...testCase.args);
      await vi.waitFor(() =>
        expect(emitTo).toHaveBeenCalledWith(MAIN_WINDOW, TRAY_RPC_REQUEST, {
          id,
          method: testCase.method,
          args: testCase.args,
        })
      );
      handlers.get(TRAY_RPC_RESPONSE)?.({ payload: { id, ok: true, result: testCase.result } });
      await expect(promise).resolves.toEqual(testCase.result);
    }
  });

  it('keeps tray window controls local', async () => {
    const client = await createTrayClient();

    await client.hideWindow();
    await client.setTrayPanelHeight(300);

    expect(invoke).toHaveBeenCalledWith('hide_window');
    expect(invoke).toHaveBeenCalledWith('resize_tray_panel', { height: 300 });
    expect(emitTo).not.toHaveBeenCalledWith(MAIN_WINDOW, TRAY_RPC_REQUEST, expect.anything());
  });
});
