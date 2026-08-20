import type { ProjectHistoryEntry } from '../../shared/types/domain'
import {
  ProjectCreationResultSchema,
  type ProjectCreationRequest,
  type ProjectCreationResult,
} from '../../shared/project-creation'

export const projectService = {
  chooseDirectory(defaultPath?: string): Promise<string | null> {
    return window.pivot.invoke('project:choose-directory', { defaultPath })
  },

  async create(request: ProjectCreationRequest): Promise<ProjectCreationResult> {
    return ProjectCreationResultSchema.parse(await window.pivot.invoke('project:create', request))
  },

  last(): Promise<ProjectHistoryEntry | null> {
    return window.pivot.invoke('project:last', undefined)
  },

  recent(): Promise<ProjectHistoryEntry[]> {
    return window.pivot.invoke('project:recent', undefined)
  },
}
