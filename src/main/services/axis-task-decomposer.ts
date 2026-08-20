import {
  AxisModelUsageSchema,
  AxisPlanningContextSchema,
  ComplexityReportSchema,
  TaskDagProposalSchema,
  TaskDagSchema,
  type AxisModelUsage,
  type AxisPlanningContext,
  type ComplexityReport,
  type TaskDag,
} from '../../shared/axis-engine-contracts'
import { buildDagSchedule } from './axis-dag-scheduler'
import { decideAxisClassification, extractAxisClassificationEvidence } from './axis-classification-policy'
import type { AxisPlanningModel } from './axis-planning-model'

export interface AxisTaskDecomposition {
  classification: ComplexityReport
  dag: TaskDag
  usage: AxisModelUsage
}

export class AxisTaskDecomposer {
  constructor(private readonly model: Pick<AxisPlanningModel, 'decomposeTask'>) {}

  async decompose(
    objectiveInput: string,
    complexityInput: ComplexityReport,
    contextInput: AxisPlanningContext,
  ): Promise<AxisTaskDecomposition> {
    const objective = objectiveInput.trim()
    if (!objective) throw new Error('Axis decomposition requires a non-empty objective')
    const complexity = ComplexityReportSchema.parse(complexityInput)
    const context = AxisPlanningContextSchema.parse(contextInput)
    const generation = await this.model.decomposeTask({ complexity, context, objective })
    const proposal = TaskDagProposalSchema.parse(generation.output)
    if (proposal.objective !== objective) throw new Error('Task DAG objective must match the requested objective')
    if (complexity.route === 'single-agent' && proposal.tasks.length !== 1) {
      throw new Error('Single-agent complexity routes must decompose to exactly one task')
    }
    if (complexity.route === 'multi-agent' && proposal.tasks.length < 2) {
      throw new Error('Multi-agent complexity routes must decompose to at least two tasks')
    }
    const candidateEvidence = extractAxisClassificationEvidence({
      availableFiles: proposal.tasks.flatMap((task) => task.assignedFiles),
      constraints: context.constraints,
    }, 'candidate-files', objective)
    const classification = decideAxisClassification({
      confidence: complexity.confidence,
      reasons: complexity.reasons,
      riskFlags: complexity.riskFlags,
      route: complexity.route,
      score: complexity.score,
      suggestedWorkers: complexity.suggestedWorkers,
    }, candidateEvidence)
    const dag = TaskDagSchema.parse({
      ...proposal,
      tasks: proposal.tasks.map((task) => ({
        ...task,
        requiredGates: classification.requiredGates,
        requiresHumanReview: classification.requiresHumanReview,
      })),
    })
    buildDagSchedule(dag, classification.suggestedWorkers)
    return { classification, dag, usage: AxisModelUsageSchema.parse(generation.usage) }
  }
}
