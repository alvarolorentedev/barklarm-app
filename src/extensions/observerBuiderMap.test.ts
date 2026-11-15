import { describe, expect, it } from 'vitest';
import { ObserversBuildersMap } from './observerBuiderMap';

describe('ObserversBuildersMap', () => {
  it('builds a configured observer lazily', async () => {
    const observer = await ObserversBuildersMap.ccTray({
      url: 'http://127.0.0.1:9/cc.xml',
      alias: 'smoke-test',
    });

    expect(observer.constructor.name).toBe('CCTray');
  });

  it('returns undefined for an unknown observer type', () => {
    expect(ObserversBuildersMap.unknown).toBeUndefined();
  });
});
