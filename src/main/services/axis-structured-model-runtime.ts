import { generateText, Output, type LanguageModel } from 'ai'
import type { z } from 'zod'
import type { AxisModelUsage } from '../../shared/axis-engine-contracts'

export interface AxisTokenPricing {
  inputUsdPerMillion: number
  outputUsdPerMillion: number
}

export const CONSERVATIVE_AXIS_PRICING: AxisTokenPricing = {
  inputUsdPerMillion: 15,
  outputUsdPerMillion: 75,
}

export interface AxisStructuredRunnerInput {
  maxOutputTokens: number
  model: LanguageModel
  prompt: string
  schema: z.ZodType
  signal?: AbortSignal
}

export interface AxisStructuredRunnerResult {
  inputTokens: number
  output: unknown
  outputTokens: number
}

export type AxisStructuredRunner = (input: AxisStructuredRunnerInput) => Promise<AxisStructuredRunnerResult>

export class AxisStructuredModelRuntime {
  private readonly maxOutputTokens: number
  private readonly model: LanguageModel
  private readonly pricing: AxisTokenPricing
  private readonly runStructured: AxisStructuredRunner

  constructor(
    model: LanguageModel,
    options: {
      pricing?: AxisTokenPricing
      maxOutputTokens?: number
      runStructured?: AxisStructuredRunner
    } = {},
  ) {
    this.model = model
    this.maxOutputTokens = options.maxOutputTokens ?? 4_096
    if (!Number.isInteger(this.maxOutputTokens) || this.maxOutputTokens < 1 || this.maxOutputTokens > 4_096) throw new Error('Axis structured output token limit must be from 1 to 4096')
    this.pricing = validatePricing(options.pricing ?? CONSERVATIVE_AXIS_PRICING)
    this.runStructured = options.runStructured ?? runStructuredWithAiSdk
  }

  async generate(schema: z.ZodType, prompt: string): Promise<{ output: unknown; usage: AxisModelUsage }> {
    const result = await this.generateMeasured(schema, prompt)
    return { output: result.output, usage: { costUsd: result.usage.costUsd, tokens: result.usage.tokens } }
  }

  async generateMeasured(schema: z.ZodType, prompt: string, signal?: AbortSignal): Promise<{ output: unknown; usage: AxisModelUsage & { inputTokens: number; outputTokens: number } }> {
    const result = await this.runStructured({ maxOutputTokens: this.maxOutputTokens, model: this.model, prompt, schema, signal })
    const inputTokens = requireTokenCount(result.inputTokens)
    const outputTokens = requireTokenCount(result.outputTokens)
    return {
      output: result.output,
      usage: {
        costUsd: roundCost(
          inputTokens * this.pricing.inputUsdPerMillion / 1_000_000
          + outputTokens * this.pricing.outputUsdPerMillion / 1_000_000,
        ),
        inputTokens,
        outputTokens,
        tokens: inputTokens + outputTokens,
      },
    }
  }
}

export function axisDataBlock(name: string, value: unknown): string {
  return `<${name}>${JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e')}</${name}>`
}

async function runStructuredWithAiSdk({ maxOutputTokens, model, prompt, schema, signal }: AxisStructuredRunnerInput): Promise<AxisStructuredRunnerResult> {
  const result = await generateText({
    maxOutputTokens,
    model,
    output: Output.object({ schema }),
    prompt,
    abortSignal: signal,
  })
  return {
    inputTokens: result.usage.inputTokens ?? 0,
    output: result.output,
    outputTokens: result.usage.outputTokens ?? 0,
  }
}

function requireTokenCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new Error('Axis provider returned an invalid token count')
  return value
}

function validatePricing(pricing: AxisTokenPricing): AxisTokenPricing {
  if (!Number.isFinite(pricing.inputUsdPerMillion) || pricing.inputUsdPerMillion <= 0
    || !Number.isFinite(pricing.outputUsdPerMillion) || pricing.outputUsdPerMillion <= 0) {
    throw new Error('Axis token pricing must contain positive finite rates')
  }
  return pricing
}

function roundCost(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000
}
