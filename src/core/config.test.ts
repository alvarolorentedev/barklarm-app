import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, normalizeConfig, normalizeObservables, normalizeRefreshInterval } from './config';

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

  it('assigns unique IDs to legacy observers', () => {
    const observables = normalizeObservables([{ type: 'githubAction' }, { type: 'sentry' }]);

    expect(observables).toHaveLength(2);
    expect(observables[0].id).toBeTruthy();
    expect(observables[1].id).toBeTruthy();
    expect(observables[0].id).not.toBe(observables[1].id);
  });

  it('preserves existing IDs and replaces duplicates', () => {
    const observables = normalizeObservables([
      { id: 'keep-me', type: 'githubAction' },
      { id: 'keep-me', type: 'sentry' },
    ]);

    expect(observables[0].id).toBe('keep-me');
    expect(observables[1].id).toBeTruthy();
    expect(observables[1].id).not.toBe('keep-me');
  });

  it('keeps observer order and ignores malformed entries', () => {
    const observables = normalizeObservables([{ id: 'second', type: 'b' }, null, 'nope', { id: 'first', type: 'a' }]);

    expect(observables.map((observer) => observer.id)).toEqual(['second', 'first']);
  });

  it('normalizes a stored configuration without dropping unknown fields', () => {
    const config = normalizeConfig({
      observables: [{ type: 'ccTray', url: 'https://ci.example.test/cc.xml' }],
      refreshInterval: 30000,
      futureField: true,
    });

    expect(config.observables?.[0].id).toBeTruthy();
    expect(config.refreshInterval).toBe(30000);
    expect(config.sslDisabled).toBe(false);
    expect((config as any).futureField).toBe(true);
  });

  it('returns safe defaults for invalid configuration values', () => {
    expect(normalizeConfig(null).observables).toEqual([]);
    expect(normalizeConfig({ observables: 'nope' }).observables).toEqual([]);
  });
});
