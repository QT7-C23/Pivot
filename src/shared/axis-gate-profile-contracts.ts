import { z } from 'zod'

export const AxisGateNameSchema = z.enum([
  'compile',
  'test',
  'lint',
  'correctness',
  'security',
])

const AxisGateCommandSchema = z.object({
  args: z.array(z.string().max(2_000)).max(64),
  command: z.string().trim().min(1).max(160).refine(
    (value) => !/[\\/]/.test(value),
    'Gate command must be an executable name, not a path',
  ),
  gate: AxisGateNameSchema,
  timeoutMs: z.number().int().min(1).max(120_000),
}).strict()

const GATE_ORDER = AxisGateNameSchema.options

export const AxisGateProfileSchema = z.object({
  commands: z.array(AxisGateCommandSchema).min(1).max(GATE_ORDER.length),
  profileId: z.string().trim().min(1).max(160),
  schemaVersion: z.literal(1),
}).strict().superRefine((profile, context) => {
  const names = profile.commands.map(({ gate }) => gate)
  if (new Set(names).size !== names.length) {
    context.addIssue({ code: 'custom', message: 'Gate command definitions must be unique', path: ['commands'] })
  }
  if (names.some((name, index) => (
    index > 0 && GATE_ORDER.indexOf(name) <= GATE_ORDER.indexOf(names[index - 1]!)
  ))) {
    context.addIssue({ code: 'custom', message: 'Gate commands must follow the trusted Gate order', path: ['commands'] })
  }
})

export type AxisGateName = z.infer<typeof AxisGateNameSchema>
export type AxisGateProfile = z.infer<typeof AxisGateProfileSchema>
export type AxisGateCommand = AxisGateProfile['commands'][number]
