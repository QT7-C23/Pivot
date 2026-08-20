import {
  AxisCheckpointEvaluationSchema,
  AxisPermissionEvaluationSchema,
  AxisReviewEvaluationSchema,
  type AxisCheckpointEvaluation,
  type AxisPermissionEvaluation,
  type AxisReviewEvaluation,
  type AxisTask,
  type WorkerResult,
} from '../../shared/axis-engine-contracts'

export interface AxisQualityEvaluationInput {
  runId: string
  sessionId: string
  task: AxisTask
}

export interface AxisReviewInput extends AxisQualityEvaluationInput {
  attempt: number
  result: WorkerResult
}

export interface AxisExecutionQualityEvaluator {
  evaluateCheckpoint(input: AxisQualityEvaluationInput): Promise<AxisCheckpointEvaluation>
  evaluatePermission(input: AxisQualityEvaluationInput): Promise<AxisPermissionEvaluation>
  review(input: AxisReviewInput): Promise<AxisReviewEvaluation>
}

/** Simulation-only quality policy. It records decisions but grants no runtime authority. */
export class AxisDryRunQualityEvaluator implements AxisExecutionQualityEvaluator {
  async evaluatePermission({ task }: AxisQualityEvaluationInput): Promise<AxisPermissionEvaluation> {
    return AxisPermissionEvaluationSchema.parse({
      authority: 'simulation',
      evidence: ['Dry-run permission evaluation grants no runtime tool authority.'],
      requestedTools: task.requiredTools,
      status: 'allowed',
      taskId: task.id,
    })
  }

  async evaluateCheckpoint({ task }: AxisQualityEvaluationInput): Promise<AxisCheckpointEvaluation> {
    const hasFiles = task.assignedFiles.length > 0
    return AxisCheckpointEvaluationSchema.parse({
      authority: 'simulation',
      checkpointIds: hasFiles ? task.assignedFiles.map((_, index) => `simulated-checkpoint-${index + 1}`) : [],
      evidence: [hasFiles
        ? 'Checkpoint requirements validated without reading or writing project files.'
        : 'No assigned files require a checkpoint.'],
      filePaths: task.assignedFiles,
      status: hasFiles ? 'ready' : 'skipped',
      taskId: task.id,
    })
  }

  async review({ result, task }: AxisReviewInput): Promise<AxisReviewEvaluation> {
    return AxisReviewEvaluationSchema.parse({
      authority: 'simulation',
      gates: [{
        durationMs: 0,
        evidence: ['Dry-run result satisfies the simulation contract.'],
        gate: 'correctness',
        status: result.status === 'completed' ? 'passed' : 'failed',
        taskId: task.id,
      }],
      status: result.status === 'completed' ? 'passed' : 'failed',
      summary: result.status === 'completed' ? 'Simulation Reviewer Gate passed.' : 'Simulation Reviewer Gate rejected the result.',
      taskId: task.id,
    })
  }
}
