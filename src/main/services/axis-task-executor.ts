import { WorkerResultSchema, type AxisTask, type WorkerResult } from '../../shared/axis-engine-contracts'

export interface AxisTaskExecutorInput {
  mode: 'dry-run'
  runId: string
  sessionId: string
  task: AxisTask
}

/** Execution port. Implementations must declare their authority outside this contract. */
export interface AxisTaskExecutor {
  execute(input: AxisTaskExecutorInput): Promise<WorkerResult>
}

/** Non-mutating evaluator used before any real tool executor is permitted. */
export class AxisDryRunTaskExecutor implements AxisTaskExecutor {
  async execute({ task }: AxisTaskExecutorInput): Promise<WorkerResult> {
    const tools = task.requiredTools.length > 0 ? task.requiredTools.join(', ') : 'none'
    const files = task.assignedFiles.length > 0 ? task.assignedFiles.join(', ') : 'none'
    return WorkerResultSchema.parse({
      artifacts: [],
      findings: [`Would request tools: ${tools}`, `Would own files: ${files}`],
      status: 'completed',
      summary: 'Dry-run validation completed without invoking tools, commands, or file operations.',
      taskId: task.id,
      usage: { costUsd: 0, durationMs: 0, tokens: 0 },
    })
  }
}
