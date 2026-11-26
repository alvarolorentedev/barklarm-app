import { describe, expect, it, vi } from 'vitest';
import { ManagedInferenceProvider } from './managed';
import { InferenceError } from '../../../types/Intelligence';

function response(status: number, body: unknown) {
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-length' ? String(serialized.length) : null) },
    body: null as null,
    text: async () => serialized,
  };
}

const endpoint = { endpoint: 'http://127.0.0.1:9999/v1', token: 'token', model: 'managed-model' };

describe('managed inference provider', () => {
  it('initializes from the native endpoint and reuses it', async () => {
    const ensure = vi.fn().mockResolvedValue(endpoint);
    const fetchMock = vi.fn(async () => response(200, { data: [{ id: 'managed-model' }] }));
    const provider = new ManagedInferenceProvider({ ensure } as any, { fetch: fetchMock as any });
    await provider.initialize();
    expect(provider.model).toBe('managed-model');
    expect(provider.capabilities()).toEqual({
      structuredOutput: 'json_schema',
      tokenizer: true,
      modelDiscovery: true,
    });
    expect(await provider.testConnection()).toEqual({ ok: true, models: ['managed-model'] });
    expect(ensure).toHaveBeenCalled();
    await provider.dispose();
  });

  it('sends inference through the managed endpoint and token', async () => {
    const ensure = vi.fn().mockResolvedValue(endpoint);
    const fetchMock = vi.fn(async () =>
      response(200, { model: 'managed-model', choices: [{ message: { content: '{}' } }] })
    );
    const provider = new ManagedInferenceProvider({ ensure } as any, { fetch: fetchMock as any });
    const result = await provider.infer(
      {
        messages: [{ role: 'user', content: 'test' }],
        responseSchema: { type: 'object' },
        maxOutputTokens: 256,
      },
      new AbortController().signal
    );
    expect(result.text).toBe('{}');
    const init = (fetchMock.mock.calls[0] as any[])[1];
    expect(init.headers.Authorization).toBe('Bearer token');
    expect(JSON.parse(init.body).chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it('maps a native inference-lease failure to a runtime failure', async () => {
    const provider = new ManagedInferenceProvider(
      {
        ensure: async () => endpoint,
        beginInference: async () => {
          throw new Error('state_lock');
        },
      } as any,
      { fetch: (async () => response(200, {})) as any }
    );
    await expect(
      provider.infer(
        { messages: [{ role: 'user', content: 'x' }], responseSchema: { type: 'object' }, maxOutputTokens: 256 },
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: 'unavailable', analysisReason: 'runtime_failed' });
  });

  it('supports tokenizer calls and rejects unsupported tokenizers', async () => {
    const ensure = vi.fn().mockResolvedValue(endpoint);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/tokenize')) return response(200, { tokens: [1, 2, 3] });
      return response(200, { data: [{ id: 'managed-model' }] });
    });
    const provider = new ManagedInferenceProvider({ ensure } as any, { fetch: fetchMock as any });
    expect(await provider.tokenize('hello', new AbortController().signal)).toBe(3);
    expect(await provider.listModels()).toEqual(['managed-model']);
  });

  it('normalizes runtime access failures to unavailable', async () => {
    const provider = new ManagedInferenceProvider({
      ensure: async () => {
        throw new Error('native failure');
      },
    } as any);
    await expect(provider.initialize()).rejects.toBeInstanceOf(InferenceError);
    await expect(provider.initialize()).rejects.toMatchObject({
      code: 'unavailable',
      analysisReason: 'provider_unavailable',
    });
  });

  it('preserves native runtime failure reasons', async () => {
    for (const [native, reason] of [
      ['model_missing', 'model_missing'],
      ['runtime_missing', 'runtime_missing'],
      ['runtime_start_failed', 'runtime_failed'],
      ['unsupported_hardware', 'unsupported_hardware'],
    ] as Array<[string, string]>) {
      const provider = new ManagedInferenceProvider({
        ensure: async () => {
          throw native;
        },
      } as any);
      await expect(provider.initialize()).rejects.toMatchObject({ analysisReason: reason });
    }
  });

  it('exposes default capabilities before initialization and passes through native errors', async () => {
    const provider = new ManagedInferenceProvider({ ensure: async () => endpoint } as any, {
      fetch: (async () => response(200, {})) as any,
    });
    expect(provider.capabilities().tokenizer).toBe(true);
    expect(provider.model).toBe('');

    const denied = new ManagedInferenceProvider({
      ensure: async () => {
        throw new InferenceError('consent_required');
      },
    } as any);
    await expect(denied.initialize()).rejects.toMatchObject({ code: 'consent_required' });
    await denied.dispose();
  });

  it('reinitializes after disposal and reports capabilities from the client', async () => {
    const ensure = vi.fn().mockResolvedValue(endpoint);
    const provider = new ManagedInferenceProvider({ ensure } as any, {
      fetch: (async () => response(200, { data: [] })) as any,
    });
    await provider.initialize();
    expect(provider.capabilities().structuredOutput).toBe('json_schema');
    await provider.dispose();
    await provider.initialize();
    expect(ensure).toHaveBeenCalledTimes(2);
  });

  it('creates a new client when the native endpoint changes', async () => {
    const ensure = vi
      .fn()
      .mockResolvedValueOnce(endpoint)
      .mockResolvedValueOnce({ ...endpoint, endpoint: 'http://127.0.0.1:9998/v1', token: 'second' });
    const fetchMock = vi.fn(async () => response(200, { data: [{ id: 'managed-model' }] }));
    const provider = new ManagedInferenceProvider({ ensure } as any, { fetch: fetchMock as any });
    await provider.initialize();
    await provider.listModels();
    expect(ensure).toHaveBeenCalledTimes(2);
    const lastInit = (fetchMock.mock.calls[0] as any[])[1];
    expect(lastInit.headers.Authorization).toBe('Bearer second');
  });
});
