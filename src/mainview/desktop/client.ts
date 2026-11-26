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
  normalizeIntelligenceMode,
  normalizeIntelligenceProvider,
  normalizeObservables,
  normalizeRefreshInterval,
} from '../../core/config';
import { EvidenceManager } from '../../core/diagnostics/evidence-manager';
import { initialize as initializeI18n } from '../../core/i18n';
import { isHttpUrl } from '../../core/issue';
import { NotificationManager } from '../../core/notification';
import { ObserverManager, ObserverPresenter } from '../../core/observer-manager';
import { AnalysisManager } from '../../core/intelligence/analysis-manager';
import { effectiveBudget } from '../../core/intelligence/context-assembler';
import { destinationFingerprint, validateEndpoint } from '../../core/intelligence/endpoint-policy';
import {
  createCustomInferenceProvider,
  createManagedInferenceProvider,
} from '../../core/intelligence/providers/factory';
import { createInferenceFetch, createObserverFetch } from '../../core/intelligence/transport';
import { setFetchImplementation } from '../../extensions/fetch-adapter';
import {
  InferenceError,
  IntelligenceStatus,
  ManagedRuntimeEndpoint,
  ModelInfo,
  ProviderTestInput,
  ProviderTestResult,
} from '../../types/Intelligence';
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
let analysis: AnalysisManager | null = null;
let tray: TrayPresenter | null = null;
let readyPromise: Promise<void> | null = null;
let maintenanceTimer: ReturnType<typeof setInterval> | null = null;

function emptyModel(): ModelInfo {
  return {
    id: 'unavailable',
    displayName: 'No managed model',
    version: '',
    quantization: '',
    fileName: '',
    sizeBytes: 0,
    sha256: '',
    license: '',
    licenseUrl: '',
    contextLength: 0,
    recommendedContext: 8192,
    minRamGb: 0,
    recommendedRamGb: 0,
    runtimeMinBuild: 0,
    installed: false,
    status: 'not_installed',
  };
}

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

function analysisConfig(): {
  mode: ReturnType<typeof normalizeIntelligenceMode>;
  provider: ReturnType<typeof normalizeIntelligenceProvider>;
} {
  return {
    mode: normalizeIntelligenceMode(config.intelligenceMode),
    provider: normalizeIntelligenceProvider(config.intelligenceProvider),
  };
}

async function applyAnalysisConfig(): Promise<void> {
  if (!analysis) return;
  const next = analysisConfig();
  analysis.setDiagnosticsEnabled(Boolean(config.diagnosticsEnabled));
  analysis.setConfig(next.mode, next.provider);
  if (next.mode !== 'managed' || !config.diagnosticsEnabled) {
    await invoke('stop_managed_runtime').catch(() => undefined);
  }
  if (analysis.isEnabled() && config.diagnosticsEnabled) {
    for (const item of evidence?.getAvailableEvidence() || []) analysis.ingest(item);
  }
}

async function applyConfig(): Promise<void> {
  if (!manager) return;
  evidence?.setEnabled(Boolean(config.diagnosticsEnabled));
  await applyAnalysisConfig();
  manager.setRefreshInterval(normalizeRefreshInterval(config.refreshInterval));
  tray?.setEndpoint(config.issueGlobalEndpoint || '');
  await manager.refreshObservers(config.observables || []);
  await applyAutostart();
}

async function getProviderKey(fingerprint?: string): Promise<string | undefined> {
  try {
    const value = await invoke<string | null>('get_provider_key', { fingerprint: fingerprint || '' });
    return typeof value === 'string' && value ? value : undefined;
  } catch {
    // A locked/unavailable credential store must not silently send an
    // unauthenticated request to a remote destination.
    throw new InferenceError('configuration', 'credential_store_unavailable');
  }
}

async function isDestinationApproved(fingerprint: string): Promise<boolean> {
  try {
    return Boolean(await invoke<boolean>('is_destination_approved', { fingerprint }));
  } catch {
    return false;
  }
}

// Inference never inherits the observer SSL compatibility switch and never
// falls back to browser fetch, which the production CSP blocks.
const inferenceFetch = createInferenceFetch((url, options) => tauriFetch(url, options as any));

async function createAnalysisProvider(request: {
  mode: ReturnType<typeof normalizeIntelligenceMode>;
  provider?: ReturnType<typeof normalizeIntelligenceProvider>;
}) {
  const providerConfig = normalizeIntelligenceProvider(request.provider);
  const budget = effectiveBudget(providerConfig.contextWindow, providerConfig.maxOutputTokens);
  if (request.mode === 'managed') {
    return createManagedInferenceProvider(
      {
        ensure: async (_signal, contextWindow) =>
          invoke<ManagedRuntimeEndpoint>('ensure_managed_runtime', {
            contextWindow: effectiveBudget(
              contextWindow ?? providerConfig.contextWindow,
              providerConfig.maxOutputTokens
            ).contextWindow,
          }),
        beginInference: async () => {
          await invoke('begin_managed_inference');
        },
        endInference: async () => {
          await invoke('end_managed_inference').catch(() => undefined);
        },
      },
      {
        timeoutMs: providerConfig.timeoutMs,
        contextWindow: budget.contextWindow,
        maxOutputTokens: budget.maxOutputTokens,
      },
      inferenceFetch
    );
  }

  const validation = validateEndpoint(providerConfig.endpoint);
  if (validation.ok === false) throw new InferenceError('configuration', validation.reason);
  if (!providerConfig.model) throw new InferenceError('configuration', 'model_missing');
  const fingerprint = await destinationFingerprint(validation.baseUrl, providerConfig.model);
  if (validation.requiresConsent && !(await isDestinationApproved(fingerprint))) {
    throw new InferenceError('consent_required');
  }
  return createCustomInferenceProvider(
    validation.baseUrl,
    providerConfig.model,
    await getProviderKey(fingerprint),
    {
      contextWindow: budget.contextWindow,
      maxOutputTokens: budget.maxOutputTokens,
      timeoutMs: providerConfig.timeoutMs,
    },
    inferenceFetch
  );
}

async function intelligenceStatus(): Promise<IntelligenceStatus> {
  const mode = normalizeIntelligenceMode(config.intelligenceMode);
  const provider = normalizeIntelligenceProvider(config.intelligenceProvider);
  let native: any = null;
  try {
    native = await invoke<any>('intelligence_status');
  } catch (error) {
    console.error('Intelligence runtime status unavailable:', error);
  }

  let destination: string | undefined;
  let consentRequired = false;
  let destinationApproved = false;
  if (mode === 'custom') {
    const validation = validateEndpoint(provider.endpoint);
    if (validation.ok) {
      destination = validation.baseUrl;
      consentRequired = validation.requiresConsent;
      destinationApproved = consentRequired
        ? await isDestinationApproved(await destinationFingerprint(validation.baseUrl, provider.model || ''))
        : true;
    }
  }

  let providerKeyPresent = false;
  try {
    providerKeyPresent = Boolean(
      await invoke<boolean>('has_provider_key', {
        fingerprint: destination ? await destinationFingerprint(destination, provider.model || '') : '',
      })
    );
  } catch {
    providerKeyPresent = false;
  }

  // A resolved first-run blocker (installed model, restarted runtime) should
  // not require the user to restart or recollect unchanged evidence.
  analysis?.retryBlocked();

  return {
    mode,
    model: native?.model || emptyModel(),
    download: native?.download || {
      modelId: native?.model?.id || 'unavailable',
      status: 'idle',
      receivedBytes: 0,
      totalBytes: 0,
    },
    runtime: native?.runtime || { state: 'failed', error: 'status_unavailable' },
    hardware: native?.hardware || {
      os: '',
      arch: '',
      totalMemoryBytes: 0,
      availableMemoryBytes: 0,
      freeDiskBytes: 0,
      cpuCount: 0,
      platformRecognized: false,
      runtimeArtifactAvailable: false,
      hardwareRequirementsMet: false,
      modelInstalled: false,
      runtimeOperational: false,
      releaseQualified: false,
      managedRuntimeSupported: false,
      managedInferenceAvailable: false,
      reason: 'status_unavailable',
    },
    providerConfigured: mode === 'custom' && Boolean(provider.endpoint && provider.model),
    providerKeyPresent,
    destination,
    consentRequired,
    destinationApproved,
  };
}

async function testInferenceProvider(input: ProviderTestInput): Promise<ProviderTestResult> {
  const validation = validateEndpoint(input.endpoint);
  if (validation.ok === false) return { ok: false, error: 'configuration' };
  if (validation.requiresConsent) {
    const fingerprint = await destinationFingerprint(validation.baseUrl, input.model);
    if (!(await isDestinationApproved(fingerprint))) return { ok: false, error: 'consent_required' };
  }
  try {
    const fingerprint = await destinationFingerprint(validation.baseUrl, input.model);
    const provider = createCustomInferenceProvider(
      validation.baseUrl,
      input.model,
      await getProviderKey(fingerprint),
      { timeoutMs: input.timeoutMs },
      inferenceFetch
    );
    await provider.initialize();
    return await provider.testConnection();
  } catch (error) {
    return { ok: false, error: error instanceof InferenceError ? error.code : 'unavailable' };
  }
}

async function initialize(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    initializeI18n((navigator.language || 'en').slice(0, 2).toLowerCase());
    await loadConfig();

    setFetchImplementation(
      createObserverFetch(
        (url, options) => tauriFetch(url, options as any),
        () => Boolean(config.sslDisabled)
      )
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

    const next = analysisConfig();
    analysis = new AnalysisManager({
      mode: next.mode,
      provider: next.provider,
      diagnosticsEnabled: Boolean(config.diagnosticsEnabled),
      createProvider: createAnalysisProvider,
    });
    evidence = new EvidenceManager({
      enabled: Boolean(config.diagnosticsEnabled),
      onEvent: (event) => {
        if (event.type === 'available') analysis?.ingest(event.evidence);
        else if (event.type === 'cleared') analysis?.clear(event.observerId);
        else analysis?.clearAll();
      },
    });
    maintenanceTimer = setInterval(() => {
      evidence?.prune();
      analysis?.prune();
    }, 60_000);
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
    // Imported configuration is data, not explicit inference consent.
    config = { ...config, intelligenceMode: 'disabled' };
    await saveConfig();
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
      if (key === 'observables') config = { ...config, observables: normalizeObservables(value) };
      else if (key === 'intelligenceMode') config = { ...config, intelligenceMode: normalizeIntelligenceMode(value) };
      else if (key === 'intelligenceProvider')
        config = { ...config, intelligenceProvider: normalizeIntelligenceProvider(value) };
      else config = { ...config, [key]: value } as BarklarmConfig;
      await saveConfig();

      if (key === 'observables') await manager?.refreshObservers(config.observables || []);
      if (key === 'refreshInterval') manager?.setRefreshInterval(normalizeRefreshInterval(value));
      if (key === 'issueGlobalEndpoint') tray?.setEndpoint(String(value || ''));
      if (key === 'autostart') await applyAutostart();
      if (key === 'diagnosticsEnabled') {
        evidence?.setEnabled(Boolean(value));
        await applyAnalysisConfig();
      }
      if (key === 'intelligenceMode' || key === 'intelligenceProvider') await applyAnalysisConfig();
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

    async getAnalysis(observerId: string) {
      await ready();
      return analysis?.getSnapshot(observerId) ?? { status: 'disabled' as const };
    },

    async reanalyze(observerId: string): Promise<void> {
      await ready();
      analysis?.reanalyze(observerId);
    },

    getIntelligenceStatus: intelligenceStatus,

    async startModelDownload(): Promise<void> {
      await ready();
      await invoke('start_model_download');
    },

    async cancelModelDownload(): Promise<void> {
      await ready();
      await invoke('cancel_model_download');
    },

    async removeModel(): Promise<void> {
      await ready();
      await invoke('remove_model');
    },

    async ensureManagedRuntime(): Promise<ManagedRuntimeEndpoint> {
      await ready();
      return invoke<ManagedRuntimeEndpoint>('ensure_managed_runtime');
    },

    async stopManagedRuntime(): Promise<void> {
      await invoke('stop_managed_runtime').catch(() => undefined);
    },

    getProviderKey,

    async setProviderKey(key: string, fingerprint?: string): Promise<void> {
      await ready();
      await invoke('set_provider_key', { key, fingerprint: fingerprint || '' });
      analysis?.refreshProvider();
    },

    async deleteProviderKey(fingerprint?: string): Promise<void> {
      await ready();
      await invoke('delete_provider_key', { fingerprint: fingerprint || '' });
      analysis?.refreshProvider();
    },

    isDestinationApproved,

    async approveDestination(fingerprint: string): Promise<void> {
      await ready();
      await invoke('approve_destination', { fingerprint });
      analysis?.refreshProvider();
      analysis?.retryBlocked(true);
    },

    async revokeDestination(fingerprint: string): Promise<void> {
      await ready();
      await invoke('revoke_destination', { fingerprint });
      analysis?.refreshProvider();
    },

    testInferenceProvider,

    async openExternal(url: string): Promise<boolean> {
      await ready();
      if (!isHttpUrl(url)) return false;
      openExternalUrl(url);
      return true;
    },

    importConfig,
    exportConfig,

    async quit(): Promise<boolean> {
      if (maintenanceTimer) clearInterval(maintenanceTimer);
      maintenanceTimer = null;
      analysis?.shutdown();
      manager?.destroy();
      await invoke('stop_managed_runtime').catch(() => undefined);
      await invoke('quit_app');
      return true;
    },

    logError(message: string): void {
      void invoke('log_frontend', { message }).catch(() => undefined);
    },
  };
}
