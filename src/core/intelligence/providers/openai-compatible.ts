import {
  InferenceError,
  InferenceProvider,
  InferenceRequest,
  InferenceResult,
  ProviderCapabilities,
  ProviderTestResult,
  StructuredOutputMode,
} from '../../../types/Intelligence';
import { chatCompletionsUrl, modelsUrl, tokenizeUrl, validateEndpoint } from '../endpoint-policy';

export type FetchLike = (url: string, options?: any) => Promise<any>;

type ResponseLike = {
  ok?: boolean;
  status?: number;
  url?: string;
  headers?: { get(name: string): string | null };
  body?: { getReader?: () => any; cancel?: () => Promise<void> } | null;
  text?: () => Promise<string>;
};

export type OpenAICompatibleOptions = {
  name: string;
  endpoint: string;
  model: string;
  apiKey?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  fetch?: FetchLike;
  kind?: 'managed' | 'openai-compatible';
  chatTemplateKwargs?: Record<string, unknown>;
};

const MAX_RESPONSE_BYTES = 1024 * 1024;

function statusOf(response: ResponseLike): number {
  return typeof response.status === 'number' ? response.status : 0;
}

function isOk(response: ResponseLike, status: number): boolean {
  return typeof response.ok === 'boolean' ? response.ok : status >= 200 && status < 300;
}

async function readBounded(response: ResponseLike): Promise<string> {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new InferenceError('too_large');
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text?.();
    if (typeof text !== 'string') throw new InferenceError('invalid_response');
    if (text.length > MAX_RESPONSE_BYTES) throw new InferenceError('too_large');
    return text;
  }
  let total = 0;
  let output = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const value = chunk.value as Uint8Array | undefined;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        try {
          await reader.cancel?.();
        } catch {
          // Best effort.
        }
        throw new InferenceError('too_large');
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    if (total <= MAX_RESPONSE_BYTES) reader.releaseLock?.();
  }
}

async function readBoundedWithTimeout(response: ResponseLike, timeoutMs: number): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => {
        try {
          void response.body?.cancel?.();
        } catch {
          // Best effort.
        }
        reject(new InferenceError('timeout'));
      },
      Math.max(1000, timeoutMs)
    );
  });
  try {
    return await Promise.race([readBounded(response), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mapStatus(status: number): InferenceError {
  if (status === 401 || status === 403) return new InferenceError('unauthorized');
  if (status === 408 || status === 504) return new InferenceError('timeout');
  if (status === 429) return new InferenceError('rate_limited');
  if (status >= 300 && status < 400) return new InferenceError('redirect_rejected');
  if (status >= 500) return new InferenceError('unavailable');
  return new InferenceError('invalid_response');
}

function contentOf(payload: any): { text: string; model?: string; usage?: any } | undefined {
  const choice = payload?.choices?.[0];
  const raw = choice?.message?.content ?? choice?.text;
  let text: string | undefined;
  if (typeof raw === 'string') {
    text = raw;
  } else if (Array.isArray(raw)) {
    const parts = raw
      .map((part: any) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean);
    if (parts.length > 0) text = parts.join('');
  }
  if (!text) return undefined;
  return {
    text,
    model: typeof payload?.model === 'string' ? payload.model : undefined,
    usage: payload?.usage,
  };
}

export class OpenAICompatibleProvider implements InferenceProvider {
  readonly kind: 'managed' | 'openai-compatible';
  readonly name: string;
  readonly model: string;
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly chatTemplateKwargs?: Record<string, unknown>;
  private mode: StructuredOutputMode = 'json_schema';

  constructor(options: OpenAICompatibleOptions) {
    this.kind = options.kind || 'openai-compatible';
    this.name = options.name;
    this.endpoint = options.endpoint;
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.timeoutMs = Math.max(1000, Number(options.timeoutMs) || 120000);
    this.fetchImpl = options.fetch || ((url, init) => fetch(url, init));
    this.chatTemplateKwargs = options.chatTemplateKwargs;
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    const validation = validateEndpoint(this.endpoint);
    if (validation.ok === false) throw new InferenceError('configuration', validation.reason);
    if (!this.model.trim()) throw new InferenceError('configuration', 'model_missing');
    if (signal?.aborted) throw new InferenceError('cancelled');
  }

  capabilities(): ProviderCapabilities {
    return { structuredOutput: this.mode, tokenizer: this.kind === 'managed', modelDiscovery: true };
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await this.request(
      modelsUrl(this.endpoint),
      { method: 'GET', headers: this.headers() },
      signal,
      this.timeoutMs
    );
    if (!isOk(response, statusOf(response))) throw mapStatus(statusOf(response));
    const payload = JSON.parse(await readBoundedWithTimeout(response, this.timeoutMs));
    const models = Array.isArray(payload?.data)
      ? payload.data.map((entry: any) => entry?.id).filter((id: unknown): id is string => typeof id === 'string')
      : [];
    return models;
  }

  /**
   * Never includes diagnostic evidence. A provider without /models gets a
   * minimal non-evidence prompt instead.
   */
  async testConnection(signal?: AbortSignal): Promise<ProviderTestResult> {
    try {
      const models = await this.listModels(signal);
      return { ok: true, models };
    } catch (error) {
      if (error instanceof InferenceError && error.code === 'unauthorized') {
        return { ok: false, error: 'unauthorized' };
      }
    }

    try {
      const response = await this.request(
        chatCompletionsUrl(this.endpoint),
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: 'user', content: 'Reply with OK.' }],
            max_tokens: 4,
            stream: false,
          }),
        },
        signal,
        this.timeoutMs
      );
      if (!isOk(response, statusOf(response))) return { ok: false, error: mapStatus(statusOf(response)).code };
      const payload = JSON.parse(await readBoundedWithTimeout(response, this.timeoutMs));
      return contentOf(payload) ? { ok: true } : { ok: false, error: 'invalid_response' };
    } catch (error) {
      return { ok: false, error: error instanceof InferenceError ? error.code : 'unavailable' };
    }
  }

  async infer(request: InferenceRequest, signal: AbortSignal): Promise<InferenceResult> {
    const modes: StructuredOutputMode[] =
      this.mode === 'json_schema'
        ? ['json_schema', 'json_object', 'prompt-only']
        : this.mode === 'json_object'
          ? ['json_object', 'prompt-only']
          : ['prompt-only'];

    let lastError: InferenceError | undefined;
    for (const mode of modes) {
      try {
        const result = await this.inferWithMode(request, signal, mode);
        this.mode = mode;
        return result;
      } catch (error) {
        if (!(error instanceof InferenceError)) throw error;
        lastError = error;
        if (error.code !== 'invalid_response' || mode === 'prompt-only') throw error;
      }
    }
    throw lastError || new InferenceError('invalid_response');
  }

  tokenize(text: string, signal: AbortSignal): Promise<number> {
    return this.request(
      tokenizeUrl(this.endpoint),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ content: text }),
      },
      signal,
      this.timeoutMs
    ).then(async (response) => {
      if (!isOk(response, statusOf(response))) throw mapStatus(statusOf(response));
      const payload = JSON.parse(await readBoundedWithTimeout(response, this.timeoutMs));
      return Array.isArray(payload?.tokens) ? payload.tokens.length : 0;
    });
  }

  async dispose(): Promise<void> {
    // Stateless: each request owns its AbortController.
  }

  private async inferWithMode(
    request: InferenceRequest,
    signal: AbortSignal,
    mode: StructuredOutputMode
  ): Promise<InferenceResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: request.messages,
      max_tokens: Math.max(256, Math.min(4096, request.maxOutputTokens)),
      temperature: typeof request.temperature === 'number' ? request.temperature : 0.2,
      top_p: 0.9,
      stream: false,
    };
    if (this.chatTemplateKwargs) {
      body.chat_template_kwargs = this.chatTemplateKwargs;
    }
    if (mode === 'json_schema') {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'diagnostic_analysis', strict: true, schema: request.responseSchema },
      };
    } else if (mode === 'json_object') {
      body.response_format = { type: 'json_object' };
    }

    const response = await this.request(
      chatCompletionsUrl(this.endpoint),
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
      signal,
      request.timeoutMs || this.timeoutMs
    );
    const status = statusOf(response);
    if (!isOk(response, status)) throw mapStatus(status);
    const payload = JSON.parse(await readBoundedWithTimeout(response, request.timeoutMs || this.timeoutMs));
    const content = contentOf(payload);
    if (!content) throw new InferenceError('invalid_response');
    const usage = content.usage
      ? {
          promptTokens: Number(content.usage.prompt_tokens) || undefined,
          completionTokens: Number(content.usage.completion_tokens) || undefined,
        }
      : undefined;
    return {
      text: content.text,
      model: content.model || this.model,
      ...(usage ? { usage } : {}),
    };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  private async request(
    url: string,
    init: Record<string, unknown>,
    external: AbortSignal | undefined,
    timeoutMs: number
  ): Promise<ResponseLike> {
    if (external?.aborted) throw new InferenceError('cancelled');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      Math.max(1000, timeoutMs)
    );
    const onAbort = () => controller.abort();
    external?.addEventListener('abort', onAbort);
    try {
      const response = (await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
        redirect: 'manual',
        maxRedirections: 0,
      })) as ResponseLike;
      const responseUrl = typeof response.url === 'string' ? response.url : '';
      if (responseUrl) {
        try {
          if (new URL(responseUrl).origin !== new URL(url).origin) {
            throw new InferenceError('redirect_rejected');
          }
        } catch (error) {
          if (error instanceof InferenceError) throw error;
        }
      }
      return response;
    } catch (error) {
      if (error instanceof InferenceError) throw error;
      if (timedOut) throw new InferenceError('timeout');
      if (external?.aborted || controller.signal.aborted) throw new InferenceError('cancelled');
      throw new InferenceError('unavailable');
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
    }
  }
}
