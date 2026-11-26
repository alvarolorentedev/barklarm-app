import { describe, expect, it, vi } from 'vitest';
import { createCustomInferenceProvider, createManagedInferenceProvider } from './factory';

function response(body: unknown): any {
  const serialized = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-length' ? String(serialized.length) : null) },
    body: null,
    text: async () => serialized,
  };
}

describe('intelligence provider factory', () => {
  it('passes the native transport into managed inference', async () => {
    const fetchMock = vi.fn(async () => response({ choices: [{ message: { content: '{"ok":true}' } }] }));
    const provider = createManagedInferenceProvider(
      {
        ensure: async () => ({ endpoint: 'http://127.0.0.1:9999/v1', token: 'managed-token', model: 'm' }),
      },
      { timeoutMs: 5000 },
      fetchMock as any
    );
    const result = await provider.infer(
      { messages: [{ role: 'user', content: 'x' }], responseSchema: { type: 'object' }, maxOutputTokens: 256 },
      new AbortController().signal
    );
    expect(result.text).toBe('{"ok":true}');
    expect((fetchMock.mock.calls[0] as any[])[1].headers.Authorization).toBe('Bearer managed-token');
  });

  it('passes the native transport into custom inference', async () => {
    const fetchMock = vi.fn(async () => response({ choices: [{ message: { content: '{"ok":true}' } }] }));
    const provider = createCustomInferenceProvider(
      'https://provider.example/v1',
      'm',
      'custom-key',
      { timeoutMs: 5000 },
      fetchMock as any
    );
    await provider.infer(
      { messages: [{ role: 'user', content: 'x' }], responseSchema: { type: 'object' }, maxOutputTokens: 256 },
      new AbortController().signal
    );
    expect((fetchMock.mock.calls[0] as any[])[1].headers.Authorization).toBe('Bearer custom-key');
  });

  it('rejects a managed endpoint that is not loopback before sending the token', async () => {
    const fetchMock = vi.fn();
    const provider = createManagedInferenceProvider(
      {
        ensure: async () => ({ endpoint: 'https://remote.example/v1', token: 'managed-token', model: 'm' }),
      },
      {},
      fetchMock as any
    );
    await expect(provider.initialize()).rejects.toMatchObject({ code: 'configuration' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
