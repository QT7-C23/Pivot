import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const ToolNameSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().datetime({ offset: true })

const EventIdentityShape = {
  runId: IdentifierSchema,
  sessionId: IdentifierSchema,
}

const RunStartedDataSchema = z.object({
  adapterId: IdentifierSchema,
  profileId: IdentifierSchema.nullable(),
  toolPolicy: z.enum(['full', 'read-only']),
}).strict()

const PhaseChangedDataSchema = z.object({
  phase: z.enum(['thinking', 'writing', 'tool_use']),
}).strict()

const PermissionResolvedDataSchema = z.object({
  behavior: z.enum(['allow', 'deny']),
  toolName: ToolNameSchema,
}).strict()

const ToolStartedDataSchema = z.object({
  operationId: IdentifierSchema,
  toolName: ToolNameSchema,
}).strict()

const ToolFinishedDataSchema = z.object({
  fileAction: z.enum(['add', 'modify', 'delete']).nullable(),
  operationId: IdentifierSchema,
  outputBytes: z.number().int().min(0).max(64 * 1024 * 1024),
  status: z.enum(['done', 'error']),
  toolName: ToolNameSchema,
}).strict()

const RunFinishedDataSchema = z.object({
  errorName: IdentifierSchema.nullable(),
  responseBytes: z.number().int().min(0).max(64 * 1024 * 1024),
  status: z.enum(['completed', 'aborted', 'failed']),
}).strict()

function appendVariant<TType extends string, TData extends z.ZodType>(
  type: TType,
  data: TData,
) {
  return z.object({ ...EventIdentityShape, data, type: z.literal(type) }).strict()
}

const appendVariants = [
  appendVariant('run-started', RunStartedDataSchema),
  appendVariant('phase-changed', PhaseChangedDataSchema),
  appendVariant('permission-resolved', PermissionResolvedDataSchema),
  appendVariant('tool-started', ToolStartedDataSchema),
  appendVariant('tool-finished', ToolFinishedDataSchema),
  appendVariant('run-finished', RunFinishedDataSchema),
] as const

export const AgentRunEventAppendSchema = z.discriminatedUnion('type', appendVariants)

const PersistedIdentityShape = {
  eventId: IdentifierSchema,
  occurredAt: TimestampSchema,
  schemaVersion: z.literal(1),
  sequence: z.number().int().positive(),
}

export const AgentRunEventSchema = z.discriminatedUnion('type', [
  appendVariant('run-started', RunStartedDataSchema).extend(PersistedIdentityShape),
  appendVariant('phase-changed', PhaseChangedDataSchema).extend(PersistedIdentityShape),
  appendVariant('permission-resolved', PermissionResolvedDataSchema).extend(PersistedIdentityShape),
  appendVariant('tool-started', ToolStartedDataSchema).extend(PersistedIdentityShape),
  appendVariant('tool-finished', ToolFinishedDataSchema).extend(PersistedIdentityShape),
  appendVariant('run-finished', RunFinishedDataSchema).extend(PersistedIdentityShape),
])

export type AgentRunEventAppend = z.infer<typeof AgentRunEventAppendSchema>
export type AgentRunEvent = z.infer<typeof AgentRunEventSchema>
