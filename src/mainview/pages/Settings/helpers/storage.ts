import { client } from '../../../rpc-client';
import type { BrowserOption } from '../../../../types/Browser';

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
  getBrowser: async (): Promise<string> => {
    return (await client.getStore('browser')) ?? '';
  },
  saveBrowser: async (browser: string): Promise<void> => {
    await client.setStore('browser', browser);
  },
  listBrowsers: async (): Promise<BrowserOption[]> => {
    return client.listBrowsers();
  },
  getAutostart: async (): Promise<boolean> => {
    return (await client.getStore('autostart')) ?? true;
  },
  saveAutostart: async (autostart: boolean): Promise<void> => {
    await client.setStore('autostart', autostart);
  },
  getDiagnosticsEnabled: async (): Promise<boolean> => {
    return (await client.getStore('diagnosticsEnabled')) ?? false;
  },
  saveDiagnosticsEnabled: async (diagnosticsEnabled: boolean): Promise<void> => {
    await client.setStore('diagnosticsEnabled', diagnosticsEnabled);
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
