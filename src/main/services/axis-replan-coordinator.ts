import { randomUUID } from 'node:crypto'
import {
  AxisReplanRequestSchema,
  AxisShadowRunResultSchema,
  type AxisPlanLineage,
  type AxisReplanRequest,
  type AxisRunState,
  type AxisShadowRunRequest,
  type AxisShadowRunResult,
  type BudgetEnvelope,
} from '../../shared/axis-engine-contracts'
import type { AxisPlanLineageRegistry } from './axis-plan-lineage-registry'
import type { AxisPivotReplanPort } from './axis-pivot-action-ports'

interface AxisReplanPlanner {
  plan(request: AxisShadowRunRequest): Promise<AxisShadowRunResult>
}

interface AxisReplanPlanStore {
  delete(runId: string, sessionId: string): void
  get(runId: string): AxisShadowRunResult | null
  save(result: AxisShadowRunResult): AxisShadowRunResult
}

interface AxisReplanStateStore {
  create(result: AxisShadowRunResult, budget: BudgetEnvelope): AxisRunState
  delete(runId: string, sessionId: string): void
  get(runId: string): AxisRunState | null
}

export interface AxisReplanResult {
  lineage: AxisPlanLineage
  plan: AxisShadowRunResult
}

export class AxisReplanCoordinator {
  private readonly idFactory: () => string
  private readonly lineages: AxisPlanLineageRegistry
  private readonly planner: AxisReplanPlanner
  private readonly plans: AxisReplanPlanStore
  private readonly states: AxisReplanStateStore

  constructor(options: {
    idFactory?: () => string
    lineages: AxisPlanLineageRegistry
    planner: AxisReplanPlanner
    plans: AxisReplanPlanStore
    states: AxisReplanStateStore
  }) {
    this.idFactory = options.idFactory ?? (() => `replan-${randomUUID()}`)
    this.lineages = options.lineages
    this.planner = options.planner
    this.plans = options.plans
    this.states = options.states
  }

  async replan(requestInput: AxisReplanRequest): Promise<AxisReplanResult> {
    const request = AxisReplanRequestSchema.parse(requestInput)
    const parentState = this.requireSourceState(request)
    const parentPlan = this.requireSourcePlan(request, parentState)
    const existing = this.findCompleted({
      parentRunId: parentState.runId,
      sessionId: parentState.sessionId,
      sourceRevision: parentState.revision,
    })
    if (existing) {
      requireRepeatedRequestMatches(existing.lineage, request)
      return existing
    }
    const previous = this.lineages.findLatestForSource(
      parentState.runId,
      parentState.sessionId,
      parentState.revision,
    )
    if (previous) {
      throw new Error(
        `Axis replan already attempted for parent revision: ${previous.attemptId} (${previous.status})`,
      )
    }
    const parentLineage = this.lineages.findCompletedParent(parentState.runId, parentState.sessionId)
    const lineage = this.lineages.begin({
      attemptId: this.idFactory(),
      budget: request.budget,
      fileScope: request.context.availableFiles,
      generation: (parentLineage?.generation ?? 1) + 1,
      objective: parentState.objective,
      parentRunId: parentState.runId,
      rootRunId: parentLineage?.rootRunId ?? parentState.runId,
      sessionId: parentState.sessionId,
      sourceRevision: parentState.revision,
    })

    try {
      const plan = AxisShadowRunResultSchema.parse(await this.planner.plan({
        budget: request.budget,
        context: request.context,
        objective: parentPlan.objective,
        sessionId: request.sessionId,
      }))
      validateProviderPlan(plan, lineage)
      if (this.plans.get(plan.trace.runId) || this.states.get(plan.trace.runId)) {
        throw new Error(`Axis Provider returned an existing run identifier: ${plan.trace.runId}`)
      }
      const materializing = this.lineages.markMaterializing(lineage.attemptId, plan.trace.runId)
      if (!sourceStateMatches(this.states.get(parentState.runId), materializing)) {
        const stale = this.lineages.markStale(materializing.attemptId, 'Axis Provider response is stale because the parent revision changed')
        throw new AxisStaleReplanError(stale.error!)
      }
      this.plans.save(plan)
      this.states.create(plan, request.budget)
      return { lineage: this.lineages.complete(lineage.attemptId), plan }
    } catch (error) {
      const current = this.lineages.get(lineage.attemptId)
      if (current?.status === 'planning') this.lineages.markFailed(lineage.attemptId, errorMessage(error))
      throw error
    }
  }

  findCompleted(input: {
    parentRunId: string
    sessionId: string
    sourceRevision: number
  }): AxisReplanResult | null {
    const lineage = this.lineages.findCompletedForSource(
      input.parentRunId,
      input.sessionId,
      input.sourceRevision,
    )
    if (!lineage?.childRunId) return null
    const plan = this.plans.get(lineage.childRunId)
    const state = this.states.get(lineage.childRunId)
    if (!plan || !state) {
      throw new Error(`Axis completed replan artifacts are missing: ${lineage.attemptId}`)
    }
    validateProviderPlan(plan, lineage)
    validateChildState(state, plan, lineage)
    return { lineage, plan }
  }

  openActionPort(): AxisPivotReplanPort {
    const port: AxisPivotReplanPort = {
      findCompleted: (input) => this.findCompleted(input),
      replan: (request) => this.replan(request),
    }
    return Object.freeze(port)
  }

  recoverInterrupted(): AxisPlanLineage[] {
    const recovered: AxisPlanLineage[] = []
    for (const lineage of this.lineages.listPending()) {
      if (lineage.status === 'planning') {
        recovered.push(this.lineages.markInterrupted(
          lineage.attemptId,
          'Axis Provider request was interrupted before a child plan was returned',
        ))
        continue
      }
      if (!sourceStateMatches(this.states.get(lineage.parentRunId), lineage)) {
        this.deleteChildArtifacts(lineage)
        recovered.push(this.lineages.markStale(
          lineage.attemptId,
          'Axis Provider response became stale before crash recovery completed',
        ))
        continue
      }
      const childPlan = lineage.childRunId ? this.plans.get(lineage.childRunId) : null
      if (!childPlan) {
        recovered.push(this.lineages.markInterrupted(
          lineage.attemptId,
          'Axis child plan materialization was interrupted before the plan was persisted',
        ))
        continue
      }
      try {
        validateProviderPlan(childPlan, lineage)
        const existingState = this.states.get(childPlan.trace.runId)
        if (!existingState) this.states.create(childPlan, lineage.budget)
        else validateChildState(existingState, childPlan, lineage)
        recovered.push(this.lineages.complete(lineage.attemptId))
      } catch (error) {
        this.deleteChildArtifacts(lineage)
        recovered.push(this.lineages.markInterrupted(lineage.attemptId, errorMessage(error)))
      }
    }
    return recovered
  }

  private requireSourceState(request: AxisReplanRequest): AxisRunState {
    const state = this.states.get(request.parentRunId)
    if (!state || state.sessionId !== request.sessionId) throw new Error(`Axis source run not found: ${request.parentRunId}`)
    if (state.revision !== request.expectedRevision) {
      throw new Error(`Axis source run revision conflict: expected ${request.expectedRevision}, current ${state.revision}`)
    }
    if (
      state.status !== 'failed'
      && state.status !== 'paused'
      && state.status !== 'stopped'
    ) {
      throw new Error(
        `Axis replanning requires a failed, paused, or stopped source run, received ${state.status}`,
      )
    }
    return state
  }

  private requireSourcePlan(request: AxisReplanRequest, state: AxisRunState): AxisShadowRunResult {
    const plan = this.plans.get(request.parentRunId)
    if (!plan || plan.trace.sessionId !== request.sessionId) throw new Error(`Axis source plan not found: ${request.parentRunId}`)
    if (plan.objective !== state.objective) throw new Error('Axis source plan objective does not match its run state')
    return plan
  }

  private deleteChildArtifacts(lineage: AxisPlanLineage): void {
    if (!lineage.childRunId) return
    this.states.delete(lineage.childRunId, lineage.sessionId)
    this.plans.delete(lineage.childRunId, lineage.sessionId)
  }
}

class AxisStaleReplanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AxisStaleReplanError'
  }
}

function sourceStateMatches(state: AxisRunState | null, lineage: AxisPlanLineage): boolean {
  return Boolean(
    state
    && state.sessionId === lineage.sessionId
    && state.revision === lineage.sourceRevision
    && state.objective === lineage.objective
    && (
      state.status === 'failed'
      || state.status === 'paused'
      || state.status === 'stopped'
    ),
  )
}

function requireRepeatedRequestMatches(
  lineage: AxisPlanLineage,
  request: AxisReplanRequest,
): void {
  const fileScope = [...new Set(request.context.availableFiles)].sort()
  if (
    JSON.stringify(lineage.budget) !== JSON.stringify(request.budget)
    || JSON.stringify(lineage.fileScope) !== JSON.stringify(fileScope)
  ) {
    throw new Error('Axis repeated replan request does not match its completed lineage')
  }
}

function validateProviderPlan(plan: AxisShadowRunResult, lineage: AxisPlanLineage): void {
  if (plan.trace.sessionId !== lineage.sessionId) throw new Error('Axis Provider plan session does not match its source run')
  if (plan.trace.runId === lineage.parentRunId) throw new Error('Axis Provider plan must use a fresh run identifier')
  if (plan.objective !== lineage.objective || (plan.dag && plan.dag.objective !== lineage.objective)) {
    throw new Error('Axis Provider plan objective drifted from its source run')
  }
  const allowedFiles = new Set(lineage.fileScope)
  const assignedFiles = plan.dag?.tasks.flatMap((task) => task.assignedFiles) ?? []
  const outsideScope = assignedFiles.find((filePath) => !allowedFiles.has(filePath))
  if (outsideScope) throw new Error(`Axis Provider plan expanded beyond the frozen file scope: ${outsideScope}`)
}

function validateChildState(state: AxisRunState, plan: AxisShadowRunResult, lineage: AxisPlanLineage): void {
  if (state.runId !== lineage.childRunId || state.sessionId !== lineage.sessionId || state.objective !== lineage.objective) {
    throw new Error('Axis recovered child run state does not match its plan lineage')
  }
  const expectedStatus = plan.status === 'planned' ? 'planned' : 'stopped'
  const expectedTaskIds = plan.dag?.tasks.map((task) => task.id) ?? []
  if (
    state.revision !== 1
    || state.status !== expectedStatus
    || JSON.stringify(state.budget) !== JSON.stringify(lineage.budget)
    || JSON.stringify(state.tasks.map((task) => task.taskId)) !== JSON.stringify(expectedTaskIds)
  ) {
    throw new Error('Axis recovered child run state does not match its immutable plan snapshot')
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
