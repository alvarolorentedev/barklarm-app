import Electrobun from 'electrobun';
import type AppRPCSchema from './schema';

export type AppRPCClient = {
  getStore(key: string): Promise<any>;
  setStore(key: string, value: any): Promise<void>;
  refreshObservers(): Promise<void>;
  getTranslate(key: string): Promise<string>;
  importConfig(filePath: string): Promise<boolean>;
  exportConfig(filePath: string): Promise<boolean>;
  quit(): Promise<boolean>;
};

const rpc = Electrobun.Electroview.defineRPC<AppRPCSchema>({
  maxRequestTime: 10000,
  handlers: {
    requests: {},
    messages: {},
  },
});

new Electrobun.Electroview({ rpc });

export const client: AppRPCClient = {
  getStore: (key: string) => rpc.request.getStore({ key }),
  setStore: (key: string, value: any) => rpc.request.setStore({ key, value }).then(() => undefined),
  refreshObservers: () => rpc.request.refreshObservers(null).then(() => undefined),
  getTranslate: (key: string) => rpc.request.getTranslate({ key }),
  importConfig: (filePath: string) => rpc.request.importConfig({ filePath }),
  exportConfig: (filePath: string) => rpc.request.exportConfig({ filePath }),
  quit: () => rpc.request.quit(null).then(() => true),
};
