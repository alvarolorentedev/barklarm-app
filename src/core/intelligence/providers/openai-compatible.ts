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

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal, error: () => InferenceError): Promise<T> {
  if (signal.aborted) return Promise.reject(error());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(error());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (reason) => {
        signal.removeEventListener('abort', onAbort);
        reject(reason);
      }
    );
  });
}

async function readBounded(
  response: ResponseLike,
  signal: AbortSignal,
  abortError: () => InferenceError
): Promise<string> {
  const declaredHeader = response.headers?.get?.('content-length');
  const declared = declaredHeader === null || declaredHeader === undefined ? Number.NaN : Number(declaredHeader);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new InferenceError('too_large');
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    // The native transport exposes a stream. A non-stream fallback is only
    // accepted with a declared, bounded length; otherwise fail closed rather
    // than buffering an unbounded body.
    if (!Number.isFinite(declared) || declared < 0) throw new InferenceError('invalid_response');
    const text = await raceAbort(Promise.resolve(response.text?.()), signal, abortError);
    if (typeof text !== 'string') throw new InferenceError('invalid_response');
    if (text.length > MAX_RESPONSE_BYTES) throw new InferenceError('too_large');
    return text;
  }
  let total = 0;
  let output = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await raceAbort(Promise.resolve(reader.read()), signal, abortError);
      if (chunk.done) break;
      const value = chunk.value as Uint8Array | undefined;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new InferenceError('too_large');
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } catch (error) {
    // Cancelling the reader also releases a stalled native body.
    try {
      await reader.cancel?.();
    } catch {
      // Best effort.
    }
    throw error;
  } finally {
    try {
      reader.releaseLock?.();
    } catch {
      // Best effort.
    }
  }
}

function mapStatus(status: number): InferenceError {
  if (status === 401 || status === 403) return new InferenceError('unauthorized');
  if (status === 408 || status === 504) return new InferenceError('timeout');
  if (status === 429) return new InferenceError('rate_limited');
  if (status >= 300 && status < 400) return new InferenceError('redirect_rejected');
  if (status >= 500) return new InferenceError('unavailable');
  // Structured-output compatibility errors. Other 4xx responses are final.
  if (status === 400 || status === 422) return new InferenceError('unsupported');
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
    const payload = await this.requestJson(
      modelsUrl(this.endpoint),
      { method: 'GET', headers: this.headers() },
      signal,
      this.timeoutMs
    );
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
      const payload = await this.requestJson(
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
        // Only a provider rejecting the structured-output capability justifies
        // another request. Invalid output is final and must not multiply cost.
        if (error.code !== 'unsupported' || mode === 'prompt-only') throw error;
      }
    }
    throw lastError || new InferenceError('invalid_response');
  }

  async tokenize(text: string, signal: AbortSignal): Promise<number> {
    const payload = await this.requestJson(
      tokenizeUrl(this.endpoint),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ content: text }),
      },
      signal,
      this.timeoutMs
    );
    return Array.isArray(payload?.tokens) ? payload.tokens.length : 0;
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

    const payload = await this.requestJson(
      chatCompletionsUrl(this.endpoint),
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body) },
      signal,
      request.timeoutMs || this.timeoutMs
    );
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

  /**
   * One controller and one deadline cover connect, headers and body. A caller
   * cancellation after headers therefore still cancels the body read.
   */
  private async requestJson(
    url: string,
    init: Record<string, unknown>,
    external: AbortSignal | undefined,
    timeoutMs: number
  ): Promise<any> {
    if (external?.aborted) throw new InferenceError('cancelled');
    const controller = new AbortController();
    let timedOut = false;
    let externallyAborted = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      Math.max(1000, timeoutMs)
    );
    const onAbort = () => {
      externallyAborted = true;
      controller.abort();
    };
    external?.addEventListener('abort', onAbort, { once: true });
    const abortError = (): InferenceError =>
      timedOut ? new InferenceError('timeout') : new InferenceError('cancelled');
    try {
      const response = (await raceAbort(
        Promise.resolve(
          this.fetchImpl(url, {
            ...init,
            signal: controller.signal,
            redirect: 'manual',
            maxRedirections: 0,
          })
        ),
        controller.signal,
        abortError
      )) as ResponseLike;
      const responseUrl = typeof response.url === 'string' ? response.url : '';
      if (responseUrl && new URL(responseUrl).origin !== new URL(url).origin) {
        throw new InferenceError('redirect_rejected');
      }
      const status = statusOf(response);
      if (!isOk(response, status)) {
        // Drain a bounded error body so the connection is released; the body
        // is never surfaced or logged.
        try {
          await readBounded(response, controller.signal, abortError);
        } catch {
          // The status remains the authoritative error.
        }
        throw mapStatus(status);
      }
      const text = await readBounded(response, controller.signal, abortError);
      try {
        return JSON.parse(text);
      } catch {
        throw new InferenceError('invalid_response');
      }
    } catch (error) {
      if (error instanceof InferenceError) throw error;
      if (timedOut) throw new InferenceError('timeout');
      if (externallyAborted || external?.aborted || controller.signal.aborted) {
        throw new InferenceError('cancelled');
      }
      throw new InferenceError('unavailable');
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
    }
  }
}
