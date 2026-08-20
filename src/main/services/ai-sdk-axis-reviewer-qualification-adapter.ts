import { z } from 'zod'
import { createProviderLanguageModel } from './ai-sdk-provider-adapter'
import { AxisStructuredModelRuntime, type AxisStructuredRunner } from './axis-structured-model-runtime'
import type { AxisReviewerQualificationRunnerPort } from './axis-reviewer-qualification-service'

const Schema = z.object({ nonce: z.literal('pivot-reviewer-qualified'), schemaVersion: z.literal(1) }).strict()

export class AiSdkAxisReviewerQualificationAdapter implements AxisReviewerQualificationRunnerPort {
  constructor(private readonly options: { fetcher?: typeof fetch; runStructured?: AxisStructuredRunner } = {}) {}
  async qualify(input: Parameters<AxisReviewerQualificationRunnerPort['qualify']>[0]) {
    const runtime = new AxisStructuredModelRuntime(
      createProviderLanguageModel({ ...input.provider, model: input.modelId }, input.apiKey, this.options.fetcher),
      { maxOutputTokens: 128, runStructured: this.options.runStructured },
    )
    const result = await runtime.generateMeasured(Schema, [
      'Pivot Reviewer capability qualification. Return the exact requested structured object.',
      'Perform this request without tools, file access, network browsing, or side effects.',
      'Set nonce to pivot-reviewer-qualified and schemaVersion to 1.',
    ].join('\n'), input.signal)
    return { output: result.output, usage: { costUsd: result.usage.costUsd, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens } }
  }
}
