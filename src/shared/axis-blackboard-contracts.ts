import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const BlackboardKeySchema = z.string().trim().min(1).max(240).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  'Blackboard keys must be stable dotted identifiers',
)
const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Invalid ISO timestamp',
)
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 digest')

export const AxisBlackboardBindingSchema = z.object({
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
}).strict()

export const AxisBlackboardRunBindingSchema = AxisBlackboardBindingSchema.omit({ taskId: true })

export const AxisBlackboardValueSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    value: z.string().max(16_000),
  }).strict(),
  z.object({
    type: z.literal('number'),
    value: z.number().finite(),
  }).strict(),
  z.object({
    type: z.literal('boolean'),
    value: z.boolean(),
  }).strict(),
  z.object({
    type: z.literal('string-list'),
    value: z.array(z.string().max(2_000)).max(256),
  }).strict(),
  z.object({
    type: z.literal('json'),
    value: z.string().max(32_000).refine(isJson, 'Expected a valid JSON value'),
  }).strict(),
])

export const AxisBlackboardFactDraftSchema = z.object({
  factId: IdentifierSchema,
  key: BlackboardKeySchema,
  value: AxisBlackboardValueSchema,
  visibility: z.enum(['run', 'task']),
}).strict()

export const AxisBlackboardEvidenceDraftSchema = z.object({
  digestSha256: Sha256Schema,
  evidenceId: IdentifierSchema,
  evidenceType: BlackboardKeySchema,
  locator: z.string().trim().min(1).max(2_000),
  mediaType: z.string().trim().min(1).max(160),
  source: z.enum(['worker', 'gate', 'runtime', 'user', 'system']),
  summary: z.string().trim().min(1).max(4_000),
  visibility: z.enum(['run', 'task']),
}).strict()

export const AxisBlackboardFactSchema = AxisBlackboardFactDraftSchema.extend({
  createdAt: TimestampSchema,
  ownerTaskId: IdentifierSchema.nullable(),
}).strict().superRefine((fact, context) => {
  if (fact.visibility === 'task' && !fact.ownerTaskId) {
    context.addIssue({
      code: 'custom',
      message: 'Task-private facts require an owner task',
      path: ['ownerTaskId'],
    })
  }
})

export const AxisBlackboardEvidenceSchema = AxisBlackboardEvidenceDraftSchema.extend({
  createdAt: TimestampSchema,
  ownerTaskId: IdentifierSchema.nullable(),
}).strict().superRefine((evidence, context) => {
  if (evidence.visibility === 'task' && !evidence.ownerTaskId) {
    context.addIssue({
      code: 'custom',
      message: 'Task-private evidence requires an owner task',
      path: ['ownerTaskId'],
    })
  }
})

export const AxisBlackboardSnapshotSchema = z.object({
  createdAt: TimestampSchema,
  evidence: z.array(AxisBlackboardEvidenceSchema).max(4_096),
  facts: z.array(AxisBlackboardFactSchema).max(2_048),
  revision: z.number().int().positive(),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  updatedAt: TimestampSchema,
}).strict().superRefine((snapshot, context) => {
  addUniqueIssue(
    snapshot.facts.map((fact) => fact.factId),
    context,
    ['facts'],
    'Blackboard fact identifiers must be unique',
  )
  addUniqueIssue(
    snapshot.evidence.map((item) => item.evidenceId),
    context,
    ['evidence'],
    'Blackboard evidence identifiers must be unique',
  )
  if (Date.parse(snapshot.updatedAt) < Date.parse(snapshot.createdAt)) {
    context.addIssue({
      code: 'custom',
      message: 'Blackboard update time cannot precede creation',
      path: ['updatedAt'],
    })
  }
})

export const AxisBlackboardViewSchema = z.object({
  evidence: z.array(AxisBlackboardEvidenceSchema).max(4_096),
  facts: z.array(AxisBlackboardFactSchema).max(2_048),
  revision: z.number().int().positive(),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
  updatedAt: TimestampSchema,
}).strict()

export const AxisBlackboardFactWriteSchema = z.object({
  draft: AxisBlackboardFactDraftSchema,
  expectedRevision: z.number().int().positive(),
}).strict()

export const AxisBlackboardEvidenceWriteSchema = z.object({
  draft: AxisBlackboardEvidenceDraftSchema,
  expectedRevision: z.number().int().positive(),
}).strict()

export type AxisBlackboardBinding = z.infer<typeof AxisBlackboardBindingSchema>
export type AxisBlackboardRunBinding = z.infer<typeof AxisBlackboardRunBindingSchema>
export type AxisBlackboardValue = z.infer<typeof AxisBlackboardValueSchema>
export type AxisBlackboardFactDraft = z.infer<typeof AxisBlackboardFactDraftSchema>
export type AxisBlackboardEvidenceDraft = z.infer<typeof AxisBlackboardEvidenceDraftSchema>
export type AxisBlackboardFact = z.infer<typeof AxisBlackboardFactSchema>
export type AxisBlackboardEvidence = z.infer<typeof AxisBlackboardEvidenceSchema>
export type AxisBlackboardSnapshot = z.infer<typeof AxisBlackboardSnapshotSchema>
export type AxisBlackboardView = z.infer<typeof AxisBlackboardViewSchema>
export type AxisBlackboardFactWrite = z.infer<typeof AxisBlackboardFactWriteSchema>
export type AxisBlackboardEvidenceWrite = z.infer<typeof AxisBlackboardEvidenceWriteSchema>

function isJson(value: string): boolean {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}
function addUniqueIssue(
  values: string[],
  context: z.RefinementCtx,
  path: PropertyKey[],
  message: string,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: 'custom', message, path })
  }
}
