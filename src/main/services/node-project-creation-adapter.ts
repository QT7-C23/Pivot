import { lstat, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  ProjectCreationRequestSchema,
  ProjectCreationResultSchema,
  type ProjectCreationRequest,
  type ProjectCreationResult,
} from '../../shared/project-creation'
import type {
  ProjectCreationCommandPort,
  ProjectCreationPort,
} from './project-creation-port'

const GIT_TIMEOUT_MS = 30_000

export class NodeProjectCreationAdapter implements ProjectCreationPort {
  private readonly commandRunner: ProjectCreationCommandPort

  constructor(options: { commandRunner: ProjectCreationCommandPort }) {
    this.commandRunner = options.commandRunner
  }

  async create(input: ProjectCreationRequest): Promise<ProjectCreationResult> {
    const request = ProjectCreationRequestSchema.parse(input)
    if (!path.isAbsolute(request.parentPath)) {
      throw new Error('Project parent path must be absolute')
    }

    const parentPath = await realpath(request.parentPath)
    const parentStats = await lstat(parentPath)
    if (!parentStats.isDirectory()) throw new Error('Project parent path must be a directory')
    const projectPath = path.join(parentPath, request.projectName)
    if (path.dirname(projectPath) !== parentPath) {
      throw new Error('Project path escaped its selected parent')
    }
    if (await exists(projectPath)) throw new Error('Project directory already exists')

    let createdTarget = false
    try {
      await mkdir(projectPath)
      createdTarget = true
      if (request.description) {
        await writeFile(
          path.join(projectPath, 'README.md'),
          `# ${request.projectName}\n\n${request.description}\n`,
          { encoding: 'utf8', flag: 'wx' },
        )
      }
      if (request.initializeGit) {
        await this.runGit(projectPath, ['init'], 'Git initialization failed')
      }
      if (request.remoteOriginUrl) {
        await this.runGit(
          projectPath,
          ['remote', 'add', 'origin', request.remoteOriginUrl],
          'Git remote configuration failed',
        )
      }
      return ProjectCreationResultSchema.parse({
        initializedGit: request.initializeGit,
        projectPath,
        remoteOriginConfigured: Boolean(request.remoteOriginUrl),
        schemaVersion: 1,
      })
    } catch (error) {
      if (createdTarget) await rm(projectPath, { force: true, recursive: true })
      throw error
    }
  }

  private async runGit(cwd: string, args: string[], failure: string): Promise<void> {
    const result = await this.commandRunner.run({
      args,
      command: 'git',
      cwd,
      timeoutMs: GIT_TIMEOUT_MS,
    })
    if (result.timedOut || result.exitCode !== 0) {
      const detail = result.stderr.trim().slice(0, 240)
      throw new Error(detail ? `${failure}: ${detail}` : failure)
    }
  }
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await lstat(targetPath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
