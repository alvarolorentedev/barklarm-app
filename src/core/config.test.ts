import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, normalizeRefreshInterval } from './config';

describe('config', () => {
  it('never allows a refresh interval below one minute', () => {
    expect(normalizeRefreshInterval(0)).toBe(60000);
    expect(normalizeRefreshInterval('nope')).toBe(60000);
    expect(normalizeRefreshInterval(120000)).toBe(120000);
  });

  it('starts with no observers and a desktop-safe refresh interval', () => {
    expect(DEFAULT_CONFIG.observables).toEqual([]);
    expect(DEFAULT_CONFIG.refreshInterval).toBe(60000);
  });
});
