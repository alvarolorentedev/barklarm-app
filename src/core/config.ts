import { CustomProviderConfig, IntelligenceMode } from '../types/Intelligence';
import { ObserverConfiguration } from '../types/ObserverConfiguration';

export type BarklarmConfig = {
  observables?: ObserverConfiguration[];
  refreshInterval?: number;
  issueGlobalEndpoint?: string;
  browser?: string;
  sslDisabled?: boolean;
  diagnosticsEnabled?: boolean;
  intelligenceMode?: IntelligenceMode;
  intelligenceProvider?: CustomProviderConfig;
  autostart?: boolean;
  autoupdate?: boolean;
};

export const INTELLIGENCE_PROVIDER_DEFAULTS: Required<CustomProviderConfig> = {
  endpoint: '',
  model: '',
  contextWindow: 8192,
  maxOutputTokens: 1536,
  timeoutMs: 120000,
};

export const DEFAULT_CONFIG: BarklarmConfig = {
  observables: [],
  refreshInterval: 60000,
  issueGlobalEndpoint: '',
  // Empty means the system default browser.
  browser: '',
  sslDisabled: false,
  // Opt-in: existing installations must not retrieve extra data until asked.
  diagnosticsEnabled: false,
  // Inference is opt-in and never enabled by import or migration.
  intelligenceMode: 'disabled',
  intelligenceProvider: { ...INTELLIGENCE_PROVIDER_DEFAULTS },
  autostart: true,
  autoupdate: true,
};

export function normalizeIntelligenceMode(value: unknown): IntelligenceMode {
  return value === 'managed' || value === 'custom' ? value : 'disabled';
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function boundedString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizeIntelligenceProvider(value: unknown): CustomProviderConfig {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as CustomProviderConfig) : {};
  return {
    endpoint: boundedString(source.endpoint, 2048),
    model: boundedString(source.model, 200),
    contextWindow: boundedInteger(source.contextWindow, INTELLIGENCE_PROVIDER_DEFAULTS.contextWindow, 2048, 32768),
    maxOutputTokens: boundedInteger(source.maxOutputTokens, INTELLIGENCE_PROVIDER_DEFAULTS.maxOutputTokens, 256, 4096),
    timeoutMs: boundedInteger(source.timeoutMs, INTELLIGENCE_PROVIDER_DEFAULTS.timeoutMs, 10000, 300000),
  };
}

export function normalizeBrowser(value: unknown): string {
  return boundedString(value, 1024);
}

export function normalizeRefreshInterval(value: unknown): number {
  return Math.max(60000, Number(value) || 60000);
}

let fallbackIdCounter = 0;

export function createObserverId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const uuid = cryptoApi?.randomUUID?.();
  if (uuid) return uuid;
  fallbackIdCounter += 1;
  return `observer-${Date.now().toString(36)}-${fallbackIdCounter}`;
}

/**
 * Assigns persistent IDs to legacy or imported observers and removes duplicates.
 * Position, alias and display name never determine identity.
 */
export function normalizeObservables(value: unknown): ObserverConfiguration[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const config = { ...(item as ObserverConfiguration) };
      const existing = typeof config.id === 'string' ? config.id.trim() : '';
      const id = existing && !seen.has(existing) ? existing : createObserverId();
      seen.add(id);
      return { ...config, id };
    });
}

export function normalizeConfig(value: unknown): BarklarmConfig {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as BarklarmConfig) : {};
  return {
    ...DEFAULT_CONFIG,
    ...source,
    browser: normalizeBrowser(source.browser),
    observables: normalizeObservables(source.observables),
    intelligenceMode: normalizeIntelligenceMode(source.intelligenceMode),
    intelligenceProvider: normalizeIntelligenceProvider(source.intelligenceProvider),
  };
}
