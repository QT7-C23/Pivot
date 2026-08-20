import type { CommandRunResult, FileSafeWriteResult } from '../../shared/types/domain'

export interface AgentCommandRunPort {
  run(request: {
    args?: string[]
    command: string
    cwd: string
    timeoutMs?: number
  }): Promise<CommandRunResult>
}

export interface AgentFileMutationPort {
  write(request: {
    content: string
    filePath: string
    projectRoot: string
    sessionId: string
  }): Promise<FileSafeWriteResult>
}
