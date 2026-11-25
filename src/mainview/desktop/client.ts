import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from '@tauri-apps/plugin-autostart';
import { open, save } from '@tauri-apps/plugin-dialog';

import {
  BarklarmConfig,
  DEFAULT_CONFIG,
  normalizeConfig,
  normalizeObservables,
  normalizeRefreshInterval,
} from '../../core/config';
import { EvidenceManager } from '../../core/diagnostics/evidence-manager';
import { initialize as initializeI18n } from '../../core/i18n';
import { isHttpUrl } from '../../core/issue';
import { NotificationManager } from '../../core/notification';
import { ObserverManager, ObserverPresenter } from '../../core/observer-manager';
import { setFetchImplementation } from '../../extensions/fetch-adapter';
import { State } from '../../types/State';
import type { AppRPCClient } from '../runtime/types';
import { openExternal as openExternalUrl, setupAppMenu, TrayPresenter } from './tray';

const noopPresenter: ObserverPresenter = {
  updateImage: () => undefined,
  updateMenu: () => undefined,
};

let config: BarklarmConfig = { ...DEFAULT_CONFIG };
let manager: ObserverManager | null = null;
let evidence: EvidenceManager | null = null;
let tray: TrayPresenter | null = null;
let readyPromise: Promise<void> | null = null;

async function loadConfig(): Promise<BarklarmConfig> {
  const stored = await invoke<unknown>('load_config');
  config = normalizeConfig(stored);
  const storedObservables = (stored as BarklarmConfig | null)?.observables;
  if (Array.isArray(storedObservables) && JSON.stringify(storedObservables) !== JSON.stringify(config.observables)) {
    // Persist legacy IDs so imports and exports keep stable observer identity.
    await saveConfig().catch((error) => console.error('Failed to persist migrated observer IDs:', error));
  }
  return config;
}

async function saveConfig(): Promise<void> {
  await invoke('save_config', { config });
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === 'granted';
}

async function notify(title: string, body: string): Promise<void> {
  try {
    if (!(await ensureNotificationPermission())) return;
    sendNotification({ title, body });
  } catch (error) {
    console.error('Notification failed:', error);
  }
}

async function applyAutostart(): Promise<void> {
  if (import.meta.env.DEV) return;
  try {
    const enabled = await isAutostartEnabled();
    if (config.autostart && !enabled) await enableAutostart();
    if (!config.autostart && enabled) await disableAutostart();
  } catch (error) {
    console.error('Autostart update failed:', error);
  }
}

async function applyConfig(): Promise<void> {
  if (!manager) return;
  evidence?.setEnabled(Boolean(config.diagnosticsEnabled));
  manager.setRefreshInterval(normalizeRefreshInterval(config.refreshInterval));
  tray?.setEndpoint(config.issueGlobalEndpoint || '');
  await manager.refreshObservers(config.observables || []);
  await applyAutostart();
}

async function initialize(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    initializeI18n((navigator.language || 'en').slice(0, 2).toLowerCase());
    await loadConfig();

    setFetchImplementation((url, options) =>
      tauriFetch(url, {
        ...(options || {}),
        ...(config.sslDisabled ? { danger: { acceptInvalidCerts: true, acceptInvalidHostnames: true } } : {}),
      } as any)
    );

    const notifications = new NotificationManager((title, body) => {
      void notify(title, body);
    });
    let menuFallback = true;
    try {
      menuFallback = !(await invoke<boolean>('menu_images_supported'));
    } catch (error) {
      console.error('Failed to query menu image support:', error);
    }
    tray = await TrayPresenter.create([], config.issueGlobalEndpoint || '', menuFallback).catch((error) => {
      console.error('Failed to create tray:', error);
      return null;
    });
    await setupAppMenu().catch((error) => console.error('Failed to set app menu:', error));
    evidence = new EvidenceManager({ enabled: Boolean(config.diagnosticsEnabled) });
    manager = new ObserverManager(tray || noopPresenter, notifications, undefined, evidence);
    manager.start(normalizeRefreshInterval(config.refreshInterval));
    await manager.refreshObservers(config.observables || []);
    await applyAutostart();

    if (import.meta.env.DEV) await invoke('show_window');
  })();
  return readyPromise;
}

async function ready(): Promise<void> {
  await initialize();
}

async function importConfig(): Promise<boolean> {
  await ready();
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (typeof selected !== 'string') return false;
  const imported = await invoke<boolean>('import_config', { path: selected });
  if (imported) {
    await loadConfig();
    await applyConfig();
    await notify('Import complete', selected);
  } else {
    await notify('Import failed', selected);
  }
  return imported;
}

async function exportConfig(): Promise<boolean> {
  await ready();
  const selected = await save({
    defaultPath: 'barklarm-config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!selected) return false;
  const exported = await invoke<boolean>('export_config', { path: selected });
  await notify(exported ? 'Export complete' : 'Export failed', selected);
  return exported;
}

export async function createDesktopClient(): Promise<AppRPCClient> {
  await initialize();

  return {
    async getStore(key: string): Promise<any> {
      await ready();
      return (config as any)[key];
    },

    async setStore(key: string, value: any): Promise<void> {
      await ready();
      config =
        key === 'observables'
          ? { ...config, observables: normalizeObservables(value) }
          : ({ ...config, [key]: value } as BarklarmConfig);
      await saveConfig();

      if (key === 'observables') await manager?.refreshObservers(config.observables || []);
      if (key === 'refreshInterval') manager?.setRefreshInterval(normalizeRefreshInterval(value));
      if (key === 'issueGlobalEndpoint') tray?.setEndpoint(String(value || ''));
      if (key === 'diagnosticsEnabled') evidence?.setEnabled(Boolean(value));
      if (key === 'autostart') await applyAutostart();
    },

    async refreshObservers(): Promise<void> {
      await ready();
      await manager?.refreshObservers(config.observables || []);
    },

    async getObserverStates(): Promise<State[]> {
      await ready();
      return manager?.getStates() || [];
    },

    async getDiagnosticEvidence(observerId: string) {
      await ready();
      return evidence?.getSnapshot(observerId) ?? { status: 'disabled' as const };
    },

    async recollectDiagnosticEvidence(observerId: string): Promise<void> {
      await ready();
      evidence?.recollect(observerId);
    },

    async openExternal(url: string): Promise<boolean> {
      await ready();
      if (!isHttpUrl(url)) return false;
      openExternalUrl(url);
      return true;
    },

    importConfig,
    exportConfig,

    async quit(): Promise<boolean> {
      manager?.destroy();
      await invoke('quit_app');
      return true;
    },

    logError(message: string): void {
      void invoke('log_frontend', { message }).catch(() => undefined);
    },
  };
}
