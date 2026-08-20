import {
  AxisModelUsageSchema,
  AxisPivotTriggerSchema,
  BudgetEnvelopeSchema,
  EngineBudgetUsageSchema,
  PivotDecisionSchema,
  type AxisModelUsage,
  type AxisPivotAction,
  type AxisPivotTrigger,
  type AxisRemainingBudget,
  type BudgetEnvelope,
  type EngineBudgetUsage,
  type EngineStopReason,
  type PivotDecision,
} from '../../shared/axis-engine-contracts'
import { evaluateAxisBudget } from './axis-budget-guard'

const ACTIONS_BY_TRIGGER: Record<AxisPivotTrigger['category'], AxisPivotAction[]> = {
  design: ['replan', 'escalate', 'stop'],
  direction: ['retry', 'replan', 'stop'],
  excessive: ['discard', 'replan', 'escalate', 'stop'],
  minor: ['self-repair', 'retry', 'stop'],
  security: ['dedicated-fixer', 'escalate', 'stop'],
}

export function allowedAxisPivotActions(triggerInput: AxisPivotTrigger): AxisPivotAction[] {
  const trigger = AxisPivotTriggerSchema.parse(triggerInput)
  return [...ACTIONS_BY_TRIGGER[trigger.category]]
}

export function axisRemainingBudget(
  budgetInput: BudgetEnvelope,
  usageInput: EngineBudgetUsage,
): AxisRemainingBudget {
  const budget = BudgetEnvelopeSchema.parse(budgetInput)
  const usage = EngineBudgetUsageSchema.parse(usageInput)
  return {
    costUsd: Math.max(0, budget.maxCostUsd - usage.costUsd),
    durationMs: Math.max(0, budget.maxDurationMs - usage.durationMs),
    gateCyclesForFile: Math.max(0, budget.maxGateCyclesPerFile - usage.gateCyclesForFile),
    pivots: Math.max(0, budget.maxPivots - usage.pivots),
    retriesForTask: Math.max(0, budget.maxRetriesPerTask - usage.retriesForTask),
    tokens: Math.max(0, budget.maxTokens - usage.tokens),
  }
}

export function preflightAxisPivotStop(
  budgetInput: BudgetEnvelope,
  usageInput: EngineBudgetUsage,
): EngineStopReason | null {
  const budget = BudgetEnvelopeSchema.parse(budgetInput)
  const usage = EngineBudgetUsageSchema.parse(usageInput)
  const existingStop = evaluateAxisBudget(budget, usage)
  if (!existingStop.allowed) return existingStop.stopReason
  if (usage.tokens >= budget.maxTokens) return 'token-limit'
  if (usage.costUsd >= budget.maxCostUsd) return 'cost-limit'
  if (usage.durationMs >= budget.maxDurationMs) return 'time-limit'
  if (usage.pivots >= budget.maxPivots) return 'pivot-limit'
  return null
}

export function projectedAxisPivotStop(
  budgetInput: BudgetEnvelope,
  usageInput: EngineBudgetUsage,
  modelUsageInput: AxisModelUsage,
  decisionDurationMs: number,
  decisionInput: PivotDecision,
): EngineStopReason | null {
  const budget = BudgetEnvelopeSchema.parse(budgetInput)
  const usage = EngineBudgetUsageSchema.parse(usageInput)
  const modelUsage = AxisModelUsageSchema.parse(modelUsageInput)
  const decision = PivotDecisionSchema.parse(decisionInput)
  const projected = EngineBudgetUsageSchema.parse({
    ...usage,
    costUsd: usage.costUsd + modelUsage.costUsd,
    durationMs: usage.durationMs + requireDuration(decisionDurationMs),
    pivots: usage.pivots + (decision.action === 'stop' ? 0 : 1),
    tokens: usage.tokens + modelUsage.tokens,
  })
  return evaluateAxisBudget(budget, projected).stopReason
}

export function validateAxisPivotProposal(
  proposalInput: PivotDecision,
  triggerInput: AxisPivotTrigger,
  allowedActions: AxisPivotAction[],
): PivotDecision {
  const proposal = PivotDecisionSchema.parse(proposalInput)
  const trigger = AxisPivotTriggerSchema.parse(triggerInput)
  if (proposal.taskId !== trigger.taskId) throw new Error('Axis Pivot proposal task does not match its trigger')
  if (!allowedActions.includes(proposal.action)) {
    throw new Error(`Axis Pivot proposal is not an allowed action for ${trigger.category}: ${proposal.action}`)
  }
  return proposal
}

function requireDuration(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new Error('Axis Pivot decision duration must be a non-negative integer')
  return value
}
