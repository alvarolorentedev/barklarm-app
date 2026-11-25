import { describe, expect, it, vi } from 'vitest';
import { InferenceError, InferenceRequest } from '../../../types/Intelligence';
import { OpenAICompatibleProvider } from './openai-compatible';

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  const map: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) map[key.toLowerCase()] = value;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => map[name.toLowerCase()] ?? null },
    body: null as null,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

const request: InferenceRequest = {
  messages: [
    { role: 'system', content: 'system' },
    { role: 'user', content: '{"evidence":{"items":[]}}' },
  ],
  responseSchema: { type: 'object' },
  maxOutputTokens: 256,
  timeoutMs: 2000,
};

describe('OpenAI-compatible provider', () => {
  it('sends structured output and returns content and usage', async () => {
    const fetchMock = vi.fn(async () =>
      response(200, {
        model: 'test-model',
        choices: [{ message: { content: '{"summary":"ok"}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      })
    );
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      apiKey: 'secret',
      fetch: fetchMock as any,
    });
    await provider.initialize();
    const result = await provider.infer(request, new AbortController().signal);
    expect(result.text).toBe('{"summary":"ok"}');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 4 });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as any[])[1].body));
    expect(body.response_format.type).toBe('json_schema');
    expect((fetchMock.mock.calls[0] as any[])[1].headers.Authorization).toBe('Bearer secret');
    expect((fetchMock.mock.calls[0] as any[])[1].maxRedirections).toBe(0);
  });

  it('falls back from json_schema to json_object then prompt-only', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(400, { error: 'unsupported schema' }))
      .mockResolvedValueOnce(response(400, { error: 'unsupported object' }))
      .mockResolvedValueOnce(response(200, { choices: [{ message: { content: '{"summary":"ok"}' } }] }));
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: fetchMock as any,
    });
    const result = await provider.infer(request, new AbortController().signal);
    expect(result.text).toBe('{"summary":"ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(provider.capabilities().structuredOutput).toBe('prompt-only');
  });

  it('normalizes status errors without exposing response bodies', async () => {
    const cases: Array<[number, string]> = [
      [401, 'unauthorized'],
      [403, 'unauthorized'],
      [429, 'rate_limited'],
      [500, 'unavailable'],
      [302, 'redirect_rejected'],
      [404, 'invalid_response'],
    ];
    for (const [status, code] of cases) {
      const provider = new OpenAICompatibleProvider({
        name: 'test',
        endpoint: 'http://127.0.0.1:8080/v1',
        model: 'test-model',
        fetch: (async () => response(status, { error: 'sensitive body' })) as any,
      });
      await expect(provider.infer(request, new AbortController().signal)).rejects.toMatchObject({ code });
    }
  });

  it('rejects oversized responses', async () => {
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: (async () => response(200, 'x'.repeat(1024 * 1024 + 1))) as any,
    });
    await expect(provider.infer(request, new AbortController().signal)).rejects.toMatchObject({
      code: 'too_large',
    });
  });

  it('cancels when the external signal aborts', async () => {
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: ((_url: string, init: any) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        })) as any,
    });
    const controller = new AbortController();
    const pending = provider.infer(request, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('tests connectivity without sending diagnostic evidence', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/models')) return response(200, { data: [{ id: 'model-a' }] });
      return response(404, {});
    });
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: fetchMock as any,
    });
    const result = await provider.testConnection();
    expect(result).toEqual({ ok: true, models: ['model-a'] });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('evidence');
  });

  it('uses a non-evidence prompt when model discovery is unavailable', async () => {
    const fetchMock = vi.fn(async (url: string, init: any) => {
      if (url.endsWith('/models')) return response(404, {});
      expect(String(init.body)).not.toContain('evidence');
      return response(200, { choices: [{ message: { content: 'OK' } }] });
    });
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: fetchMock as any,
    });
    expect(await provider.testConnection()).toEqual({ ok: true });
  });

  it('handles arrays, missing content and invalid JSON responses', async () => {
    const arrayProvider = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: (async () =>
        response(200, {
          choices: [{ message: { content: [{ text: 'part one ' }, { text: 'part two' }] } }],
        })) as any,
    });
    expect((await arrayProvider.infer(request, new AbortController().signal)).text).toBe('part one part two');

    const emptyProvider = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: (async () => response(200, { choices: [{ message: { content: '' } }] })) as any,
    });
    await expect(emptyProvider.infer(request, new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid_response',
    });

    const invalidJson = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: (async () => response(200, 'not json')) as any,
    });
    await expect(invalidJson.infer(request, new AbortController().signal)).rejects.toBeInstanceOf(Error);
  });

  it('rejects cross-origin redirects and oversized declared bodies', async () => {
    const redirect = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: (async () => ({ ...response(200, '{}'), url: 'https://evil.example.test/v1' })) as any,
    });
    await expect(redirect.infer(request, new AbortController().signal)).rejects.toMatchObject({
      code: 'redirect_rejected',
    });

    const tooLarge = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: (async () => response(200, '{}', { 'content-length': String(2 * 1024 * 1024) })) as any,
    });
    await expect(tooLarge.infer(request, new AbortController().signal)).rejects.toMatchObject({ code: 'too_large' });
  });

  it('reports unauthorized and failed connectivity checks', async () => {
    const unauthorized = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: (async () => response(401, {})) as any,
    });
    expect(await unauthorized.testConnection()).toEqual({ ok: false, error: 'unauthorized' });

    const offline = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: (async (url: string) => {
        if (url.endsWith('/models')) return response(500, {});
        return response(503, {});
      }) as any,
    });
    expect(await offline.testConnection()).toEqual({ ok: false, error: 'unavailable' });
  });

  it('tokenizes text and rejects invalid tokenizer responses', async () => {
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: (async (url: string) => {
        if (url.endsWith('/tokenize')) return response(200, { tokens: [1, 2, 3] });
        return response(200, { data: 'not-an-array' });
      }) as any,
    });
    expect(await provider.tokenize('hello', new AbortController().signal)).toBe(3);
    expect(await provider.listModels()).toEqual([]);

    const bad = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: (async () => response(500, {})) as any,
    });
    await expect(bad.tokenize('hello', new AbortController().signal)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('requires an endpoint and model', async () => {
    await expect(
      new OpenAICompatibleProvider({
        name: 'test',
        endpoint: 'http://127.0.0.1:8080/v1',
        model: '',
      }).initialize()
    ).rejects.toMatchObject({ code: 'configuration' });
  });

  it('accepts an already-aborted request as cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: (async () => response(200, {})) as any,
    });
    await expect(provider.infer(request, controller.signal)).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('rejects invalid configuration and exposes tokenizer/model discovery capabilities', async () => {
    const provider = new OpenAICompatibleProvider({
      name: 'test',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'test-model',
      fetch: (async () => response(200, {})) as any,
    });
    expect(provider.capabilities()).toEqual({
      structuredOutput: 'json_schema',
      tokenizer: false,
      modelDiscovery: true,
    });
    await expect(
      new OpenAICompatibleProvider({
        name: 'bad',
        endpoint: 'http://remote.example.test/v1',
        model: 'm',
      }).initialize()
    ).rejects.toBeInstanceOf(InferenceError);
  });
});
