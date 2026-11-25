import {
  AnalysisReason,
  InferenceError,
  InferenceProvider,
  InferenceRequest,
  InferenceResult,
  ManagedRuntimeEndpoint,
  ProviderCapabilities,
  ProviderTestResult,
} from '../../../types/Intelligence';
import { FetchLike, OpenAICompatibleProvider } from './openai-compatible';

export type ManagedRuntimeAccess = {
  ensure(signal?: AbortSignal, contextWindow?: number): Promise<ManagedRuntimeEndpoint>;
};

/**
 * The managed runtime is still an OpenAI-compatible endpoint. Rust owns the
 * process, port and token; the core only receives a short-lived endpoint.
 */
export class ManagedInferenceProvider implements InferenceProvider {
  readonly kind = 'managed' as const;
  readonly name = 'Barklarm managed runtime';
  model = '';
  private endpoint = '';
  private token = '';
  private inner: OpenAICompatibleProvider | null = null;

  constructor(
    private readonly access: ManagedRuntimeAccess,
    private readonly options: {
      timeoutMs?: number;
      contextWindow?: number;
      maxOutputTokens?: number;
      fetch?: FetchLike;
    } = {}
  ) {}

  async initialize(signal?: AbortSignal): Promise<void> {
    await this.ensureInner(signal);
  }

  private async ensureInner(signal?: AbortSignal): Promise<void> {
    let endpoint: ManagedRuntimeEndpoint;
    try {
      endpoint = await this.access.ensure(signal, this.options.contextWindow);
    } catch (error) {
      if (error instanceof InferenceError) throw error;
      const code = typeof error === 'string' ? error : '';
      const reasons: Record<string, AnalysisReason> = {
        model_missing: 'model_missing',
        model_invalid: 'model_missing',
        runtime_missing: 'runtime_missing',
        runtime_start_failed: 'runtime_failed',
        unsupported_hardware: 'unsupported_hardware',
      };
      throw new InferenceError('unavailable', code || 'runtime_unavailable', reasons[code] || 'provider_unavailable');
    }
    const nextModel = endpoint.model || this.model || 'barklarm-managed-default';
    if (
      !this.inner ||
      this.model !== nextModel ||
      this.endpoint !== endpoint.endpoint ||
      this.token !== endpoint.token
    ) {
      this.model = nextModel;
      this.endpoint = endpoint.endpoint;
      this.token = endpoint.token;
      this.inner = new OpenAICompatibleProvider({
        kind: 'managed',
        name: this.name,
        endpoint: endpoint.endpoint,
        model: nextModel,
        apiKey: endpoint.token,
        timeoutMs: this.options.timeoutMs,
        contextWindow: this.options.contextWindow,
        maxOutputTokens: this.options.maxOutputTokens,
        // Qwen3 defaults to a reasoning stream that would consume the bounded
        // analysis budget before emitting the validated JSON answer.
        chatTemplateKwargs: { enable_thinking: false },
        fetch: this.options.fetch,
      });
    }
    await this.inner.initialize(signal);
  }

  capabilities(): ProviderCapabilities {
    return this.inner?.capabilities() || { structuredOutput: 'json_schema', tokenizer: true, modelDiscovery: true };
  }

  async testConnection(signal?: AbortSignal): Promise<ProviderTestResult> {
    await this.ensureInner(signal);
    const inner = this.inner;
    if (!inner) throw new InferenceError('unavailable');
    return inner.testConnection(signal);
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    await this.ensureInner(signal);
    const inner = this.inner;
    if (!inner) throw new InferenceError('unavailable');
    return inner.listModels(signal);
  }

  async infer(request: InferenceRequest, signal: AbortSignal): Promise<InferenceResult> {
    await this.ensureInner(signal);
    const inner = this.inner;
    if (!inner) throw new InferenceError('unavailable');
    return inner.infer(request, signal);
  }

  async tokenize(text: string, signal: AbortSignal): Promise<number> {
    await this.ensureInner(signal);
    const inner = this.inner;
    if (!inner?.tokenize) throw new InferenceError('unsupported');
    return inner.tokenize(text, signal);
  }

  async dispose(): Promise<void> {
    this.inner = null;
  }
}
