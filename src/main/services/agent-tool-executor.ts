import type { CommandRunResult, FileSafeWriteResult } from '../../shared/types/domain'
import { readTextFile, resolvePathWithinRoot, searchProjectFiles } from './file-system'
import type { AgentCommandRunPort, AgentFileMutationPort } from './agent-tool-ports'

export interface AgentToolExecutionResult {
  changedFilePath?: string
  fileAction?: 'add' | 'modify'
  text: string
}

export interface AgentToolExecutionRequest {
  input: Record<string, unknown>
  sessionId: string
  toolName: string
}

export interface AgentToolExecutor {
  execute: (request: AgentToolExecutionRequest) => Promise<AgentToolExecutionResult>
}

export class DefaultAgentToolExecutor implements AgentToolExecutor {
  private readonly commandRunner: AgentCommandRunPort
  private readonly fileMutation: AgentFileMutationPort
  private readonly projectRootForSession: (sessionId: string) => string | null

  constructor(options: {
    commandRunner: AgentCommandRunPort
    fileMutation: AgentFileMutationPort
    projectRootForSession: (sessionId: string) => string | null
  }) {
    this.commandRunner = options.commandRunner
    this.fileMutation = options.fileMutation
    this.projectRootForSession = options.projectRootForSession
  }

  async execute({ input, sessionId, toolName }: AgentToolExecutionRequest): Promise<AgentToolExecutionResult> {
    const projectRoot = this.requireProjectRoot(sessionId)
    switch (toolName) {
      case 'fs.readText':
        return this.readText(projectRoot, input)
      case 'fs.search':
        return this.search(projectRoot, input)
      case 'fs.safeWrite':
        return this.safeWrite(sessionId, projectRoot, input)
      case 'term.run':
        return this.runCommand(projectRoot, input)
      default:
        throw new Error(`Unsupported agent tool: ${toolName}`)
    }
  }

  private async safeWrite(
    sessionId: string,
    projectRoot: string,
    input: Record<string, unknown>,
  ): Promise<AgentToolExecutionResult> {
    const filePath = requireString(input, 'filePath')
    const content = requireString(input, 'content')
    const result = await this.fileMutation.write({ content, filePath, projectRoot, sessionId })

    return {
      changedFilePath: result.filePath,
      fileAction: result.checkpoint ? 'modify' : 'add',
      text: formatSafeWriteResult(result),
    }
  }

  private async readText(projectRoot: string, input: Record<string, unknown>): Promise<AgentToolExecutionResult> {
    const filePath = requireString(input, 'filePath')
    const content = await readTextFile(projectRoot, filePath)

    return {
      text: [
        `Tool fs.readText read ${filePath}.`,
        `Content length: ${content.length} characters.`,
        '',
        content,
      ].join('\n'),
    }
  }

  private async search(projectRoot: string, input: Record<string, unknown>): Promise<AgentToolExecutionResult> {
    const rootPath = await resolvePathWithinRoot(projectRoot, requireString(input, 'rootPath'))
    const query = requireString(input, 'query')
    const limit = optionalPositiveInteger(input, 'limit') ?? 20
    const results = await searchProjectFiles(rootPath, query, limit)

    return {
      text: [
        `Tool fs.search found ${results.length} result(s) for "${query}".`,
        ...results.map((result) => `- ${result.relativePath} (${result.path})`),
      ].join('\n'),
    }
  }

  private async runCommand(projectRoot: string, input: Record<string, unknown>): Promise<AgentToolExecutionResult> {
    const command = requireString(input, 'command')
    const cwd = requireString(input, 'cwd')
    const args = optionalStringArray(input, 'args') ?? []
    const timeoutMs = optionalPositiveInteger(input, 'timeoutMs') ?? undefined
    const resolvedCwd = await resolvePathWithinRoot(projectRoot, cwd)
    const result = await this.commandRunner.run({ args, command, cwd: resolvedCwd, timeoutMs })

    return {
      text: formatCommandRunResult(result),
    }
  }

  private requireProjectRoot(sessionId: string): string {
    const projectRoot = this.projectRootForSession(sessionId)
    if (!projectRoot) {
      throw new Error(`Unknown session project root: ${sessionId}`)
    }
    return projectRoot
  }
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected agent tool input "${key}" to be a non-empty string`)
  }

  return value
}

function optionalPositiveInteger(input: Record<string, unknown>, key: string): number | null {
  const value = input[key]
  if (value === undefined) {
    return null
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`Expected agent tool input "${key}" to be a positive integer`)
  }

  return value
}

function optionalStringArray(input: Record<string, unknown>, key: string): string[] | null {
  const value = input[key]
  if (value === undefined) {
    return null
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Expected agent tool input "${key}" to be a string array`)
  }

  return value
}

function formatSafeWriteResult(result: FileSafeWriteResult): string {
  const action = result.checkpoint ? 'modified' : 'created'
  return [
    `Tool fs.safeWrite ${action} ${result.filePath}.`,
    `Size: ${result.sizeBytes} bytes.`,
    `SHA-256: ${result.sha256}.`,
    result.checkpoint ? `Checkpoint: ${result.checkpoint.id}.` : 'Checkpoint: none.',
  ].join('\n')
}

function formatCommandRunResult(result: CommandRunResult): string {
  return [
    `Tool term.run executed ${result.command} ${result.args.join(' ')}`.trim(),
    `CWD: ${result.cwd}`,
    `Exit code: ${result.exitCode === null ? 'null' : result.exitCode}`,
    `Timed out: ${result.timedOut ? 'yes' : 'no'}`,
    result.outputTruncated ? 'Output truncated: yes' : 'Output truncated: no',
    '',
    'STDOUT:',
    result.stdout || '(empty)',
    '',
    'STDERR:',
    result.stderr || '(empty)',
  ].join('\n')
}
