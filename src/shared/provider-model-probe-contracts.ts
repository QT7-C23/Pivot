import { z } from 'zod'

const Identifier = z.string().trim().min(1).max(160)
const Timestamp = z.string().datetime({ offset: true })

export const ProviderModelProbeRequestSchema = z.object({
  forceRefresh: z.boolean().default(false),
  providerId: Identifier,
}).strict()

export const ProviderModelProbeResultSchema = z.object({
  available: z.boolean(),
  cacheState: z.enum(['hit', 'refreshed', 'stale', 'none']),
  expiresAt: Timestamp.nullable(),
  models: z.array(Identifier).max(100),
  probedAt: Timestamp.nullable(),
  providerId: Identifier,
  schemaVersion: z.literal(1),
  truncated: z.boolean(),
  unavailableReason: z.enum(['not-configured', 'probe-failed']).nullable(),
}).strict().superRefine((value, context) => {
  if (value.available) {
    if (value.unavailableReason !== null || !value.probedAt || !value.expiresAt || value.cacheState === 'none') {
      context.addIssue({ code: 'custom', message: 'available probe evidence requires timestamps and no unavailable reason' })
    }
  } else if (
    value.models.length > 0
    || value.unavailableReason === null
    || value.probedAt !== null
    || value.expiresAt !== null
    || value.cacheState !== 'none'
    || value.truncated
  ) {
    context.addIssue({ code: 'custom', message: 'unavailable probe evidence cannot expose model or cache data' })
  }
})

export type ProviderModelProbeRequest = z.infer<typeof ProviderModelProbeRequestSchema>
export type ProviderModelProbeResult = z.infer<typeof ProviderModelProbeResultSchema>
