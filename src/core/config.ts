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
