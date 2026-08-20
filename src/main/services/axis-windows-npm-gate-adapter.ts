import type { CommandRunResult } from '../../shared/types/domain'
import type { AxisGateCommandRunPort } from './axis-gate-runner'

const SafeNpmGateTokenSchema = /^[A-Za-z0-9._:@/=-]+$/

export class AxisWindowsNpmGateCommandAdapter implements AxisGateCommandRunPort {
  private readonly commandInterpreter: string
  private readonly platform: NodeJS.Platform
  private readonly runner: AxisGateCommandRunPort

  constructor(options: {
    commandInterpreter?: string
    platform?: NodeJS.Platform
    runner: AxisGateCommandRunPort
  }) {
    this.commandInterpreter = options.commandInterpreter ?? 'cmd.exe'
    this.platform = options.platform ?? process.platform
    this.runner = options.runner
  }

  async run(request: {
    args: string[]
    command: string
    cwd: string
    timeoutMs: number
  }): Promise<CommandRunResult> {
    if (this.platform !== 'win32' || request.command.toLowerCase() !== 'npm.cmd') {
      return this.runner.run(request)
    }
    if (
      request.args.length === 0
      || request.args.some((token) => !SafeNpmGateTokenSchema.test(token))
    ) {
      throw new Error('Axis Windows Gate requires every npm argument to be a safe npm Gate token')
    }
    const result = await this.runner.run({
      args: ['/d', '/s', '/c', `npm.cmd ${request.args.join(' ')}`],
      command: this.commandInterpreter,
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
    })
    return {
      ...result,
      args: [...request.args],
      command: request.command,
    }
  }
}
