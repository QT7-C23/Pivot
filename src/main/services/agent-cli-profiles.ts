import { spawn } from 'node:child_process'
import type {
  AgentCliCommandSpec,
  AgentCliCustomProfileConfig,
  AgentCliMaintenanceAction,
  AgentCliMaintenanceResult,
  AgentCliProfile,
  AgentCliProfileId,
} from '../../shared/types/domain'
import { parseArgs } from './utils/parse-args'
import { runCommand } from './utils/spawn-command'
import { CliAgentAdapter, LocalAgentAdapter, type AgentAdapter } from './agent-adapters'
import type { AgentCliProfileStore } from './agent-cli-profile-store'

type SpawnProcess = typeof spawn
const MAINTENANCE_TIMEOUT_MS = 30_000
const MAX_MAINTENANCE_OUTPUT_BYTES = 16 * 1024

export class AgentCliProfileRegistry {
  private readonly env: NodeJS.ProcessEnv
  private readonly localChunkDelayMs?: number
  private readonly profileStore?: AgentCliProfileStore
  private readonly spawnProcess: SpawnProcess
  private customProfileConfigOverride?: AgentCliCustomProfileConfig
  private selectedProfileId: AgentCliProfileId

  constructor(options: {
    env?: NodeJS.ProcessEnv
    localChunkDelayMs?: number
    profileStore?: AgentCliProfileStore
    spawnProcess?: SpawnProcess
  } = {}) {
    this.env = options.env ?? process.env
    this.localChunkDelayMs = options.localChunkDelayMs
    this.profileStore = options.profileStore
    this.spawnProcess = options.spawnProcess ?? spawn
    this.selectedProfileId = this.initialProfileId()
  }

  listProfiles(): AgentCliProfile[] {
    return this.createProfiles().map((profile) => ({
      ...profile,
      isSelected: profile.id === this.selectedProfileId,
    }))
  }

  selectProfile(profileId: AgentCliProfileId): AgentAdapter {
    const profile = this.findProfile(profileId)
    this.selectedProfileId = profile.id
    this.profileStore?.setSelectedProfileId(profile.id)
    return this.createAdapter(profile)
  }

  createSelectedAdapter(): AgentAdapter {
    return this.createAdapter(this.findProfile(this.selectedProfileId))
  }

  configureCustomProfile(config: AgentCliCustomProfileConfig): AgentCliProfile {
    const normalized = normalizeCustomProfileConfig(config)
    this.customProfileConfigOverride = normalized
    this.profileStore?.setCustomProfileConfig(normalized)
    return this.customProfile(normalized)
  }

  async runMaintenance(
    profileId: AgentCliProfileId,
    action: AgentCliMaintenanceAction,
  ): Promise<AgentCliMaintenanceResult> {
    const profile = this.findProfile(profileId)
    const commandSpec = action === 'version' ? profile.versionCommand : profile.updateCommand
    if (!commandSpec) {
      throw new Error(`${profile.label} does not define a ${action} command`)
    }

    let commandResult
    try {
      commandResult = await runCommand(
        commandSpec.command,
        commandSpec.args,
        this.spawnProcess,
        this.env,
        { timeoutMs: MAINTENANCE_TIMEOUT_MS, maxOutputBytes: MAX_MAINTENANCE_OUTPUT_BYTES },
      )
    } catch (error) {
      if (!isMissingExecutableError(error)) throw error
      return {
        action,
        args: commandSpec.args,
        command: commandSpec.command,
        exitCode: null,
        output: `${profile.label} was not found. Install it or add "${commandSpec.command}" to PATH, then try again.`,
        outputTruncated: false,
        profileId,
        timedOut: false,
        unavailable: true,
      }
    }

    const { exitCode, output, outputTruncated, timedOut } = commandResult

    return {
      action,
      args: commandSpec.args,
      command: commandSpec.command,
      exitCode,
      output,
      outputTruncated,
      profileId,
      timedOut,
      unavailable: false,
    }
  }

  private createAdapter(profile: AgentCliProfile): AgentAdapter {
    if (profile.id === 'local') {
      return new LocalAgentAdapter({ chunkDelayMs: this.localChunkDelayMs, profileId: profile.id })
    }
    if (!profile.adapterCommand) {
      throw new Error(`${profile.label} does not define an adapter command`)
    }

    return new CliAgentAdapter({
      args: profile.adapterArgs,
      command: profile.adapterCommand,
      env: this.env,
      profileId: profile.id,
      spawnProcess: this.spawnProcess,
    })
  }

  private createProfiles(): AgentCliProfile[] {
    const profiles: AgentCliProfile[] = [
      {
        adapterArgs: [],
        id: 'local',
        isSelected: false,
        label: 'Pivot Local Runtime',
      },
      {
        adapterArgs: parseArgs(this.env['PIVOT_CODEX_ARGS_JSON'], ['exec', '{{prompt}}']),
        adapterCommand: this.env['PIVOT_CODEX_COMMAND']?.trim() || 'codex',
        id: 'codex',
        isSelected: false,
        label: 'Codex CLI',
        updateCommand: commandSpec(this.env['PIVOT_CODEX_UPDATE_COMMAND'], this.env['PIVOT_CODEX_UPDATE_ARGS_JSON']),
        versionCommand: commandSpec(
          this.env['PIVOT_CODEX_VERSION_COMMAND'] || this.env['PIVOT_CODEX_COMMAND'] || 'codex',
          this.env['PIVOT_CODEX_VERSION_ARGS_JSON'],
          ['--version'],
        ),
      },
      {
        adapterArgs: parseArgs(this.env['PIVOT_CLAUDE_ARGS_JSON'], ['-p', '{{prompt}}']),
        adapterCommand: this.env['PIVOT_CLAUDE_COMMAND']?.trim() || 'claude',
        id: 'claude',
        isSelected: false,
        label: 'Claude Code',
        updateCommand: commandSpec(this.env['PIVOT_CLAUDE_UPDATE_COMMAND'], this.env['PIVOT_CLAUDE_UPDATE_ARGS_JSON']),
        versionCommand: commandSpec(
          this.env['PIVOT_CLAUDE_VERSION_COMMAND'] || this.env['PIVOT_CLAUDE_COMMAND'] || 'claude',
          this.env['PIVOT_CLAUDE_VERSION_ARGS_JSON'],
          ['--version'],
        ),
      },
      {
        adapterArgs: parseArgs(this.env['PIVOT_AGENT_ARGS_JSON'], []),
        adapterCommand: this.env['PIVOT_AGENT_COMMAND']?.trim(),
        id: 'custom',
        isSelected: false,
        label: 'Custom CLI',
        updateCommand: commandSpec(this.env['PIVOT_AGENT_UPDATE_COMMAND'], this.env['PIVOT_AGENT_UPDATE_ARGS_JSON']),
        versionCommand: commandSpec(this.env['PIVOT_AGENT_VERSION_COMMAND'], this.env['PIVOT_AGENT_VERSION_ARGS_JSON']),
      },
    ]

    return profiles.map((profile) => (profile.id === 'custom' ? this.customProfile(this.customProfileConfig(profile)) : profile))
  }

  private customProfile(config: AgentCliCustomProfileConfig): AgentCliProfile {
    return {
      adapterArgs: config.adapterArgs,
      adapterCommand: config.adapterCommand,
      id: 'custom',
      isSelected: this.selectedProfileId === 'custom',
      label: 'Custom CLI',
      updateCommand: config.updateCommand,
      versionCommand: config.versionCommand,
    }
  }

  private customProfileConfig(fallback: AgentCliProfile): AgentCliCustomProfileConfig {
    return (
      this.customProfileConfigOverride ??
      this.profileStore?.getCustomProfileConfig() ?? {
        adapterArgs: fallback.adapterArgs,
        adapterCommand: fallback.adapterCommand,
        updateCommand: fallback.updateCommand,
        versionCommand: fallback.versionCommand,
      }
    )
  }

  private findProfile(profileId: AgentCliProfileId): AgentCliProfile {
    const profile = this.createProfiles().find((item) => item.id === profileId)
    if (!profile) {
      throw new Error(`Unknown CLI profile: ${profileId}`)
    }
    return { ...profile, isSelected: profile.id === this.selectedProfileId }
  }

  private initialProfileId(): AgentCliProfileId {
    const stored = this.profileStore?.getSelectedProfileId()
    if (stored) {
      return stored
    }

    const configured = this.env['PIVOT_AGENT_PROFILE'] as AgentCliProfileId | undefined
    if (configured === 'local' || configured === 'codex' || configured === 'claude' || configured === 'custom') {
      return configured
    }
    if (this.env['PIVOT_AGENT_COMMAND']?.trim()) {
      return 'custom'
    }
    return 'local'
  }
}

function isMissingExecutableError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function commandSpec(
  command: string | undefined,
  argsInput: string | undefined,
  defaultArgs: string[] = [],
): AgentCliCommandSpec | undefined {
  const trimmed = command?.trim()
  if (!trimmed) {
    return undefined
  }
  return {
    args: parseArgs(argsInput, defaultArgs),
    command: trimmed,
  }
}

function normalizeCustomProfileConfig(config: AgentCliCustomProfileConfig): AgentCliCustomProfileConfig {
  return {
    adapterArgs: normalizeStringArray(config.adapterArgs, 'Custom CLI adapter args'),
    adapterCommand: normalizeOptionalCommand(config.adapterCommand),
    updateCommand: normalizeOptionalCommandSpec(config.updateCommand, 'Custom CLI update command'),
    versionCommand: normalizeOptionalCommandSpec(config.versionCommand, 'Custom CLI version command'),
  }
}

function normalizeOptionalCommandSpec(
  spec: AgentCliCommandSpec | undefined,
  label: string,
): AgentCliCommandSpec | undefined {
  if (!spec) {
    return undefined
  }

  const command = normalizeOptionalCommand(spec.command)
  if (!command) {
    return undefined
  }

  return {
    args: normalizeStringArray(spec.args, `${label} args`),
    command,
  }
}

function normalizeOptionalCommand(command: string | undefined): string | undefined {
  const trimmed = command?.trim()
  return trimmed || undefined
}

function normalizeStringArray(value: string[], label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be a string array`)
  }

  return value
}
