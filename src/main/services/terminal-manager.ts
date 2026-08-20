import { randomUUID } from 'node:crypto'
import * as pty from 'node-pty'
import type { IDisposable, IPtyForkOptions, IWindowsPtyForkOptions } from 'node-pty'
import type { SignalMap } from '../../shared/signal-channel'
import type { IPCContract } from '../../shared/types/ipc'
import { assertAbsolutePath } from './file-system'

type TerminalCreateRequest = IPCContract['term:create']['request'] & { ownerId: number }
type TerminalResizeRequest = IPCContract['term:resize']['request']
type TerminalWriteRequest = IPCContract['term:write']['request']
type PtyOptions = IPtyForkOptions | IWindowsPtyForkOptions

export interface PtyProcess {
  kill: () => void
  onData: (listener: (data: string) => void) => IDisposable
  onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => IDisposable
  resize: (cols: number, rows: number) => void
  write: (data: string | Buffer) => void
}

export interface PtyFactory {
  spawn: (file: string, args: string[] | string, options: PtyOptions) => PtyProcess
}

export type MainSignalSender = <K extends keyof SignalMap>(signal: K, payload: SignalMap[K]) => void

interface TerminalRecord {
  disposables: IDisposable[]
  pty: PtyProcess
  ownerId: number
  sessionId: string
  sendSignal: MainSignalSender
}

const DEFAULT_COLS = 100
const DEFAULT_ROWS = 30

function normalizeDimension(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function defaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.ComSpec ?? 'powershell.exe'
  }

  return process.env.SHELL ?? 'bash'
}

export class TerminalManager {
  private readonly ptyFactory: PtyFactory
  private readonly shell: string
  private readonly terminals = new Map<string, TerminalRecord>()

  constructor(options: { ptyFactory?: PtyFactory; shell?: string } = {}) {
    this.ptyFactory = options.ptyFactory ?? pty
    this.shell = options.shell ?? defaultShell()
  }

  create(request: TerminalCreateRequest, sendSignal: MainSignalSender): string {
    const id = randomUUID()
    const cwd = assertAbsolutePath(request.cwd)
    const cols = normalizeDimension(request.cols, DEFAULT_COLS)
    const rows = normalizeDimension(request.rows, DEFAULT_ROWS)
    const terminal = this.ptyFactory.spawn(this.shell, [], {
      cols,
      cwd,
      env: process.env,
      name: 'xterm-color',
      rows,
    })

    const dataDisposable = terminal.onData((data) => {
      sendSignal('term:data', { data, id })
    })
    const exitDisposable = terminal.onExit(({ exitCode, signal }) => {
      sendSignal('term:exit', { exitCode, id, signal })
      this.dispose(id, false)
    })

    this.terminals.set(id, {
      disposables: [dataDisposable, exitDisposable],
      pty: terminal,
      ownerId: request.ownerId,
      sessionId: request.sessionId,
      sendSignal,
    })

    return id
  }

  write({ data, id }: TerminalWriteRequest, ownerId: number): void {
    this.requireTerminal(id, ownerId).write(data)
  }

  resize({ cols, id, rows }: TerminalResizeRequest, ownerId: number): void {
    this.requireTerminal(id, ownerId).resize(
      normalizeDimension(cols, DEFAULT_COLS),
      normalizeDimension(rows, DEFAULT_ROWS),
    )
  }

  destroy(id: string, ownerId: number): void {
    this.requireTerminal(id, ownerId)
    this.dispose(id, true)
  }

  destroyForOwner(ownerId: number): void {
    for (const [id, record] of this.terminals) {
      if (record.ownerId === ownerId) this.dispose(id, true)
    }
  }

  destroyForSession(sessionId: string): void {
    for (const [id, record] of this.terminals) {
      if (record.sessionId === sessionId) this.dispose(id, true)
    }
  }

  destroyAll(): void {
    for (const id of [...this.terminals.keys()]) this.dispose(id, true)
  }

  get size(): number {
    return this.terminals.size
  }

  private requireTerminal(id: string, ownerId: number): PtyProcess {
    const record = this.terminals.get(id)
    if (!record || record.ownerId !== ownerId) {
      throw new Error('Terminal unavailable')
    }

    return record.pty
  }

  private dispose(id: string, killProcess: boolean): void {
    const record = this.terminals.get(id)
    if (!record) {
      return
    }

    this.terminals.delete(id)
    record.disposables.forEach((disposable) => disposable.dispose())
    if (killProcess) {
      record.pty.kill()
    }
  }
}
