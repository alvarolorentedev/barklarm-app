import { BrowserView } from 'electrobun/main';
import { store } from './store';
import { translate } from './i18n';

const schema = {
  bun: {
    requests: {
      getStore: { params: { key: '' }, response: undefined as any },
      setStore: { params: { key: '', value: undefined as any }, response: true as boolean },
      refreshObservers: { params: undefined as null, response: true as boolean },
      getTranslate: { params: { key: '' }, response: '' },
      importConfig: { params: { filePath: '' }, response: true as boolean },
      exportConfig: { params: { filePath: '' }, response: true as boolean },
      quit: { params: undefined as null, response: true as boolean },
    },
  },
  webview: {
    requests: {},
  },
};

export type AppRPCSchema = typeof schema;

let observerRefreshFn: (() => void) | null = null;

export function setObserverRefreshFn(fn: () => void): void {
  observerRefreshFn = fn;
}

let quitFn: (() => void) | null = null;

export function setQuitFn(fn: () => void): void {
  quitFn = fn;
}

export const rpc = BrowserView.defineRPC<AppRPCSchema>({
  maxRequestTime: 10000,
  handlers: {
    requests: {
      getStore: ({ key }: { key: string }) => store.get(key),
      setStore: ({ key, value }: { key: string; value: any }) => {
        store.set(key, value);
        return true;
      },
      refreshObservers: () => {
        observerRefreshFn?.();
        return true;
      },
      getTranslate: ({ key }: { key: string }) => translate(key),
      importConfig: ({ filePath }: { filePath: string }) => store.importConfig(filePath),
      exportConfig: ({ filePath }: { filePath: string }) => store.exportConfig(filePath),
      quit: () => {
        quitFn?.();
        return true;
      },
    },
    messages: {},
  },
});
