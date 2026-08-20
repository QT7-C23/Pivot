import { z } from 'zod'

const TimestampSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)))

export const MarketplacePublicationBlockerCodeSchema = z.enum([
  'catalog-empty',
  'catalog-expiring',
  'catalog-unavailable',
  'installation-recovery-pending',
  'plugin-sandbox-unavailable',
  'resource-consumer-unavailable',
])

export const MarketplacePublicationQualificationSchema = z.object({
  blockers: z.array(z.object({
    code: MarketplacePublicationBlockerCodeSchema,
    detail: z.string().trim().min(1).max(1_000),
  }).strict().readonly()).max(128).readonly(),
  catalogRevision: z.number().int().nonnegative().optional(),
  checkedAt: TimestampSchema,
  ready: z.boolean(),
  schemaVersion: z.literal(1),
}).strict().superRefine((qualification, context) => {
  if (qualification.ready !== (qualification.blockers.length === 0)) {
    context.addIssue({ code: 'custom', message: 'Publication readiness must match its blockers' })
  }
  if (qualification.ready && qualification.catalogRevision === undefined) {
    context.addIssue({ code: 'custom', message: 'Ready publication requires a Catalog revision' })
  }
}).readonly()

export type MarketplacePublicationQualification = z.infer<typeof MarketplacePublicationQualificationSchema>
