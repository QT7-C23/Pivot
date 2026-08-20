import { createHash } from 'node:crypto'
import type {
  AxisModelUsage,
  AxisPivotDecisionRecord,
  AxisPivotRequest,
  AxisRunState,
  AxisShadowRunRequest,
  AxisShadowRunResult,
  BudgetEnvelope,
  PivotDecision,
} from '../../shared/axis-engine-contracts'
import {
  AxisPivotDecisionRecordSchema,
  AxisRunStateSchema,
} from '../../shared/axis-engine-contracts'
import type {
  AxisPivotDispatchResult,
} from '../../shared/axis-pivot-action-contracts'
import {
  AxisPivotFailureObservationSchema,
  type AxisPivotContinuationHandoff,
  type AxisPivotFailureEvidence,
  type AxisPivotFailureObservation,
} from '../../shared/axis-pivot-failure-contracts'
import { composeAxisPivotActionDispatcher } from './axis-pivot-action-composition'
import type {
  AxisPivotAssignmentStatePort,
  AxisPivotProjectFileListPort,
  AxisPivotRetryStatePort,
  AxisPivotRunStateReaderPort,
  AxisPivotStopStatePort,
} from './axis-pivot-action-ports'
import { AxisDedicatedFixerAssignmentRegistry } from './axis-dedicated-fixer-assignment-registry'
import type {
  AxisDedicatedFixerResolverPort,
} from './axis-dedicated-fixer-ports'
import { AxisHumanEscalationRegistry } from './axis-human-escalation-registry'
import { AxisPivotContinuationRegistry } from './axis-pivot-continuation-registry'
import { AxisPivotDedicatedFixerActionHandler } from './axis-pivot-dedicated-fixer-action-handler'
import { AxisPivotDiscardActionHandler } from './axis-pivot-discard-action-handler'
import { AxisPivotDispatchRegistry } from './axis-pivot-dispatch-registry'
import { AxisPivotEscalateActionHandler } from './axis-pivot-escalate-action-handler'
import { AxisPivotReplanActionHandler } from './axis-pivot-replan-action-handler'
import { AxisPivotRetryActionHandler } from './axis-pivot-retry-action-handler'
import { AxisPivotSelfRepairActionHandler } from './axis-pivot-self-repair-action-handler'
import { AxisPivotStopActionHandler } from './axis-pivot-stop-action-handler'
import { AxisPivotCoordinator } from './axis-pivot-coordinator'
import { AxisPivotDecisionRegistry } from './axis-pivot-decision-registry'
import { AxisPivotFailureEvidenceRegistry } from './axis-pivot-failure-evidence-registry'
import { AxisMainPivotPlanningContextAdapter } from './axis-pivot-planning-context-adapter'
import type { AxisPivotModel } from './axis-pivot-model'
import { AxisPlanLineageRegistry } from './axis-plan-lineage-registry'
import type {
  AxisProjectBindingReaderPort,
} from './axis-project-binding-ports'
import { AxisReplanCoordinator } from './axis-replan-coordinator'
import { AxisSecurityFixerResolverAdapter } from './axis-security-fixer-resolver-adapter'
import type {
  AxisWorkerAttemptLifecyclePort,
} from './axis-worker-attempt-ports'
import { AxisWorkerAttemptRegistry } from './axis-worker-attempt-registry'
import { AxisWorkerDiscardRegistry } from './axis-worker-discard-registry'
import { AxisWorkerAttemptTrackingExecutor } from './axis-worker-attempt-tracking-executor'
import type { AxisTaskExecutor } from './axis-task-executor'
import type {
  AxisPivotContinuationAuthorizationPort,
} from './axis-pivot-guarded-continuation-ports'

export interface AxisDynamicPivotFeaturePort {
  isEnabled(): boolean
}

interface AxisPivotRuntimePlanStore {
  delete(runId: string, sessionId: string): void
  get(runId: string): AxisShadowRunResult | null
  save(result: AxisShadowRunResult): AxisShadowRunResult
}

interface AxisPivotRuntimeStateStore {
  create(result: AxisShadowRunResult, budget: BudgetEnvelope): AxisRunState
  delete(runId: string, sessionId: string): void
  get(runId: string): AxisRunState | null
  openPivotActionReaderPort(): AxisPivotRunStateReaderPort
  openPivotAssignmentStatePort(): AxisPivotAssignmentStatePort
  openPivotRetryStatePort(): AxisPivotRetryStatePort
  openPivotStopStatePort(): AxisPivotStopStatePort
  recordPivot(input: {
    decision: PivotDecision
    decisionDurationMs: number
    decisionId: string
    expectedRevision: number
    modelUsage: AxisModelUsage
    runId: string
    sessionId: string
  }): AxisRunState
}

interface AxisPivotRuntimePlanner {
  plan(request: AxisShadowRunRequest): Promise<AxisShadowRunResult>
}

export interface AxisProductionPivotRuntime {
  close(): void
  decideAndDispatch(request: AxisPivotRequest): Promise<AxisPivotDispatchResult>
  deleteForSession(sessionId: string): void
  findContinuation(decisionId: string): AxisPivotContinuationHandoff | null
  findDispatch(decisionId: string): AxisPivotDispatchResult | null
  findFailureEvidence(
    runId: string,
    sourceEventRevision: number,
  ): AxisPivotFailureEvidence | null
  observeFailure(
    request: AxisPivotFailureObservation,
  ): Promise<AxisPivotDispatchResult>
  openContinuationAuthorizationPort(): AxisPivotContinuationAuthorizationPort
  openWorkerAttemptLifecyclePort(): AxisWorkerAttemptLifecyclePort
  readonly ready: Promise<void>
  trackDryRunExecutor(executor: AxisTaskExecutor): AxisTaskExecutor
}

export interface AxisProductionPivotRuntimeOptions {
  databasePath?: string
  feature: AxisDynamicPivotFeaturePort
  files: AxisPivotProjectFileListPort
  fixer?: AxisDedicatedFixerResolverPort
  modelFactory(): AxisPivotModel
  plannerFactory(): AxisPivotRuntimePlanner
  plans: AxisPivotRuntimePlanStore
  projects: AxisProjectBindingReaderPort
  states: AxisPivotRuntimeStateStore
}

export function resolveAxisDynamicPivotFeature(
  env: Readonly<Record<string, string | undefined>>,
): AxisDynamicPivotFeaturePort {
  const value = env['PIVOT_AXIS_DYNAMIC_PIVOT']
  if (value !== undefined && value !== '0' && value !== '1') {
    throw new Error('PIVOT_AXIS_DYNAMIC_PIVOT must be 0 or 1')
  }
  return Object.freeze({
    isEnabled: () => value === '1',
  })
}

export function createAxisProductionPivotRuntime(
  options: AxisProductionPivotRuntimeOptions,
): AxisProductionPivotRuntime | null {
  if (!options.feature.isEnabled()) return null

  const databasePath = options.databasePath ?? ':memory:'
  const decisions = new AxisPivotDecisionRegistry(databasePath)
  const dispatches = new AxisPivotDispatchRegistry(databasePath)
  const failureEvidence = new AxisPivotFailureEvidenceRegistry(databasePath)
  const continuations = new AxisPivotContinuationRegistry(databasePath)
  const attempts = new AxisWorkerAttemptRegistry(databasePath)
  const dedicatedFixers = new AxisDedicatedFixerAssignmentRegistry(
    databasePath,
    { attempts: attempts.openReaderPort() },
  )
  const discards = new AxisWorkerDiscardRegistry(
    databasePath,
    { attempts: attempts.openReaderPort() },
  )
  const escalations = new AxisHumanEscalationRegistry(databasePath)
  const lineages = new AxisPlanLineageRegistry(databasePath)
  const observations = new Map<string, Promise<AxisPivotDispatchResult>>()
  let closed = false

  try {
    const decisionReader = decisions.openActionReaderPort()
    const stateReader = options.states.openPivotActionReaderPort()
    const replans = new AxisReplanCoordinator({
      lineages,
      planner: options.plannerFactory(),
      plans: options.plans,
      states: options.states,
    })
    const coordinator = new AxisPivotCoordinator({
      decisions,
      model: options.modelFactory(),
      states: options.states,
    })
    const dispatcher = composeAxisPivotActionDispatcher({
      decisions: decisionReader,
      executors: {
        'dedicated-fixer': new AxisPivotDedicatedFixerActionHandler({
          assignments: dedicatedFixers.openAssignmentPort(),
          attempts: attempts.openReaderPort(),
          decisions: decisionReader,
          fixers: options.fixer
            ?? new AxisSecurityFixerResolverAdapter().openResolverPort(),
          states: options.states.openPivotAssignmentStatePort(),
        }),
        discard: new AxisPivotDiscardActionHandler({
          attempts: attempts.openReaderPort(),
          decisions: decisionReader,
          discards: discards.openDiscardPort(),
          states: stateReader,
        }),
        escalate: new AxisPivotEscalateActionHandler({
          decisions: decisionReader,
          escalations: escalations.openEscalationPort(),
          states: stateReader,
        }),
        replan: new AxisPivotReplanActionHandler({
          contexts: new AxisMainPivotPlanningContextAdapter({
            files: options.files,
            projects: options.projects,
          }),
          decisions: decisionReader,
          replans: replans.openActionPort(),
          states: stateReader,
        }),
        retry: new AxisPivotRetryActionHandler({
          decisions: decisionReader,
          states: options.states.openPivotRetryStatePort(),
        }),
        'self-repair': new AxisPivotSelfRepairActionHandler({
          assignments: attempts.openAssignmentPort(),
          attempts: attempts.openReaderPort(),
          decisions: decisionReader,
          states: options.states.openPivotAssignmentStatePort(),
        }),
        stop: new AxisPivotStopActionHandler({
          decisions: decisionReader,
          states: options.states.openPivotStopStatePort(),
        }),
      },
    })

    const dispatchDecision = async (
      decisionInput: AxisPivotDecisionRecord,
    ): Promise<AxisPivotDispatchResult> => {
      const decision = AxisPivotDecisionRecordSchema.parse(decisionInput)
      if (decision.status !== 'decided' || !decision.decision) {
        throw new Error(
          `Axis production Pivot dispatch requires a decided record: ${decision.status}`,
        )
      }
      const decided = decision as AxisPivotDecisionRecord & {
        decision: NonNullable<AxisPivotDecisionRecord['decision']>
      }
      const existing = dispatches.find(decided.decisionId)
      if (existing) return requireDecisionDispatch(existing, decided)

      const result = await dispatcher.dispatch({
        decisionId: decided.decisionId,
        expectedRevision: decided.sourceRevision + 1,
        runId: decided.runId,
        sessionId: decided.sessionId,
      })
      requireDecisionDispatch(result, decided)
      try {
        return dispatches.save(result)
      } catch (error) {
        const concurrent = dispatches.find(decided.decisionId)
        if (concurrent) return requireDecisionDispatch(concurrent, decided)
        throw error
      }
    }

    const requireObservedEvidence = (
      decision: AxisPivotDecisionRecord,
    ): AxisPivotFailureEvidence => {
      const evidenceId = failureEvidenceId(
        decision.runId,
        decision.sourceRevision,
      )
      if (
        (decision.trigger.category !== 'minor'
          && decision.trigger.category !== 'direction')
        || decision.trigger.evidenceIds.length !== 1
        || decision.trigger.evidenceIds[0] !== evidenceId
        || !decision.trigger.taskId
      ) {
        throw new Error(
          'Axis Pivot decision was not created by authoritative task-failure observation',
        )
      }
      const existing = failureEvidence.findBySource(
        decision.runId,
        decision.sourceRevision,
      )
      if (existing) {
        if (
          existing.category !== decision.trigger.category
          || existing.evidenceId !== evidenceId
          || existing.taskId !== decision.trigger.taskId
        ) {
          throw new Error(
            'Axis Pivot observed failure evidence does not match its committed decision',
          )
        }
        return existing
      }
      const state = options.states.get(decision.runId)
      if (!state || state.sessionId !== decision.sessionId) {
        throw new Error(
          `Axis Pivot failure source Run not found: ${decision.runId}`,
        )
      }
      return failureEvidence.save(deriveFailureEvidence(
        state,
        decision.sourceRevision,
        false,
      ))
    }

    const recordContinuation = (
      decision: AxisPivotDecisionRecord,
      dispatch: AxisPivotDispatchResult,
      evidence: AxisPivotFailureEvidence,
    ): void => {
      if (dispatch.route !== 'continuation') return
      const action = dispatch.result.action
      if (
        action !== 'replan'
        && action !== 'retry'
        && action !== 'self-repair'
        && action !== 'dedicated-fixer'
      ) {
        throw new Error('Axis Pivot continuation route contains a terminal action')
      }
      continuations.save({
        action,
        createdAt: decision.updatedAt,
        decisionId: decision.decisionId,
        executionRevision: dispatch.executionRevision,
        failureEvidenceId: evidence.evidenceId,
        handoffId: continuationHandoffId(decision.decisionId),
        runId: decision.runId,
        schemaVersion: 1,
        sessionId: decision.sessionId,
        status: 'pending-guarded-review',
        targetRunId: action === 'replan'
          ? dispatch.result.lineage.childRunId!
          : decision.runId,
      })
    }

    const recordObservedOutcome = (
      decision: AxisPivotDecisionRecord,
      dispatch: AxisPivotDispatchResult,
    ): void => {
      const expectedEvidenceId = failureEvidenceId(
        decision.runId,
        decision.sourceRevision,
      )
      if (!decision.trigger.evidenceIds.includes(expectedEvidenceId)) return
      recordContinuation(
        decision,
        dispatch,
        requireObservedEvidence(decision),
      )
    }

    const ready = Promise.resolve().then(async () => {
      replans.recoverInterrupted()
      coordinator.recoverInterrupted()
      for (const decision of decisions.listDecided()) {
        const dispatch = await dispatchDecision(decision)
        recordObservedOutcome(decision, dispatch)
      }
    })

    const observeOnce = async (
      request: AxisPivotFailureObservation,
    ): Promise<AxisPivotDispatchResult> => {
      const existingDecision = decisions.findByRunRevision(
        request.runId,
        request.expectedRevision,
      )
      if (existingDecision) {
        if (existingDecision.sessionId !== request.sessionId) {
          throw new Error('Axis Pivot failure observation Session mismatch')
        }
        if (existingDecision.status !== 'decided') {
          throw new Error(
            `Axis Pivot failure observation already ended as ${existingDecision.status}`,
          )
        }
        const evidence = requireObservedEvidence(existingDecision)
        const dispatch = await dispatchDecision(existingDecision)
        recordContinuation(existingDecision, dispatch, evidence)
        return dispatch
      }

      const state = options.states.get(request.runId)
      if (!state || state.sessionId !== request.sessionId) {
        throw new Error(
          `Axis Pivot failure source Run not found: ${request.runId}`,
        )
      }
      const evidence = failureEvidence.save(deriveFailureEvidence(
        state,
        request.expectedRevision,
        true,
      ))
      const decision = await coordinator.decide({
        expectedRevision: request.expectedRevision,
        runId: request.runId,
        sessionId: request.sessionId,
        trigger: {
          category: evidence.category,
          evidenceIds: [evidence.evidenceId],
          summary: evidence.summary,
          taskId: evidence.taskId,
        },
      })
      const dispatch = await dispatchDecision(decision)
      recordContinuation(decision, dispatch, evidence)
      return dispatch
    }

    return Object.freeze({
      close() {
        if (closed) return
        closed = true
        lineages.close()
        escalations.close()
        discards.close()
        dedicatedFixers.close()
        attempts.close()
        continuations.close()
        failureEvidence.close()
        dispatches.close()
        decisions.close()
      },
      async decideAndDispatch(request: AxisPivotRequest) {
        await ready
        return dispatchDecision(await coordinator.decide(request))
      },
      deleteForSession(sessionId: string) {
        continuations.deleteForSession(sessionId)
        failureEvidence.deleteForSession(sessionId)
        dispatches.deleteForSession(sessionId)
        escalations.deleteForSession(sessionId)
        discards.deleteForSession(sessionId)
        dedicatedFixers.deleteForSession(sessionId)
        attempts.deleteForSession(sessionId)
        lineages.deleteForSession(sessionId)
        decisions.deleteForSession(sessionId)
      },
      findContinuation: (decisionId: string) => (
        continuations.findByDecision(decisionId)
      ),
      findDispatch: (decisionId: string) => dispatches.find(decisionId),
      findFailureEvidence: (
        runId: string,
        sourceEventRevision: number,
      ) => failureEvidence.findBySource(runId, sourceEventRevision),
      async observeFailure(requestInput: AxisPivotFailureObservation) {
        const request = AxisPivotFailureObservationSchema.parse(requestInput)
        await ready
        const key = `${request.runId}\u0000${request.expectedRevision}`
        const existing = observations.get(key)
        if (existing) return existing
        const observation = observeOnce(request).finally(() => {
          if (observations.get(key) === observation) observations.delete(key)
        })
        observations.set(key, observation)
        return observation
      },
      openContinuationAuthorizationPort: () => Object.freeze({
        find(decisionId: string) {
          const handoff = continuations.findByDecision(decisionId)
          const dispatch = dispatches.find(decisionId)
          return handoff && dispatch ? { dispatch, handoff } : null
        },
      }),
      openWorkerAttemptLifecyclePort: () => attempts.openLifecyclePort(),
      ready,
      trackDryRunExecutor: (executor: AxisTaskExecutor) => (
        new AxisWorkerAttemptTrackingExecutor({
          attempts: attempts.openLifecyclePort(),
          delegate: executor,
          states: stateReader,
          workerId: 'axis-dry-run-worker',
        })
      ),
    })
  } catch (error) {
    lineages.close()
    escalations.close()
    discards.close()
    dedicatedFixers.close()
    attempts.close()
    continuations.close()
    failureEvidence.close()
    dispatches.close()
    decisions.close()
    throw error
  }
}

function deriveFailureEvidence(
  stateInput: AxisRunState,
  sourceEventRevision: number,
  requireLatest: boolean,
): AxisPivotFailureEvidence {
  const state = AxisRunStateSchema.parse(stateInput)
  if (
    (requireLatest && state.revision !== sourceEventRevision)
    || state.revision < sourceEventRevision
    || (requireLatest && state.status !== 'failed')
  ) {
    throw new Error(
      `Axis Pivot failure observation revision conflict: expected ${sourceEventRevision}, current ${state.revision}`,
    )
  }
  const event = state.events[sourceEventRevision - 1]
  if (
    !event
    || event.revision !== sourceEventRevision
    || event.type !== 'task-failed'
    || !event.taskId
  ) {
    throw new Error(
      'Axis Pivot failure observation requires the latest authoritative task-failed event',
    )
  }
  const task = state.tasks.find(({ taskId }) => taskId === event.taskId)
  if (!task || (requireLatest && task.status !== 'failed')) {
    throw new Error(
      'Axis Pivot failure observation requires its authoritative failed task',
    )
  }
  const retryEvent = [...state.events]
    .slice(0, sourceEventRevision - 1)
    .reverse()
    .find((candidate) => (
      candidate.type === 'pivot-retry-scheduled'
      && candidate.taskId === event.taskId
      && candidate.pivotDecisionId
    ))
  const common = {
    evidenceId: failureEvidenceId(state.runId, sourceEventRevision),
    observedAt: event.timestamp,
    runId: state.runId,
    sessionId: state.sessionId,
    sourceEventRevision,
    sourceEventTimestamp: event.timestamp,
    summary: event.detail.trim() || task.error || 'Axis Worker task failed',
    taskId: event.taskId,
  }
  if (
    retryEvent?.pivotDecisionId
    && task.attempts >= 2
    && state.usage.retriesForTask >= 1
  ) {
    return {
      ...common,
      category: 'direction',
      retryDecisionId: retryEvent.pivotDecisionId,
      schemaVersion: 2,
      source: 'post-retry-task-failure',
    }
  }
  return {
    ...common,
    category: 'minor',
    schemaVersion: 1,
  }
}

function failureEvidenceId(runId: string, sourceRevision: number): string {
  return `pivot-failure-${digest(`${runId}\u0000${sourceRevision}`)}`
}

function continuationHandoffId(decisionId: string): string {
  return `pivot-continuation-${digest(decisionId)}`
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function requireDecisionDispatch(
  result: AxisPivotDispatchResult,
  decision: AxisPivotDecisionRecord & {
    decision: NonNullable<AxisPivotDecisionRecord['decision']>
  },
): AxisPivotDispatchResult {
  if (
    result.decisionId !== decision.decisionId
    || result.executionRevision !== decision.sourceRevision + 1
    || result.runId !== decision.runId
    || result.sessionId !== decision.sessionId
    || result.result.action !== decision.decision.action
  ) {
    throw new Error(
      'Axis production Pivot dispatch result does not match its committed decision',
    )
  }
  return result
}
