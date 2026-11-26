import { describe, expect, it, vi } from 'vitest';
import { createInferenceFetch, createObserverFetch } from './transport';

describe('intelligence transport', () => {
  it('never inherits the observer SSL compatibility setting for inference', async () => {
    const base = vi.fn(async () => ({ ok: true }));
    await createInferenceFetch(base)('http://127.0.0.1:8080/v1/models', { method: 'GET' });
    await createInferenceFetch(base)('http://127.0.0.1:8080/v1/models');
    const init = (base.mock.calls[0] as any[])[1];
    expect(init.danger).toBeUndefined();
    expect(init.redirect).toBe('manual');
    expect(init.maxRedirections).toBe(0);
  });

  it('keeps sslDisabled scoped to observer integrations', async () => {
    const base = vi.fn(async () => ({ ok: true }));
    await createObserverFetch(base, true)('https://example.test', {});
    await createObserverFetch(base, true)('https://example.test');
    expect((base.mock.calls[0] as any[])[1].danger).toEqual({
      acceptInvalidCerts: true,
      acceptInvalidHostnames: true,
    });
  });

  it('re-evaluates the observer SSL setting on every request', async () => {
    let disabled = true;
    const base = vi.fn(async () => ({ ok: true }));
    const fetch = createObserverFetch(base, () => disabled);
    await fetch('https://example.test');
    disabled = false;
    await fetch('https://example.test');
    expect((base.mock.calls[0] as any[])[1].danger).toBeDefined();
    expect((base.mock.calls[1] as any[])[1].danger).toBeUndefined();
  });

  it('supports a fixed boolean observer setting', async () => {
    const base = vi.fn(async () => ({ ok: true }));
    await createObserverFetch(base, false)('https://example.test');
    await createObserverFetch(base, true)('https://example.test');
    expect((base.mock.calls[0] as any[])[1].danger).toBeUndefined();
    expect((base.mock.calls[1] as any[])[1].danger).toBeDefined();
  });

  it('omits danger flags for observers when sslDisabled is off', async () => {
    const base = vi.fn(async () => ({ ok: true }));
    await createObserverFetch(base, false)('https://example.test', {});
    expect((base.mock.calls[0] as any[])[1].danger).toBeUndefined();
  });
});
