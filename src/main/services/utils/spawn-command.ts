import { spawn } from 'node:child_process'
import type { SpawnOptionsWithoutStdio, ChildProcessWithoutNullStreams } from 'node:child_process'
import { appendCapped } from './buffer-capped'

export type SpawnProcess = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams

export interface SpawnResult {
  exitCode: number | null
  output: string
  outputTruncated: boolean
  timedOut: boolean
}

const KILL_GRACE_MS = 1_000

export function runCommand(
  command: string,
  args: string[],
  spawnProcess: SpawnProcess,
  env: NodeJS.ProcessEnv,
  options: { timeoutMs?: number; maxOutputBytes?: number } = {},
): Promise<SpawnResult> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const maxOutputBytes = options.maxOutputBytes ?? 64 * 1024

  return new Promise<SpawnResult>((resolve, reject) => {
    const child = spawnProcess(command, args, {
      env,
      shell: false,
      stdio: 'pipe',
      windowsHide: true,
    })
    let exitCode: number | null = null
    let output = ''
    let outputTruncated = false
    let timedOut = false
    let settled = false
    let forceTimeout: ReturnType<typeof setTimeout> | undefined

    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (forceTimeout) clearTimeout(forceTimeout)
      resolve({ exitCode, output, outputTruncated, timedOut })
    }

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
      forceTimeout = setTimeout(() => {
        child.kill('SIGKILL')
        finish()
      }, KILL_GRACE_MS)
    }, timeoutMs)

    const capture = (chunk: unknown): void => {
      const next = appendCapped(output, String(chunk), maxOutputBytes)
      output = next.value
      outputTruncated ||= next.truncated
    }

    child.stdout?.on('data', capture)
    child.stderr?.on('data', capture)
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
