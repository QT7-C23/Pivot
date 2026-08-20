import { z } from 'zod'
import {
  AxisGateBatchResultSchema,
  GateResultSchema,
  type AxisGateBatchResult,
  type AxisGateRunEvidence,
  type GateResult,
} from '../../shared/axis-engine-contracts'
import {
  AxisGateNameSchema,
  AxisGateProfileSchema,
  type AxisGateCommand,
  type AxisGateName,
} from '../../shared/axis-gate-profile-contracts'
import type { CommandRunResult } from '../../shared/types/domain'
import type { AxisGateEvidencePort } from './axis-gate-evidence-registry'
import type { AxisGateProfilePort } from './axis-gate-profile-port'
import { resolvePathWithinRoot } from './file-system'

const AxisGateRunRequestSchema = z.object({
  cycle: z.number().int().min(1).max(3).default(1),
  projectRoot: z.string().trim().min(1).max(1_024),
  runId: z.string().trim().min(1).max(160),
  sessionId: z.string().trim().min(1).max(160),
  taskId: z.string().trim().min(1).max(160),
  requiredGates: z.array(AxisGateNameSchema).min(1).max(5).superRefine((gates, context) => {
    if (new Set(gates).size !== gates.length) {
      context.addIssue({ code: 'custom', message: 'Required Gates must be unique' })
    }
  }),
}).strict()

export interface AxisGateCommandRunPort {
  run(request: {
    args: string[]
    command: string
    cwd: string
    timeoutMs: number
  }): Promise<CommandRunResult>
}

export class AxisGateRunner {
  private readonly evidence: AxisGateEvidencePort
  private readonly profiles: AxisGateProfilePort
  private readonly runner: AxisGateCommandRunPort

  constructor(options: {
    evidence: AxisGateEvidencePort
    profiles: AxisGateProfilePort
    runner: AxisGateCommandRunPort
  }) {
    this.evidence = options.evidence
    this.profiles = options.profiles
    this.runner = options.runner
  }

  supports(projectRoot: string, sessionId: string, gates: Array<GateResult['gate']>): boolean {
    const profile = this.profiles.resolve({ projectRoot, sessionId })
    if (!profile) return false
    const supported = new Set(profile.commands.map((command) => command.gate))
    return gates.every((gate) => supported.has(gate))
  }

  async run(input: {
    cycle?: number
    projectRoot: string
    runId: string
    sessionId: string
    taskId: string
    requiredGates: AxisGateName[]
  }): Promise<AxisGateBatchResult> {
    const request = AxisGateRunRequestSchema.parse(input)
    const cwd = await resolvePathWithinRoot(request.projectRoot, request.projectRoot)
    const profile = this.profiles.resolve({
      projectRoot: request.projectRoot,
      sessionId: request.sessionId,
    })
    if (!profile) throw new Error('Axis trusted Gate profile is unavailable for the project')
    const parsedProfile = AxisGateProfileSchema.parse(profile)
    const commandsByGate = new Map(parsedProfile.commands.map((command) => [command.gate, command]))
    const commands = request.requiredGates.map((gate) => commandsByGate.get(gate))
    if (commands.some((command) => !command)) {
      throw new Error('Axis trusted Gate profile does not support every required Gate')
    }
    const evidenceIds: string[] = []
    const gates: GateResult[] = []
    let failedGate: AxisGateName | null = null

    for (const command of commands as AxisGateCommand[]) {
      if (failedGate) {
        gates.push(GateResultSchema.parse({
          durationMs: 0,
          evidence: [`Skipped because the ${failedGate} gate failed.`],
          gate: command.gate,
          status: 'skipped',
          taskId: request.taskId,
        }))
        continue
      }

      const result = await this.runCommand(command, cwd)
      const status = result.exitCode === 0 && !result.timedOut ? 'passed' as const : 'failed' as const
      const durationMs = Math.min(121_000, Math.max(0, Date.parse(result.finishedAt) - Date.parse(result.startedAt)))
      const persisted = this.evidence.record({
        args: result.args,
        command: result.command,
        cwd: result.cwd,
        cycle: request.cycle,
        durationMs,
        exitCode: result.exitCode,
        finishedAt: result.finishedAt,
        gate: command.gate,
        outputTruncated: result.outputTruncated,
        runId: request.runId,
        schemaVersion: 1,
        sessionId: request.sessionId,
        startedAt: result.startedAt,
        status,
        stderr: result.stderr,
        stdout: result.stdout,
        taskId: request.taskId,
        timedOut: result.timedOut,
        timeoutMs: result.timeoutMs,
      })
      evidenceIds.push(persisted.evidenceId)
      gates.push(gateResult(command.gate, request.taskId, persisted))
      if (status === 'failed') failedGate = command.gate
    }

    return AxisGateBatchResultSchema.parse({
      cycle: request.cycle,
      evidenceIds,
      gates,
      runId: request.runId,
      schemaVersion: 1,
      sessionId: request.sessionId,
      status: failedGate ? 'failed' : 'passed',
      taskId: request.taskId,
    })
  }

  private async runCommand(command: AxisGateCommand, cwd: string): Promise<CommandRunResult> {
    const startedAt = new Date().toISOString()
    try {
      return await this.runner.run({
        args: [...command.args],
        command: command.command,
        cwd,
        timeoutMs: command.timeoutMs,
      })
    } catch (error) {
      return {
        args: [...command.args],
        command: command.command,
        cwd,
        exitCode: null,
        finishedAt: new Date().toISOString(),
        outputTruncated: false,
        stderr: error instanceof Error ? error.message : 'Gate command failed to start',
        stdout: '',
        timedOut: false,
        timeoutMs: command.timeoutMs,
        startedAt,
      }
    }
  }
}

function gateResult(
  gate: AxisGateCommand['gate'],
  taskId: string,
  evidence: AxisGateRunEvidence,
): GateResult {
  const outcome = evidence.timedOut
    ? `Timed out after ${evidence.timeoutMs} ms.`
    : `Exited with code ${evidence.exitCode === null ? 'unavailable' : evidence.exitCode}.`
  const details = [
    outcome,
    evidence.outputTruncated ? 'Command output was truncated at the hard capture limit.' : 'Command output was captured within the hard limit.',
  ]
  if (evidence.stderr) details.push(`stderr: ${evidence.stderr}`)
  if (evidence.stdout) details.push(`stdout: ${evidence.stdout}`)
  return GateResultSchema.parse({
    durationMs: evidence.durationMs,
    evidence: details,
    gate,
    status: evidence.status,
    taskId,
  })
}
