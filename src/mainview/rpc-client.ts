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
