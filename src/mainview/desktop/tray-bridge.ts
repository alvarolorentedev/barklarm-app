import { emitTo, listen } from '@tauri-apps/api/event';
import type { AppRPCClient } from '../runtime/types';
import {
  TRAY_HELLO,
  TRAY_READY,
  TRAY_RPC_REQUEST,
  TRAY_RPC_RESPONSE,
  TRAY_WINDOW,
  type TrayRpcRequest,
  type TrayRpcResponse,
} from './tray-ipc';

const PROXIED_METHODS = new Set<keyof AppRPCClient>([
  'getStore',
  'setStore',
  'refreshObservers',
  'getObserverStates',
  'getDiagnosticEvidence',
  'recollectDiagnosticEvidence',
  'getAnalysis',
  'reanalyze',
  'getIntelligenceStatus',
  'startModelDownload',
  'cancelModelDownload',
  'removeModel',
  'ensureManagedRuntime',
  'stopManagedRuntime',
  'getProviderKey',
  'setProviderKey',
  'deleteProviderKey',
  'isDestinationApproved',
  'approveDestination',
  'revokeDestination',
  'testInferenceProvider',
  'writeClipboard',
  'openIssue',
  'openMainWindow',
  'listBrowsers',
  'openExternal',
  'importConfig',
  'exportConfig',
  'quit',
]);

async function respond(response: TrayRpcResponse): Promise<void> {
  await emitTo(TRAY_WINDOW, TRAY_RPC_RESPONSE, response).catch(() => undefined);
}

export async function setupTrayBridge(api: AppRPCClient): Promise<() => void> {
  const unlistenRequests = await listen<TrayRpcRequest>(TRAY_RPC_REQUEST, async (event) => {
    const { id, method, args } = event.payload;
    if (!PROXIED_METHODS.has(method)) {
      await respond({ id, ok: false, error: `Unsupported tray RPC method: ${String(method)}` });
      return;
    }

    try {
      const methodValue = api[method];
      const result = await Reflect.apply(methodValue, api, args);
      await respond({ id, ok: true, result });
    } catch (error) {
      await respond({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  const unlistenHello = await listen(TRAY_HELLO, () => {
    void emitTo(TRAY_WINDOW, TRAY_READY, {}).catch(() => undefined);
  });
  void emitTo(TRAY_WINDOW, TRAY_READY, {}).catch(() => undefined);

  return () => {
    unlistenRequests();
    unlistenHello();
  };
}
