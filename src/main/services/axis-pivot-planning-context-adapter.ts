import { z } from 'zod'
import {
  AxisPlanningContextSchema,
  type AxisPlanningContext,
} from '../../shared/axis-engine-contracts'
import type { AxisProjectBindingReaderPort } from './axis-project-binding-ports'
import type {
  AxisPivotPlanningContextPort,
  AxisPivotProjectFileListPort,
} from './axis-pivot-action-ports'

const ContextRequestSchema = z.object({
  runId: z.string().trim().min(1).max(160),
  sessionId: z.string().trim().min(1).max(160),
}).strict()

const PIVOT_REPLAN_CONSTRAINTS = [
  'Planning only. Do not execute tools or mutate project files.',
  'Preserve the source objective and stay within the authoritative project file scope.',
] as const

export class AxisMainPivotPlanningContextAdapter
implements AxisPivotPlanningContextPort {
  private readonly files: AxisPivotProjectFileListPort
  private readonly projects: AxisProjectBindingReaderPort

  constructor(options: {
    files: AxisPivotProjectFileListPort
    projects: AxisProjectBindingReaderPort
  }) {
    this.files = options.files
    this.projects = options.projects
  }

  async resolve(input: {
    runId: string
    sessionId: string
  }): Promise<AxisPlanningContext> {
    const request = ContextRequestSchema.parse(input)
    const binding = this.projects.findBySession(request.sessionId)
    if (!binding) {
      throw new Error(
        `Axis Pivot Project Binding not found for Session: ${request.sessionId}`,
      )
    }
    const availableFiles = [...new Set(await this.files.list(binding.projectRoot))].sort()
    return AxisPlanningContextSchema.parse({
      availableFiles,
      constraints: [...PIVOT_REPLAN_CONSTRAINTS],
    })
  }
}
