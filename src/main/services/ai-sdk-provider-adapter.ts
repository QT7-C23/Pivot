import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamText, type LanguageModel } from 'ai'
import type { AgentAdapterInfo, ProviderConfig } from '../../shared/types/domain'
import type { AgentAdapter, AgentAdapterRequest } from './agent-adapters'
import type { AgentAdapterEvent } from './agent-events'
import { createProviderBoundFetch, validateAndNormalizeProviderEndpoint } from './provider-trust-policy'
import { createNodeProviderPinnedFetch } from './node-provider-pinned-fetch-adapter'

interface TextStreamResult {
  textStream: AsyncIterable<string>
}

type TextStreamRunner = (options: {
  abortSignal: AbortSignal
  maxOutputTokens: number
  model: LanguageModel
  prompt: string
}) => TextStreamResult

export class AiSdkProviderAdapter implements AgentAdapter {
  readonly id: string
  readonly label: string
  private readonly model: LanguageModel

  constructor(
    private readonly provider: ProviderConfig,
    apiKey: string,
    fetcher?: typeof fetch,
    private readonly runTextStream: TextStreamRunner = streamText,
  ) {
    this.id = `provider:${provider.id}`
    this.label = `${provider.label} · ${provider.model}`
    this.model = createProviderLanguageModel(provider, apiKey, fetcher)
  }

  get info(): AgentAdapterInfo {
    return { id: this.id, kind: 'http', label: this.label, profileId: this.provider.id }
  }

  async *stream({ signal, text }: AgentAdapterRequest): AsyncIterable<AgentAdapterEvent> {
    const result = this.runTextStream({
      abortSignal: signal,
      maxOutputTokens: 8192,
      model: this.model,
      prompt: text,
    })
    for await (const textDelta of result.textStream) {
      if (textDelta) yield { text: textDelta, type: 'text' }
    }
  }
}

export function createProviderLanguageModel(
  provider: ProviderConfig,
  apiKey: string,
  fetcher?: typeof fetch,
): LanguageModel {
  const baseURL = validateAndNormalizeProviderEndpoint(provider.kind, provider.baseUrl)
  const providerFetch = fetcher
    ? createProviderBoundFetch(provider, fetcher)
    : createNodeProviderPinnedFetch(provider)
  if (provider.kind === 'anthropic') {
    return createAnthropic({ apiKey, baseURL, fetch: providerFetch })(provider.model)
  }
  if (provider.kind === 'openai') {
    return createOpenAI({ apiKey, baseURL, fetch: providerFetch })(provider.model)
  }
  return createOpenAICompatible({
    apiKey,
    baseURL,
    fetch: providerFetch,
    name: `pivot.${provider.kind}`,
  })(provider.model)
}
