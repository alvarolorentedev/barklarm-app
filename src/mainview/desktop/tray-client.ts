import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import type { AppRPCClient } from '../runtime/types';
import {
  MAIN_WINDOW,
  TRAY_HELLO,
  TRAY_READY,
  TRAY_RPC_REQUEST,
  TRAY_RPC_RESPONSE,
  type TrayRpcRequest,
  type TrayRpcResponse,
} from './tray-ipc';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export async function createTrayClient(): Promise<AppRPCClient> {
  const pending = new Map<number, PendingRequest>();
  let nextId = 1;
  let mainReady = false;
  let readyPromise: Promise<void> | null = null;
  let resolveReady: (() => void) | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;

  await listen<TrayRpcResponse>(TRAY_RPC_RESPONSE, (event) => {
    const response = event.payload;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    clearTimeout(request.timer);
    if (response.ok) request.resolve(response.result);
    else request.reject(new Error(response.error || 'Tray request failed'));
  });

  await listen(TRAY_READY, () => {
    mainReady = true;
    if (readyTimer) clearTimeout(readyTimer);
    if (helloTimer) clearInterval(helloTimer);
    resolveReady?.();
    resolveReady = undefined;
  });

  const hello = () => {
    void emitTo(MAIN_WINDOW, TRAY_HELLO, {}).catch(() => undefined);
  };
  const helloTimer = setInterval(hello, 1000);
  hello();

  const ensureReady = (): Promise<void> => {
    if (mainReady) return Promise.resolve();
    if (readyPromise) return readyPromise;
    readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      readyTimer = setTimeout(() => {
        readyPromise = null;
        reject(new Error('Barklarm main window is not responding'));
      }, 5000);
    });
    return readyPromise;
  };

  const request = async <T>(method: keyof AppRPCClient, args: unknown[]): Promise<T> => {
    await ensureReady();
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Tray request timed out: ${String(method)}`));
      }, 10_000);
      pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      const payload: TrayRpcRequest = { id, method, args };
      void emitTo(MAIN_WINDOW, TRAY_RPC_REQUEST, payload).catch((error) => {
        const current = pending.get(id);
        if (!current) return;
        pending.delete(id);
        clearTimeout(current.timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  };

  const rpc = <T>(method: keyof AppRPCClient, ...args: unknown[]): Promise<T> => request<T>(method, args);

  return {
    getStore: (key) => rpc('getStore', key),
    setStore: (key, value) => rpc('setStore', key, value),
    refreshObservers: () => rpc('refreshObservers'),
    getObserverStates: () => rpc('getObserverStates'),
    getDiagnosticEvidence: (observerId) => rpc('getDiagnosticEvidence', observerId),
    recollectDiagnosticEvidence: (observerId) => rpc('recollectDiagnosticEvidence', observerId),
    getAnalysis: (observerId) => rpc('getAnalysis', observerId),
    reanalyze: (observerId) => rpc('reanalyze', observerId),
    getIntelligenceStatus: () => rpc('getIntelligenceStatus'),
    startModelDownload: () => rpc('startModelDownload'),
    cancelModelDownload: () => rpc('cancelModelDownload'),
    removeModel: () => rpc('removeModel'),
    ensureManagedRuntime: () => rpc('ensureManagedRuntime'),
    stopManagedRuntime: () => rpc('stopManagedRuntime'),
    getProviderKey: (fingerprint) => rpc('getProviderKey', fingerprint),
    setProviderKey: (key, fingerprint) => rpc('setProviderKey', key, fingerprint),
    deleteProviderKey: (fingerprint) => rpc('deleteProviderKey', fingerprint),
    isDestinationApproved: (fingerprint) => rpc('isDestinationApproved', fingerprint),
    approveDestination: (fingerprint) => rpc('approveDestination', fingerprint),
    revokeDestination: (fingerprint) => rpc('revokeDestination', fingerprint),
    testInferenceProvider: (input) => rpc('testInferenceProvider', input),
    writeClipboard: (text) => rpc('writeClipboard', text),
    openIssue: (observerId) => rpc('openIssue', observerId),
    openMainWindow: (route) => rpc('openMainWindow', route),
    hideWindow: () => invoke('hide_window'),
    setTrayPanelHeight: (height) => invoke('resize_tray_panel', { height }),
    listBrowsers: () => rpc('listBrowsers'),
    openExternal: (url) => rpc('openExternal', url),
    importConfig: () => rpc('importConfig'),
    exportConfig: () => rpc('exportConfig'),
    quit: () => rpc('quit'),
    logError: (message) => {
      void invoke('log_frontend', { message }).catch(() => undefined);
    },
  };
}
