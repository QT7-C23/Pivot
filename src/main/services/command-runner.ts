import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process'
import type { CommandRunResult } from '../../shared/types/domain'
import { appendCapped } from './utils/buffer-capped'
import { assertAbsolutePath } from './file-system'

interface CommandRunRequest {
  args?: string[]
  command: string
  cwd: string
  timeoutMs?: number
}
type SpawnProcess = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000
const MAX_OUTPUT_BYTES = 64 * 1024
const KILL_GRACE_MS = 1_000
const ALLOWED_ENVIRONMENT_KEYS = [
  'APPDATA', 'COMSPEC', 'ComSpec', 'FORCE_COLOR', 'HOME', 'LANG', 'LC_ALL',
  'LOCALAPPDATA', 'NO_COLOR', 'PATH', 'PATHEXT', 'Path', 'SystemRoot', 'SYSTEMROOT',
  'TEMP', 'TERM', 'TMP', 'TMPDIR', 'USERPROFILE', 'WINDIR',
] as const

export class CommandRunner {
  private readonly spawnProcess: SpawnProcess
  private readonly environment: NodeJS.ProcessEnv

  constructor(options: { environment?: NodeJS.ProcessEnv; spawnProcess?: SpawnProcess } = {}) {
    this.spawnProcess = options.spawnProcess ?? spawn
    this.environment = buildCommandEnvironment(options.environment ?? process.env)
  }

  async run(request: CommandRunRequest): Promise<CommandRunResult> {
    const command = normalizeCommand(request.command)
    const args = normalizeArgs(request.args)
    const cwd = await normalizeCwd(request.cwd)
    const timeoutMs = normalizeTimeout(request.timeoutMs)
    const startedAt = new Date().toISOString()

    return new Promise<CommandRunResult>((resolve, reject) => {
      let settled = false
      let forceTimeout: ReturnType<typeof setTimeout> | undefined
      let exitCode: number | null = null
      let outputTruncated = false
      let stderr = ''
      let stdout = ''
      let timedOut = false

      const child = this.spawnProcess(command, args, {
        cwd,
        env: this.environment,
        shell: false,
        windowsHide: true,
      })

      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (forceTimeout) clearTimeout(forceTimeout)
        resolve({
          args,
          command,
          cwd,
          exitCode,
          finishedAt: new Date().toISOString(),
          outputTruncated,
          stderr,
          stdout,
          timedOut,
          timeoutMs,
          startedAt,
        })
      }
      const timeout = setTimeout(() => {
        timedOut = true
        child.kill()
        forceTimeout = setTimeout(() => {
          child.kill('SIGKILL')
          finish()
        }, KILL_GRACE_MS)
      }, timeoutMs)

      child.stdout.on('data', (chunk: Buffer | string) => {
        const next = appendCapped(stdout, chunk.toString(), MAX_OUTPUT_BYTES)
        stdout = next.value
        outputTruncated ||= next.truncated
      })
      child.stderr.on('data', (chunk: Buffer | string) => {
        const next = appendCapped(stderr, chunk.toString(), MAX_OUTPUT_BYTES)
        stderr = next.value
        outputTruncated ||= next.truncated
      })
      child.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (forceTimeout) clearTimeout(forceTimeout)
        reject(error)
      })
      child.on('close', (code) => {
        exitCode = code
        finish()
      })
    })
  }
}

export function buildCommandEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const key of ALLOWED_ENVIRONMENT_KEYS) {
    const value = source[key]
    if (value !== undefined) environment[key] = value
  }
  return environment
}

async function normalizeCwd(input: string): Promise<string> {
  const cwd = assertAbsolutePath(input)
  const cwdStats = await stat(cwd)
  if (!cwdStats.isDirectory()) {
    throw new Error('Command cwd must be a directory')
  }

  return cwd
}

function normalizeArgs(args: string[] | undefined): string[] {
  if (!args) {
    return []
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new Error('Command args must be a string array')
  }

  return args
}

function normalizeCommand(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) {
    throw new Error('Command must be a non-empty string')
  }
  if (/[\\/]/.test(trimmed)) {
    throw new Error('Command must be an executable name, not a path')
  }

  return trimmed
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) {
    return DEFAULT_TIMEOUT_MS
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`Command timeout must be between 1 and ${MAX_TIMEOUT_MS} ms`)
  }

  return timeoutMs
}
