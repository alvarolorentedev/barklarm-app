/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRPCClient } from '../runtime/types';
import { setupTrayBridge } from './tray-bridge';
import { TRAY_HELLO, TRAY_READY, TRAY_RPC_REQUEST, TRAY_RPC_RESPONSE, TRAY_WINDOW } from './tray-ipc';

const { listen, emitTo } = vi.hoisted(() => ({
  listen: vi.fn(),
  emitTo: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({ listen, emitTo }));

const handlers = new Map<string, (event: { payload: unknown }) => Promise<void> | void>();

describe('tray bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    listen.mockImplementation((event: string, handler: (event: { payload: unknown }) => Promise<void> | void) => {
      handlers.set(event, handler);
      return Promise.resolve(vi.fn());
    });
    emitTo.mockResolvedValue(undefined);
  });

  it('forwards tray requests to the main client, including browser-aware external links', async () => {
    const api = {
      openExternal: vi.fn().mockResolvedValue(true),
      hideWindow: vi.fn(),
    } as unknown as AppRPCClient;
    const cleanup = await setupTrayBridge(api);

    await handlers.get(TRAY_RPC_REQUEST)?.({
      payload: { id: 7, method: 'openExternal', args: ['https://example.test/run/1'] },
    });

    expect(api.openExternal).toHaveBeenCalledWith('https://example.test/run/1');
    expect(emitTo).toHaveBeenCalledWith(TRAY_WINDOW, TRAY_RPC_RESPONSE, { id: 7, ok: true, result: true });
    cleanup();
  });

  it('rejects window-local methods instead of forwarding them to the main window', async () => {
    const api = { hideWindow: vi.fn() } as unknown as AppRPCClient;
    await setupTrayBridge(api);

    await handlers.get(TRAY_RPC_REQUEST)?.({ payload: { id: 8, method: 'hideWindow', args: [] } });

    expect(api.hideWindow).not.toHaveBeenCalled();
    expect(emitTo).toHaveBeenCalledWith(TRAY_WINDOW, TRAY_RPC_RESPONSE, {
      id: 8,
      ok: false,
      error: 'Unsupported tray RPC method: hideWindow',
    });
  });

  it('answers tray hello messages so a reloaded tray can reconnect', async () => {
    await setupTrayBridge({} as AppRPCClient);
    emitTo.mockClear();

    await handlers.get(TRAY_HELLO)?.({ payload: {} });

    expect(emitTo).toHaveBeenCalledWith(TRAY_WINDOW, TRAY_READY, {});
  });
});
