import type {
  ProjectCreationRequest,
  ProjectCreationResult,
} from '../../shared/project-creation'

export interface ProjectCreationCommandPort {
  run(request: {
    args: string[]
    command: string
    cwd: string
    timeoutMs: number
  }): Promise<{
    exitCode: number | null
    stderr: string
    timedOut: boolean
  }>
}

export interface ProjectCreationPort {
  create(request: ProjectCreationRequest): Promise<ProjectCreationResult>
}
