import {
  AxisModelUsageSchema,
  AxisPlanningContextSchema,
  AxisClassificationProposalSchema,
  type AxisModelUsage,
  type AxisPlanningContext,
  type ComplexityReport,
} from '../../shared/axis-engine-contracts'
import type { AxisPlanningModel } from './axis-planning-model'
import { decideAxisClassification, extractAxisClassificationEvidence } from './axis-classification-policy'

export interface AxisComplexityEvaluation {
  report: ComplexityReport
  usage: AxisModelUsage
}

export class AxisComplexityEvaluator {
  constructor(private readonly model: Pick<AxisPlanningModel, 'assessComplexity'>) {}

  async evaluate(objectiveInput: string, contextInput: AxisPlanningContext): Promise<AxisComplexityEvaluation> {
    const objective = requireObjective(objectiveInput)
    const context = AxisPlanningContextSchema.parse(contextInput)
    const generation = await this.model.assessComplexity({ context, objective })
    return {
      report: decideAxisClassification(
        AxisClassificationProposalSchema.parse(generation.output),
        extractAxisClassificationEvidence(context),
      ),
      usage: AxisModelUsageSchema.parse(generation.usage),
    }
  }
}

function requireObjective(input: string): string {
  const objective = input.trim()
  if (!objective) throw new Error('Axis planning requires a non-empty objective')
  if (objective.length > 8_000) throw new Error('Axis planning objective exceeds 8000 characters')
  return objective
}
