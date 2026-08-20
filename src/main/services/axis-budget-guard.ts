import {
  BudgetEnvelopeSchema,
  EngineBudgetUsageSchema,
  type BudgetEnvelope,
  type EngineBudgetUsage,
  type EngineStopReason,
} from '../../shared/axis-engine-contracts'

export interface AxisBudgetDecision {
  allowed: boolean
  stopReason: EngineStopReason | null
}

/** Pure hard-stop evaluation. Callers cannot override a failed decision with prompt text. */
export function evaluateAxisBudget(envelopeInput: BudgetEnvelope, usageInput: EngineBudgetUsage): AxisBudgetDecision {
  const envelope = BudgetEnvelopeSchema.parse(envelopeInput)
  const usage = EngineBudgetUsageSchema.parse(usageInput)
  if (usage.tokens > envelope.maxTokens) return stopped('token-limit')
  if (usage.costUsd > envelope.maxCostUsd) return stopped('cost-limit')
  if (usage.durationMs > envelope.maxDurationMs) return stopped('time-limit')
  if (usage.retriesForTask > envelope.maxRetriesPerTask) return stopped('retry-limit')
  if (usage.gateCyclesForFile > envelope.maxGateCyclesPerFile) return stopped('gate-cycle-limit')
  if (usage.pivots > envelope.maxPivots) return stopped('pivot-limit')
  return { allowed: true, stopReason: null }
}

function stopped(stopReason: EngineStopReason): AxisBudgetDecision {
  return { allowed: false, stopReason }
}
