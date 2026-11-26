import { ManagedRuntimeEndpoint } from '../../../types/Intelligence';
import { ManagedInferenceProvider, ManagedRuntimeAccess } from './managed';
import { FetchLike, OpenAICompatibleProvider } from './openai-compatible';

export type ProviderBudget = {
  timeoutMs?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
};

/**
 * Single construction point so the desktop client cannot accidentally omit the
 * native transport. The managed token is only ever used with the endpoint
 * returned by the native runtime.
 */
export function createManagedInferenceProvider(
  access: ManagedRuntimeAccess,
  budget: ProviderBudget,
  fetch: FetchLike
): ManagedInferenceProvider {
  return new ManagedInferenceProvider(access, { ...budget, fetch });
}

export function createCustomInferenceProvider(
  endpoint: string,
  model: string,
  apiKey: string | undefined,
  budget: ProviderBudget,
  fetch: FetchLike
): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    name: 'Custom OpenAI-compatible provider',
    endpoint,
    model,
    apiKey,
    ...budget,
    fetch,
  });
}

export type { ManagedRuntimeEndpoint };
