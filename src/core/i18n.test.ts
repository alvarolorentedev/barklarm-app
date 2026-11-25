import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('core i18n', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('translates a known key for the loaded locale', async () => {
    const { initialize, translate } = await import('./i18n');
    initialize('es');

    expect(translate('Failed')).toBe('Fallo');
  });

  it('falls back to English for unknown locales and missing keys', async () => {
    const { initialize, translate } = await import('./i18n');
    initialize('xx');

    expect(translate('Failed')).toBe('Failed');
    expect(translate('a key that does not exist')).toBe('a key that does not exist');
  });
});
