import path from 'node:path'
import {
  AxisGateProfileSchema,
  type AxisGateProfile,
} from '../../shared/axis-gate-profile-contracts'
import type { AxisGateProfilePort } from './axis-gate-profile-port'
import type { AxisProjectBindingReaderPort } from './axis-project-binding-ports'

export function pivotTrustedGateProfile(): AxisGateProfile {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  return immutableProfile({
    commands: [
      { args: ['exec', 'tsc', '--', '--noEmit'], command, gate: 'compile', timeoutMs: 120_000 },
      { args: ['exec', 'vitest', 'run'], command, gate: 'test', timeoutMs: 120_000 },
      { args: ['run', 'verify:mvp'], command, gate: 'correctness', timeoutMs: 120_000 },
      { args: ['audit', '--audit-level=high', '--omit=dev', '--ignore-scripts'], command, gate: 'security', timeoutMs: 120_000 },
    ],
    profileId: 'pivot-typescript-strict',
    schemaVersion: 1,
  })
}

export class AxisTrustedGateProfileAdapter implements AxisGateProfilePort {
  private readonly profile: AxisGateProfile
  private readonly projects: AxisProjectBindingReaderPort

  constructor(options: {
    profile: AxisGateProfile
    projects: AxisProjectBindingReaderPort
  }) {
    this.profile = immutableProfile(options.profile)
    this.projects = options.projects
  }

  resolve(binding: { projectRoot: string; sessionId: string }): AxisGateProfile | null {
    if (!path.isAbsolute(binding.projectRoot)) return null
    const project = this.projects.findBySession(binding.sessionId)
    if (!project || canonicalRoot(project.projectRoot) !== canonicalRoot(binding.projectRoot)) {
      return null
    }
    return this.profile
  }
}

function canonicalRoot(projectRoot: string): string {
  const normalized = path.resolve(projectRoot)
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized
}

function immutableProfile(input: AxisGateProfile): AxisGateProfile {
  const profile = AxisGateProfileSchema.parse(input)
  const commands = profile.commands.map((command) => Object.freeze({
    ...command,
    args: Object.freeze([...command.args]),
  }))
  return Object.freeze({
    ...profile,
    commands: Object.freeze(commands),
  }) as AxisGateProfile
}
