import { client } from '../../../rpc-client';

export const storage = () => ({
  getSslDisabled: async (): Promise<boolean> => {
    return (await client.getStore('sslDisabled')) ?? false;
  },
  saveSslDisabled: async (sslDisabled: boolean): Promise<void> => {
    await client.setStore('sslDisabled', sslDisabled);
  },
  getRefreshInterval: async (): Promise<number> => {
    return (await client.getStore('refreshInterval')) ?? 60000;
  },
  saveRefreshInterval: async (refreshInterval: number): Promise<void> => {
    await client.setStore('refreshInterval', refreshInterval);
  },
  getissueGlobalEndpoint: async (): Promise<string> => {
    return (await client.getStore('issueGlobalEndpoint')) ?? '';
  },
  saveissueGlobalEndpoint: async (issueGlobalEndpoint?: string): Promise<void> => {
    await client.setStore('issueGlobalEndpoint', issueGlobalEndpoint);
  },
  getAutostart: async (): Promise<boolean> => {
    return (await client.getStore('autostart')) ?? true;
  },
  saveAutostart: async (autostart: boolean): Promise<void> => {
    await client.setStore('autostart', autostart);
  },
  importConfig: async (): Promise<boolean> => {
    return client.importConfig();
  },
  exportConfig: async (): Promise<boolean> => {
    return client.exportConfig();
  },
  quit: async (): Promise<boolean> => {
    return client.quit();
  },
});
