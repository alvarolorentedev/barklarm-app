import { ObserverConfiguration } from '../types/ObserverConfiguration';

export type BarklarmConfig = {
  observables?: ObserverConfiguration[];
  refreshInterval?: number;
  issueGlobalEndpoint?: string;
  sslDisabled?: boolean;
  autostart?: boolean;
  autoupdate?: boolean;
};

export const DEFAULT_CONFIG: BarklarmConfig = {
  observables: [],
  refreshInterval: 60000,
  issueGlobalEndpoint: '',
  sslDisabled: false,
  autostart: true,
  autoupdate: true,
};

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
  return { ...DEFAULT_CONFIG, ...source, observables: normalizeObservables(source.observables) };
}
