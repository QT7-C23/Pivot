import {
  AxisRunStateSchema,
  AxisModelUsageSchema,
  AxisCheckpointEvaluationSchema,
  AxisPermissionEvaluationSchema,
  AxisReviewEvaluationSchema,
  AxisShadowRunResultSchema,
  BudgetEnvelopeSchema,
  PivotDecisionSchema,
  WorkerResultSchema,
  type AxisRunState,
  type AxisModelUsage,
  type AxisCheckpointEvaluation,
  type AxisPermissionEvaluation,
  type AxisReviewEvaluation,
  type AxisShadowRunResult,
  type BudgetEnvelope,
  type EngineStopReason,
  type PivotDecision,
  type WorkerResult,
} from './axis-engine-contracts'

export type AxisRunTransition = 'cancel' | 'restart'

export function startAxisDryRun(stateInput: AxisRunState, approvedTaskIds: string[], timestamp: string): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const now = requireTimestamp(timestamp)
  if (state.status !== 'planned') throw new Error(`Axis dry run requires a planned state, received ${state.status}`)
  const expected = state.tasks.map((task) => task.taskId).sort()
  const approved = [...new Set(approvedTaskIds)].sort()
  if (approved.length !== approvedTaskIds.length || JSON.stringify(approved) !== JSON.stringify(expected)) {
    throw new Error('Dry-run approval must exactly match all planned task identifiers')
  }
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, lifecycle(state, now, 'dry-run-started', null, `Approved ${approved.length} tasks`)],
    revision: state.revision + 1,
    status: 'running',
    updatedAt: now,
  })
}

export function startAxisTask(stateInput: AxisRunState, taskId: string, timestamp: string): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const now = requireTimestamp(timestamp)
  if (state.status !== 'running') throw new Error(`Axis task start requires a running run, received ${state.status}`)
  const task = state.tasks.find((candidate) => candidate.taskId === taskId)
  if (!task) throw new Error(`Axis task state not found: ${taskId}`)
  if (task.status !== 'pending') throw new Error(`Axis task ${taskId} must be pending before start`)
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, lifecycle(state, now, 'task-started', taskId)],
    revision: state.revision + 1,
    tasks: state.tasks.map((candidate) => candidate.taskId === taskId
      ? { ...candidate, attempts: candidate.attempts + 1, status: 'running' as const, updatedAt: now }
      : candidate),
    updatedAt: now,
  })
}

export function startAxisGuardedTask(
  stateInput: AxisRunState,
  taskId: string,
  dependencyTaskIds: string[],
  timestamp: string,
): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const now = requireTimestamp(timestamp)
  if (state.status !== 'planned' && state.status !== 'running') {
    throw new Error(
      `Axis guarded task start requires a planned or running run, received ${state.status}`,
    )
  }
  const task = state.tasks.find((candidate) => candidate.taskId === taskId)
  if (!task) throw new Error(`Axis task state not found: ${taskId}`)
  if (task.status !== 'pending') {
    throw new Error(`Axis guarded task ${taskId} must be pending before start`)
  }
  if (state.tasks.some((candidate) => candidate.status === 'running')) {
    throw new Error('Another Axis task is already running')
  }
  const dependencies = [...new Set(dependencyTaskIds)]
  if (
    dependencies.length !== dependencyTaskIds.length
    || dependencies.includes(taskId)
    || dependencies.some((dependencyId) => (
      state.tasks.find((candidate) => candidate.taskId === dependencyId)?.status
      !== 'completed'
    ))
  ) {
    throw new Error(`Axis guarded task ${taskId} dependencies are not completed`)
  }

  const guardedStartEvent = state.status === 'planned'
    ? [{
        detail: 'Explicit guarded execution approval claimed',
        revision: state.revision + 1,
        taskId,
        timestamp: now,
        type: 'guarded-execution-started' as const,
      }]
    : []
  const taskStartRevision = state.revision + guardedStartEvent.length + 1
  return AxisRunStateSchema.parse({
    ...state,
    events: [
      ...state.events,
      ...guardedStartEvent,
      {
        detail: '',
        revision: taskStartRevision,
        taskId,
        timestamp: now,
        type: 'task-started' as const,
      },
    ],
    revision: taskStartRevision,
    status: 'running',
    tasks: state.tasks.map((candidate) => candidate.taskId === taskId
      ? {
          ...candidate,
          attempts: candidate.attempts + 1,
          status: 'running' as const,
          updatedAt: now,
        }
      : candidate),
    updatedAt: now,
  })
}

export function recordAxisPermissionEvaluation(
  stateInput: AxisRunState,
  evaluationInput: AxisPermissionEvaluation,
  timestamp: string,
): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const evaluation = AxisPermissionEvaluationSchema.parse(evaluationInput)
  const now = requireTimestamp(timestamp)
  const task = requirePendingTask(state, evaluation.taskId, 'permission evaluation')
  const denied = evaluation.status === 'denied'
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, lifecycle(state, now, denied ? 'permission-denied' : 'permission-allowed', task.taskId, evaluation.evidence.join('; '))],
    revision: state.revision + 1,
    status: denied ? 'failed' : state.status,
    tasks: denied ? failTask(state, task.taskId, evaluation.evidence.join('; '), now) : state.tasks,
    updatedAt: now,
  })
}

export function recordAxisCheckpointEvaluation(
  stateInput: AxisRunState,
  evaluationInput: AxisCheckpointEvaluation,
  timestamp: string,
): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const evaluation = AxisCheckpointEvaluationSchema.parse(evaluationInput)
  const now = requireTimestamp(timestamp)
  const task = requirePendingTask(state, evaluation.taskId, 'checkpoint evaluation')
  const failed = evaluation.status === 'failed'
  const eventType = failed ? 'checkpoint-failed' : evaluation.status === 'ready' ? 'checkpoint-ready' : 'checkpoint-skipped'
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, lifecycle(state, now, eventType, task.taskId, evaluation.evidence.join('; '))],
    revision: state.revision + 1,
    status: failed ? 'failed' : state.status,
    tasks: failed ? failTask(state, task.taskId, evaluation.evidence.join('; '), now) : state.tasks,
    updatedAt: now,
  })
}

export function recordAxisReviewEvaluation(
  stateInput: AxisRunState,
  evaluationInput: AxisReviewEvaluation,
  timestamp: string,
): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const evaluation = AxisReviewEvaluationSchema.parse(evaluationInput)
  const now = requireTimestamp(timestamp)
  if (state.status !== 'running') throw new Error(`Axis review requires a running run, received ${state.status}`)
  const task = state.tasks.find((candidate) => candidate.taskId === evaluation.taskId)
  if (!task || task.status !== 'completed') throw new Error(`Axis task ${evaluation.taskId} must be completed before review`)
  const gateCyclesForFile = state.usage.gateCyclesForFile + 1
  if (evaluation.status === 'passed') {
    return AxisRunStateSchema.parse({
      ...state,
      events: [...state.events, lifecycle(state, now, 'review-passed', task.taskId, evaluation.summary)],
      revision: state.revision + 1,
      updatedAt: now,
      usage: { ...state.usage, gateCyclesForFile },
    })
  }
  const gateLimitReached = gateCyclesForFile >= state.budget.maxGateCyclesPerFile
  const retryAllowed = task.attempts <= state.budget.maxRetriesPerTask && !gateLimitReached
  if (!retryAllowed) {
    const reason = gateLimitReached ? 'gate-cycle-limit' : 'retry-limit'
    return AxisRunStateSchema.parse({
      ...state,
      events: [...state.events, lifecycle(state, now, 'review-failed', task.taskId, `${evaluation.summary}; ${reason}`)],
      revision: state.revision + 1,
      status: 'failed',
      tasks: failTask(state, task.taskId, `${evaluation.summary}; ${reason}`, now),
      updatedAt: now,
      usage: { ...state.usage, gateCyclesForFile },
    })
  }
  const failedEvent = lifecycle(state, now, 'review-failed', task.taskId, evaluation.summary)
  const retryEvent = { detail: `Retry ${task.attempts} of ${state.budget.maxRetriesPerTask}`, revision: state.revision + 2, taskId: task.taskId, timestamp: now, type: 'retry-scheduled' as const }
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, failedEvent, retryEvent],
    revision: state.revision + 2,
    tasks: state.tasks.map((candidate) => candidate.taskId === task.taskId
      ? { ...candidate, error: null, status: 'pending' as const, updatedAt: now }
      : candidate),
    updatedAt: now,
    usage: { ...state.usage, gateCyclesForFile, retriesForTask: state.usage.retriesForTask + 1 },
  })
}

export function completeAxisTask(stateInput: AxisRunState, resultInput: WorkerResult, timestamp: string): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const result = WorkerResultSchema.parse(resultInput)
  const now = requireTimestamp(timestamp)
  if (state.status !== 'running') throw new Error(`Axis task completion requires a running run, received ${state.status}`)
  const task = state.tasks.find((candidate) => candidate.taskId === result.taskId)
  if (!task || task.status !== 'running') throw new Error(`Axis task ${result.taskId} must be running before completion`)
  const eventType = result.status === 'completed' ? 'task-completed' : result.status === 'failed' ? 'task-failed' : 'task-cancelled'
  const runStatus = result.status === 'failed' ? 'failed' : result.status === 'cancelled' ? 'cancelled' : 'running'
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, lifecycle(state, now, eventType, result.taskId, result.summary)],
    revision: state.revision + 1,
    status: runStatus,
    tasks: state.tasks.map((candidate) => candidate.taskId === result.taskId
      ? {
        ...candidate,
        error: result.status === 'failed' ? result.summary || 'Dry-run task failed' : null,
        status: result.status,
        updatedAt: now,
        usage: addMeasuredUsage(candidate.usage, result.usage),
      }
      : candidate),
    updatedAt: now,
    usage: addMeasuredUsage(state.usage, result.usage),
  })
}

export function completeAxisGuardedTask(
  stateInput: AxisRunState,
  resultInput: WorkerResult,
  timestamp: string,
): AxisRunState {
  const next = completeAxisTask(stateInput, resultInput, timestamp)
  if (
    resultInput.status !== 'completed'
    || next.tasks.some((task) => task.status !== 'completed')
  ) {
    return next
  }
  return AxisRunStateSchema.parse({
    ...next,
    events: [
      ...next.events,
      lifecycle(next, next.updatedAt, 'completed', null, 'Guarded execution completed'),
    ],
    revision: next.revision + 1,
    status: 'completed',
  })
}

export function pauseAxisRunState(stateInput: AxisRunState, stopReason: EngineStopReason, timestamp: string): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const now = requireTimestamp(timestamp)
  if (state.status !== 'running') throw new Error(`Axis pause requires a running state, received ${state.status}`)
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, lifecycle(state, now, 'paused', null, stopReason)],
    revision: state.revision + 1,
    status: 'paused',
    updatedAt: now,
  })
}

export function recordAxisPivotDecision(
  stateInput: AxisRunState,
  decisionId: string,
  decisionInput: PivotDecision,
  modelUsageInput: AxisModelUsage,
  decisionDurationMs: number,
  timestamp: string,
): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const decision = PivotDecisionSchema.parse(decisionInput)
  const modelUsage = AxisModelUsageSchema.parse(modelUsageInput)
  const now = requireTimestamp(timestamp)
  if (state.status !== 'failed' && state.status !== 'paused') {
    throw new Error(`Axis Pivot decision requires a failed or paused run, received ${state.status}`)
  }
  if (!decisionId.trim()) throw new Error('Axis Pivot decision identifier is required')
  if (!Number.isInteger(decisionDurationMs) || decisionDurationMs < 0) {
    throw new Error('Axis Pivot decision duration must be a non-negative integer')
  }
  if (decision.taskId && !state.tasks.some((task) => task.taskId === decision.taskId)) {
    throw new Error(`Axis Pivot decision task not found: ${decision.taskId}`)
  }
  const consumesPivot = decision.action !== 'stop'
  if (consumesPivot && state.usage.pivots >= state.budget.maxPivots) {
    throw new Error('Axis Pivot limit is exhausted')
  }
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, {
      detail: `${decision.action}: ${decision.reason}`.slice(0, 4_000),
      pivotDecisionId: decisionId.trim(),
      revision: state.revision + 1,
      taskId: decision.taskId,
      timestamp: now,
      type: 'pivot-decided' as const,
    }],
    revision: state.revision + 1,
    updatedAt: now,
    usage: {
      ...state.usage,
      costUsd: state.usage.costUsd + modelUsage.costUsd,
      durationMs: state.usage.durationMs + decisionDurationMs,
      pivots: state.usage.pivots + (consumesPivot ? 1 : 0),
      tokens: state.usage.tokens + modelUsage.tokens,
    },
  })
}

export function scheduleAxisPivotTaskRetry(
  stateInput: AxisRunState,
  decisionIdInput: string,
  taskId: string,
  timestamp: string,
): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const decisionId = decisionIdInput.trim()
  const now = requireTimestamp(timestamp)
  if (state.status !== 'failed') {
    throw new Error(`Axis Pivot retry requires a failed Run, received ${state.status}`)
  }
  if (!decisionId) throw new Error('Axis Pivot retry decision identifier is required')
  const decisionEvent = state.events.at(-1)
  if (
    decisionEvent?.type !== 'pivot-decided'
    || decisionEvent.pivotDecisionId !== decisionId
    || decisionEvent.taskId !== taskId
  ) {
    throw new Error('Axis Pivot retry must match the latest decision event')
  }
  const task = state.tasks.find((candidate) => candidate.taskId === taskId)
  if (!task || task.status !== 'failed') {
    throw new Error(`Axis Pivot retry requires a failed task: ${taskId}`)
  }
  if (state.tasks.some((candidate) => candidate.status === 'running')) {
    throw new Error('Axis Pivot retry cannot schedule while another task is running')
  }
  if (
    state.usage.retriesForTask >= state.budget.maxRetriesPerTask
    || task.attempts >= state.budget.maxRetriesPerTask + 1
  ) {
    throw new Error('Axis Pivot retry limit is exhausted')
  }
  if (
    state.usage.tokens >= state.budget.maxTokens
    || state.usage.costUsd >= state.budget.maxCostUsd
    || state.usage.durationMs >= state.budget.maxDurationMs
    || state.usage.gateCyclesForFile >= state.budget.maxGateCyclesPerFile
  ) {
    throw new Error('Axis Pivot retry cannot continue with an exhausted budget')
  }
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, {
      detail: 'Retry scheduled by Dynamic Pivot',
      pivotDecisionId: decisionId,
      revision: state.revision + 1,
      taskId,
      timestamp: now,
      type: 'pivot-retry-scheduled' as const,
    }],
    revision: state.revision + 1,
    status: 'running',
    tasks: state.tasks.map((candidate) => candidate.taskId === taskId
      ? { ...candidate, error: null, status: 'pending' as const, updatedAt: now }
      : candidate),
    updatedAt: now,
    usage: {
      ...state.usage,
      retriesForTask: state.usage.retriesForTask + 1,
    },
  })
}

export function scheduleAxisPivotAssignedTask(
  stateInput: AxisRunState,
  decisionIdInput: string,
  taskId: string,
  action: 'self-repair' | 'dedicated-fixer',
  timestamp: string,
): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const decisionId = decisionIdInput.trim()
  const now = requireTimestamp(timestamp)
  if (state.status !== 'failed') {
    throw new Error(
      `Axis Pivot ${action} scheduling requires a failed Run, received ${state.status}`,
    )
  }
  if (!decisionId) {
    throw new Error(`Axis Pivot ${action} decision identifier is required`)
  }
  const decisionEvent = state.events.at(-1)
  if (
    decisionEvent?.type !== 'pivot-decided'
    || decisionEvent.pivotDecisionId !== decisionId
    || decisionEvent.taskId !== taskId
  ) {
    throw new Error(`Axis Pivot ${action} scheduling must match the latest decision event`)
  }
  const task = state.tasks.find((candidate) => candidate.taskId === taskId)
  if (!task || task.status !== 'failed') {
    throw new Error(`Axis Pivot ${action} scheduling requires a failed task: ${taskId}`)
  }
  if (state.tasks.some((candidate) => candidate.status === 'running')) {
    throw new Error(`Axis Pivot ${action} cannot schedule while another task is running`)
  }
  if (
    action === 'self-repair'
    && (
      state.usage.retriesForTask >= state.budget.maxRetriesPerTask
      || task.attempts >= state.budget.maxRetriesPerTask + 1
    )
  ) {
    throw new Error('Axis Pivot self-repair retry limit is exhausted')
  }
  if (
    state.usage.tokens >= state.budget.maxTokens
    || state.usage.costUsd >= state.budget.maxCostUsd
    || state.usage.durationMs >= state.budget.maxDurationMs
    || state.usage.gateCyclesForFile >= state.budget.maxGateCyclesPerFile
  ) {
    throw new Error(`Axis Pivot ${action} cannot continue with an exhausted budget`)
  }
  const eventType = action === 'self-repair'
    ? 'pivot-self-repair-scheduled' as const
    : 'pivot-dedicated-fixer-scheduled' as const
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, {
      detail: action === 'self-repair'
        ? 'Self-repair scheduled by Dynamic Pivot'
        : 'Dedicated Fixer scheduled by Dynamic Pivot',
      pivotDecisionId: decisionId,
      revision: state.revision + 1,
      taskId,
      timestamp: now,
      type: eventType,
    }],
    revision: state.revision + 1,
    status: 'running',
    tasks: state.tasks.map((candidate) => candidate.taskId === taskId
      ? { ...candidate, error: null, status: 'pending' as const, updatedAt: now }
      : candidate),
    updatedAt: now,
    usage: {
      ...state.usage,
      retriesForTask: state.usage.retriesForTask
        + (action === 'self-repair' ? 1 : 0),
    },
  })
}

export function stopAxisPivotRun(
  stateInput: AxisRunState,
  decisionId: string,
  taskId: string | null,
  reason: string,
  timestamp: string,
): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const decision = PivotDecisionSchema.parse({
    action: 'stop',
    reason,
    taskId,
  })
  const now = requireTimestamp(timestamp)
  if (state.status !== 'failed' && state.status !== 'paused') {
    throw new Error(
      `Axis Pivot stop requires a failed or paused Run, received ${state.status}`,
    )
  }
  const latest = state.events.at(-1)
  if (
    latest?.type !== 'pivot-decided'
    || latest.pivotDecisionId !== decisionId.trim()
    || latest.taskId !== decision.taskId
  ) {
    throw new Error(
      'Axis Pivot stop is not bound to the latest committed decision',
    )
  }
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, {
      detail: decision.reason,
      pivotDecisionId: decisionId.trim(),
      revision: state.revision + 1,
      taskId: decision.taskId,
      timestamp: now,
      type: 'pivot-stopped' as const,
    }],
    revision: state.revision + 1,
    status: 'stopped',
    tasks: state.tasks.map((task) => (
      task.status === 'pending' || task.status === 'running'
        ? { ...task, status: 'cancelled' as const, updatedAt: now }
        : task
    )),
    updatedAt: now,
  })
}

export function recordAxisSafeWriteProposalUsage(
  stateInput: AxisRunState,
  taskId: string,
  modelUsageInput: AxisModelUsage,
  durationMs: number,
  timestamp: string,
): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const modelUsage = AxisModelUsageSchema.parse(modelUsageInput)
  const now = requireTimestamp(timestamp)
  if (state.status !== 'planned' && state.status !== 'running') {
    throw new Error(
      `Axis safe-write proposal requires a planned or running run, received ${state.status}`,
    )
  }
  const task = state.tasks.find((candidate) => candidate.taskId === taskId)
  if (!task || task.status !== 'pending') {
    throw new Error(`Axis safe-write proposal requires a pending task: ${taskId}`)
  }
  if (!Number.isInteger(durationMs) || durationMs < 0) {
    throw new Error('Axis safe-write proposal duration must be a non-negative integer')
  }
  const measured = {
    costUsd: modelUsage.costUsd,
    durationMs,
    tokens: modelUsage.tokens,
  }
  const nextUsage = addMeasuredUsage(state.usage, measured)
  const stopReason = budgetStopReason(state.budget, nextUsage)
  const error = stopReason
    ? `Axis safe-write proposal exceeded ${stopReason}`
    : null
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, {
      detail: stopReason ?? `Accounted ${modelUsage.tokens} proposal tokens`,
      revision: state.revision + 1,
      taskId,
      timestamp: now,
      type: stopReason
        ? 'safe-write-proposal-stopped' as const
        : 'safe-write-proposal-usage-recorded' as const,
    }],
    revision: state.revision + 1,
    status: stopReason ? 'failed' : state.status,
    tasks: state.tasks.map((candidate) => candidate.taskId === taskId
      ? {
          ...candidate,
          error,
          status: stopReason ? 'failed' as const : candidate.status,
          updatedAt: now,
          usage: addMeasuredUsage(candidate.usage, measured),
        }
      : candidate),
    updatedAt: now,
    usage: nextUsage,
  })
}

export function completeAxisDryRun(stateInput: AxisRunState, timestamp: string): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const now = requireTimestamp(timestamp)
  if (state.status !== 'running' || state.tasks.some((task) => task.status !== 'completed')) {
    throw new Error('Axis dry run can complete only after every task has completed')
  }
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, lifecycle(state, now, 'completed', null, 'Dry run completed')],
    revision: state.revision + 1,
    status: 'completed',
    updatedAt: now,
  })
}

export function createAxisRunState(
  resultInput: AxisShadowRunResult,
  budgetInput: BudgetEnvelope,
  timestamp: string,
): AxisRunState {
  const result = AxisShadowRunResultSchema.parse(resultInput)
  const budget = BudgetEnvelopeSchema.parse(budgetInput)
  const now = requireTimestamp(timestamp)
  return AxisRunStateSchema.parse({
    budget,
    createdAt: now,
    events: [{ revision: 1, timestamp: now, type: 'initialized' }],
    objective: result.objective,
    restartCount: 0,
    revision: 1,
    runId: result.trace.runId,
    sessionId: result.trace.sessionId,
    status: result.status === 'planned' ? 'planned' : 'stopped',
    tasks: result.status === 'planned'
      ? result.dag!.tasks.map((task) => ({
        attempts: 0,
        error: null,
        status: 'pending' as const,
        taskId: task.id,
        updatedAt: now,
        usage: emptyUsage(),
      }))
      : [],
    updatedAt: now,
    usage: result.usage,
  })
}

export function transitionAxisRunState(
  stateInput: AxisRunState,
  transition: AxisRunTransition,
  timestamp: string,
): AxisRunState {
  const state = AxisRunStateSchema.parse(stateInput)
  const now = requireTimestamp(timestamp)
  if (transition === 'cancel') {
    if (!['planned', 'running', 'paused'].includes(state.status)) {
      throw new Error(`Axis run cannot be cancelled from ${state.status}`)
    }
    return AxisRunStateSchema.parse({
      ...state,
      events: [...state.events, { revision: state.revision + 1, timestamp: now, type: 'cancelled' as const }],
      revision: state.revision + 1,
      status: 'cancelled',
      tasks: state.tasks.map((task) => task.status === 'completed' || task.status === 'failed'
        ? task
        : { ...task, status: 'cancelled' as const, updatedAt: now }),
      updatedAt: now,
    })
  }
  if (state.status !== 'cancelled' && state.status !== 'failed') {
    throw new Error(`Axis run restart requires a cancelled or failed state, received ${state.status}`)
  }
  return AxisRunStateSchema.parse({
    ...state,
    events: [...state.events, { revision: state.revision + 1, timestamp: now, type: 'restarted' as const }],
    restartCount: state.restartCount + 1,
    revision: state.revision + 1,
    status: 'planned',
    tasks: state.tasks.map((task) => ({ ...task, error: null, status: 'pending' as const, updatedAt: now })),
    updatedAt: now,
  })
}

function emptyUsage(): AxisRunState['usage'] {
  return { costUsd: 0, durationMs: 0, gateCyclesForFile: 0, pivots: 0, retriesForTask: 0, tokens: 0 }
}

function addMeasuredUsage(
  usage: AxisRunState['usage'],
  measured: WorkerResult['usage'],
): AxisRunState['usage'] {
  return {
    ...usage,
    costUsd: usage.costUsd + measured.costUsd,
    durationMs: usage.durationMs + measured.durationMs,
    tokens: usage.tokens + measured.tokens,
  }
}

function budgetStopReason(
  budget: BudgetEnvelope,
  usage: AxisRunState['usage'],
): EngineStopReason | null {
  if (usage.tokens > budget.maxTokens) return 'token-limit'
  if (usage.costUsd > budget.maxCostUsd) return 'cost-limit'
  if (usage.durationMs > budget.maxDurationMs) return 'time-limit'
  if (usage.retriesForTask > budget.maxRetriesPerTask) return 'retry-limit'
  if (usage.gateCyclesForFile > budget.maxGateCyclesPerFile) return 'gate-cycle-limit'
  if (usage.pivots > budget.maxPivots) return 'pivot-limit'
  return null
}

function lifecycle(
  state: AxisRunState,
  timestamp: string,
  type: AxisRunState['events'][number]['type'],
  taskId: string | null,
  detail = '',
): AxisRunState['events'][number] {
  return { detail, revision: state.revision + 1, taskId, timestamp, type }
}

function requirePendingTask(state: AxisRunState, taskId: string, action: string): AxisRunState['tasks'][number] {
  if (state.status !== 'running') throw new Error(`Axis ${action} requires a running run, received ${state.status}`)
  const task = state.tasks.find((candidate) => candidate.taskId === taskId)
  if (!task || task.status !== 'pending') throw new Error(`Axis task ${taskId} must be pending before ${action}`)
  return task
}

function failTask(state: AxisRunState, taskId: string, error: string, timestamp: string): AxisRunState['tasks'] {
  return state.tasks.map((candidate) => candidate.taskId === taskId
    ? { ...candidate, error: error || 'Axis quality evaluation failed', status: 'failed' as const, updatedAt: timestamp }
    : candidate)
}

function requireTimestamp(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error('Invalid Axis run-state timestamp')
  return value
}
