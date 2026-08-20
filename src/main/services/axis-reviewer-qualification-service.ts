import { z } from 'zod'
import { AxisReviewerQualificationRequestSchema, type AxisReviewerQualificationEvidence, type AxisReviewerQualificationRequest } from '../../shared/axis-reviewer-qualification-contracts'
import type { ProviderConfig } from '../../shared/types/domain'
import type { AxisReviewerQualificationEvidencePort } from './axis-reviewer-qualification-registry'

const Output = z.object({ nonce: z.literal('pivot-reviewer-qualified'), schemaVersion: z.literal(1) }).strict()
export interface AxisReviewerQualificationRunnerPort {
  qualify(input: Readonly<{ apiKey: string; modelId: string; provider: ProviderConfig; signal?: AbortSignal }>): Promise<Readonly<{ output: unknown; usage: { costUsd: number; inputTokens: number; outputTokens: number } }>>
}
export class AxisReviewerQualificationService {
  private readonly clock; private readonly timeoutMs
  constructor(private readonly options: { clock?: () => number; evidence: AxisReviewerQualificationEvidencePort; providers: { get(id: string): ProviderConfig | null; readSecret(id: string): string }; runner: AxisReviewerQualificationRunnerPort; timeoutMs?: number }) {
    this.clock = options.clock ?? Date.now; this.timeoutMs = options.timeoutMs ?? 10_000
  }
  async qualify(input: AxisReviewerQualificationRequest): Promise<AxisReviewerQualificationEvidence> {
    const request = AxisReviewerQualificationRequestSchema.parse(input)
    const provider = this.options.providers.get(request.providerId)
    if (!provider?.hasApiKey) throw new Error('Reviewer qualification requires a configured Provider')
    const controller = new AbortController()
    const result = await withTimeout(this.options.runner.qualify({ apiKey: this.options.providers.readSecret(provider.id), modelId: request.modelId, provider, signal: controller.signal }), this.timeoutMs, controller)
    if (!Output.safeParse(result.output).success) throw new Error('Reviewer qualification output is invalid')
    if (result.usage.costUsd > 0.01 || result.usage.inputTokens > 512 || result.usage.outputTokens > 128) throw new Error('Reviewer qualification exceeded budget')
    const now = this.clock()
    return this.options.evidence.record({ expiresAt: new Date(now + 24 * 60 * 60_000).toISOString(), modelId: request.modelId,
      providerId: provider.id, providerRevision: provider.updatedAt, qualified: true, qualifiedAt: new Date(now).toISOString(), schemaVersion: 1, usage: result.usage })
  }
}
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  try { return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error('Reviewer qualification timeout')) }, timeoutMs) })]) }
  catch (error) { if (timedOut) throw new Error('Reviewer qualification timeout', { cause: error }); throw error }
  finally { if (timer) clearTimeout(timer) }
}
