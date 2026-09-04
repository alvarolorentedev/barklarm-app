import { client } from '../../../rpc-client';

export const storage = () => ({
  saveAutoupdate: async (autoupdate: boolean): Promise<void> => {
    await client.setStore('autoupdate', autoupdate);
  },
  getAutoupdate: async (): Promise<boolean> => {
    return (await client.getStore('autoupdate')) ?? true;
  },
  saveSslDisabled: async (sslDisabled: boolean): Promise<void> => {
    await client.setStore('sslDisabled', sslDisabled);
  },
  getSslDisabled: async (): Promise<boolean> => {
    return (await client.getStore('sslDisabled')) ?? false;
  },
  saveRefreshInterval: async (refreshInterval: number): Promise<void> => {
    await client.setStore('refreshInterval', refreshInterval);
  },
  getRefreshInterval: async (): Promise<number> => {
    return (await client.getStore('refreshInterval')) ?? 60000;
  },
  saveissueGlobalEndpoint: async (issueGlobalEndpoint?: string): Promise<void> => {
    await client.setStore('issueGlobalEndpoint', issueGlobalEndpoint);
  },
  getissueGlobalEndpoint: async (): Promise<string> => {
    return (await client.getStore('issueGlobalEndpoint')) ?? '';
  },
  saveAutostart: async (autostart: boolean): Promise<void> => {
    await client.setStore('autostart', autostart);
  },
  getAutostart: async (): Promise<boolean> => {
    return (await client.getStore('autostart')) ?? true;
  },
  importConfig: async (): Promise<boolean> => {
    return client.importConfig('');
  },
  exportConfig: async (): Promise<boolean> => {
    return client.exportConfig('');
  },
  quit: async (): Promise<boolean> => {
    return client.quit();
  },
});
