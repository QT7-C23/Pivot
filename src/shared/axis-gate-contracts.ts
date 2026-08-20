import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Invalid ISO timestamp',
)

export const GateResultSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  evidence: z.array(z.string()).max(256),
  gate: z.enum(['compile', 'test', 'lint', 'correctness', 'security']),
  status: z.enum(['passed', 'failed', 'skipped']),
  taskId: IdentifierSchema,
}).strict()

export const AxisGateRunEvidenceSchema = z.object({
  args: z.array(z.string().max(2_000)).max(64),
  command: z.string().trim().min(1).max(160),
  cwd: z.string().trim().min(1).max(1_024),
  cycle: z.number().int().min(1).max(3),
  durationMs: z.number().int().nonnegative().max(121_000),
  evidenceId: IdentifierSchema,
  exitCode: z.number().int().nullable(),
  finishedAt: TimestampSchema,
  gate: z.enum(['compile', 'test', 'lint', 'correctness', 'security']),
  outputTruncated: z.boolean(),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sequence: z.number().int().positive(),
  sessionId: IdentifierSchema,
  startedAt: TimestampSchema,
  status: z.enum(['passed', 'failed']),
  stderr: z.string().max(64 * 1_024),
  stdout: z.string().max(64 * 1_024),
  taskId: IdentifierSchema,
  timedOut: z.boolean(),
  timeoutMs: z.number().int().min(1).max(120_000),
}).strict().superRefine((evidence, context) => {
  if (Date.parse(evidence.finishedAt) < Date.parse(evidence.startedAt)) {
    context.addIssue({ code: 'custom', message: 'Gate finish time cannot precede its start time', path: ['finishedAt'] })
  }
  const passed = evidence.exitCode === 0 && !evidence.timedOut
  if ((evidence.status === 'passed') !== passed) {
    context.addIssue({ code: 'custom', message: 'Gate status must match exit and timeout evidence', path: ['status'] })
  }
})

export const AxisGateBatchResultSchema = z.object({
  cycle: z.number().int().min(1).max(3),
  evidenceIds: z.array(IdentifierSchema).max(5),
  gates: z.array(GateResultSchema).min(1).max(5),
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  status: z.enum(['passed', 'failed']),
  taskId: IdentifierSchema,
}).strict().superRefine((result, context) => {
  const expectedOrder = ['compile', 'test', 'lint', 'correctness', 'security']
  const gateNames = result.gates.map((gate) => gate.gate)
  if (gateNames.some((gate) => !expectedOrder.includes(gate))) {
    context.addIssue({ code: 'custom', message: 'Gate batch contains an unsupported Gate', path: ['gates'] })
  }
  if (new Set(gateNames).size !== gateNames.length) {
    context.addIssue({ code: 'custom', message: 'Gate 1 batch cannot repeat a gate', path: ['gates'] })
  }
  if (gateNames.some((gate, index) => (
    index > 0
    && expectedOrder.indexOf(gate) <= expectedOrder.indexOf(gateNames[index - 1] ?? '')
  ))) {
    context.addIssue({ code: 'custom', message: 'Gate 1 batch must follow compile, test, lint order', path: ['gates'] })
  }
  result.gates.forEach((gate, index) => {
    if (gate.taskId !== result.taskId) {
      context.addIssue({ code: 'custom', message: 'Gate task must match the batch task', path: ['gates', index, 'taskId'] })
    }
  })
  if (
    new Set(result.evidenceIds).size !== result.evidenceIds.length
    || result.evidenceIds.length !== result.gates.filter((gate) => gate.status !== 'skipped').length
  ) {
    context.addIssue({ code: 'custom', message: 'Gate evidence identifiers must cover each executed gate exactly once', path: ['evidenceIds'] })
  }
  const passed = result.gates.every((gate) => gate.status === 'passed')
  if ((result.status === 'passed') !== passed) {
    context.addIssue({ code: 'custom', message: 'Gate batch status must match its gate results', path: ['status'] })
  }
})

export type GateResult = z.infer<typeof GateResultSchema>
export type AxisGateRunEvidence = z.infer<typeof AxisGateRunEvidenceSchema>
export type AxisGateBatchResult = z.infer<typeof AxisGateBatchResultSchema>
