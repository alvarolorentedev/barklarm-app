import type { AppRPCClient } from './runtime/types';

let implementation: AppRPCClient | null = null;
let initializing: Promise<AppRPCClient> | null = null;

function isMockRuntime(): boolean {
  return import.meta.env.DEV && import.meta.env.MODE === 'mock';
}

async function getClient(): Promise<AppRPCClient> {
  if (implementation) return implementation;
  if (!initializing) {
    initializing = (async () => {
      if (isMockRuntime()) {
        const { createMockClient } = await import('./runtime/mock');
        return createMockClient();
      }
      const { createDesktopClient } = await import('./desktop/client');
      return createDesktopClient();
    })().then(
      (client) => {
        implementation = client;
        return client;
      },
      (error) => {
        initializing = null;
        throw error;
      }
    );
  }
  return initializing;
}

function call<T>(action: (client: AppRPCClient) => Promise<T>): Promise<T> {
  return getClient().then(action);
}

export const client: AppRPCClient = {
  getStore: (key) => call((runtime) => runtime.getStore(key)),
  setStore: (key, value) => call((runtime) => runtime.setStore(key, value)),
  refreshObservers: () => call((runtime) => runtime.refreshObservers()),
  getObserverStates: () => call((runtime) => runtime.getObserverStates()),
  getDiagnosticEvidence: (observerId) => call((runtime) => runtime.getDiagnosticEvidence(observerId)),
  recollectDiagnosticEvidence: (observerId) => call((runtime) => runtime.recollectDiagnosticEvidence(observerId)),
  getAnalysis: (observerId) => call((runtime) => runtime.getAnalysis(observerId)),
  reanalyze: (observerId) => call((runtime) => runtime.reanalyze(observerId)),
  getIntelligenceStatus: () => call((runtime) => runtime.getIntelligenceStatus()),
  startModelDownload: () => call((runtime) => runtime.startModelDownload()),
  cancelModelDownload: () => call((runtime) => runtime.cancelModelDownload()),
  removeModel: () => call((runtime) => runtime.removeModel()),
  ensureManagedRuntime: () => call((runtime) => runtime.ensureManagedRuntime()),
  stopManagedRuntime: () => call((runtime) => runtime.stopManagedRuntime()),
  getProviderKey: (fingerprint) => call((runtime) => runtime.getProviderKey(fingerprint)),
  setProviderKey: (key, fingerprint) => call((runtime) => runtime.setProviderKey(key, fingerprint)),
  deleteProviderKey: (fingerprint) => call((runtime) => runtime.deleteProviderKey(fingerprint)),
  isDestinationApproved: (fingerprint) => call((runtime) => runtime.isDestinationApproved(fingerprint)),
  approveDestination: (fingerprint) => call((runtime) => runtime.approveDestination(fingerprint)),
  revokeDestination: (fingerprint) => call((runtime) => runtime.revokeDestination(fingerprint)),
  testInferenceProvider: (input) => call((runtime) => runtime.testInferenceProvider(input)),
  writeClipboard: (text) => call((runtime) => runtime.writeClipboard(text)),
  openIssue: (observerId) => call((runtime) => runtime.openIssue(observerId)),
  getWindowMode: () => call((runtime) => runtime.getWindowMode()),
  onWindowModeChange: (handler) => call((runtime) => runtime.onWindowModeChange(handler)),
  openMainWindow: () => call((runtime) => runtime.openMainWindow()),
  hideWindow: () => call((runtime) => runtime.hideWindow()),
  setTrayPanelHeight: (height) => call((runtime) => runtime.setTrayPanelHeight(height)),
  openExternal: (url) => call((runtime) => runtime.openExternal(url)),
  importConfig: () => call((runtime) => runtime.importConfig()),
  exportConfig: () => call((runtime) => runtime.exportConfig()),
  quit: () => call((runtime) => runtime.quit()),
  logError: (message) => {
    void getClient()
      .then((runtime) => runtime.logError(message))
      .catch(() => undefined);
  },
};

void getClient().catch((error) => console.error('[Barklarm] runtime initialization failed:', error));
