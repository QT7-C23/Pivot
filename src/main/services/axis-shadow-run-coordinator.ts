import { randomUUID } from 'node:crypto'
import {
  AxisShadowRunRequestSchema,
  AxisShadowRunResultSchema,
  EngineTraceSchema,
  type AxisShadowRunRequest,
  type AxisShadowRunResult,
  type ComplexityReport,
  type EngineBudgetUsage,
  type EngineTrace,
  type TaskDag,
} from '../../shared/axis-engine-contracts'
import { evaluateAxisBudget } from './axis-budget-guard'
import type { AxisComplexityEvaluator } from './axis-complexity-evaluator'
import { buildDagSchedule } from './axis-dag-scheduler'
import type { AxisTaskDecomposer } from './axis-task-decomposer'

type TraceEventType = EngineTrace['events'][number]['type']
type AxisIdKind = 'run' | 'trace'

export interface AxisTraceStore {
  save(trace: EngineTrace): EngineTrace
}

export class AxisShadowRunCoordinator {
  private readonly clock: () => Date
  private readonly complexityEvaluator: AxisComplexityEvaluator
  private readonly decomposer: AxisTaskDecomposer
  private readonly idFactory: (kind: AxisIdKind) => string
  private readonly traces: AxisTraceStore

  constructor(options: {
    clock?: () => Date
    complexityEvaluator: AxisComplexityEvaluator
    decomposer: AxisTaskDecomposer
    idFactory?: (kind: AxisIdKind) => string
    traces: AxisTraceStore
  }) {
    this.clock = options.clock ?? (() => new Date())
    this.complexityEvaluator = options.complexityEvaluator
    this.decomposer = options.decomposer
    this.idFactory = options.idFactory ?? ((kind) => `${kind}-${randomUUID()}`)
    this.traces = options.traces
  }

  async plan(requestInput: AxisShadowRunRequest): Promise<AxisShadowRunResult> {
    const request = AxisShadowRunRequestSchema.parse(requestInput)
    const startedAt = this.clock()
    const mutableTrace: EngineTrace = {
      events: [],
      runId: this.idFactory('run'),
      sessionId: request.sessionId,
      startedAt: startedAt.toISOString(),
      traceId: this.idFactory('trace'),
    }
    const usage: EngineBudgetUsage = {
      costUsd: 0,
      durationMs: 0,
      gateCyclesForFile: 0,
      pivots: 0,
      retriesForTask: 0,
      tokens: 0,
    }
    let complexity: ComplexityReport | null = null
    let dag: TaskDag | null = null

    const snapshot = (): EngineTrace => EngineTraceSchema.parse(mutableTrace)
    const record = (type: TraceEventType, detail: string, taskId: string | null = null): void => {
      mutableTrace.events.push({
        detail: detail.slice(0, 16_000),
        sequence: mutableTrace.events.length + 1,
        taskId,
        timestamp: this.clock().toISOString(),
        type,
      })
      this.traces.save(snapshot())
    }
    const refreshDuration = (): void => {
      usage.durationMs = Math.max(0, this.clock().getTime() - startedAt.getTime())
    }
    const stoppedResult = (stopReason: NonNullable<ReturnType<typeof evaluateAxisBudget>['stopReason']>): AxisShadowRunResult => {
      record('budget-stopped', stopReason)
      record('run-completed', `Shadow planning stopped: ${stopReason}`)
      return AxisShadowRunResultSchema.parse({
        complexity, dag, mode: 'shadow', objective: request.objective, schedule: null, status: 'stopped', stopReason, trace: snapshot(), usage,
      })
    }

    record('run-started', 'Axis shadow planning started')
    try {
      const evaluation = await this.complexityEvaluator.evaluate(request.objective, request.context)
      complexity = evaluation.report
      usage.costUsd += evaluation.usage.costUsd
      usage.tokens += evaluation.usage.tokens
      refreshDuration()
      record(
        'complexity-evaluated',
        `Route ${complexity.route}; score ${complexity.score}; confidence ${complexity.confidence}; workers ${complexity.suggestedWorkers}; gates ${complexity.requiredGates.join(',')}; human review ${complexity.requiresHumanReview ? 'required' : 'not-required'}`,
      )
      const afterComplexity = evaluateAxisBudget(request.budget, usage)
      if (!afterComplexity.allowed) return stoppedResult(afterComplexity.stopReason!)

      const decomposition = await this.decomposer.decompose(request.objective, complexity, request.context)
      complexity = decomposition.classification
      dag = decomposition.dag
      usage.costUsd += decomposition.usage.costUsd
      usage.tokens += decomposition.usage.tokens
      refreshDuration()
      record('dag-created', `DAG ${dag.dagId} contains ${dag.tasks.length} tasks`)
      const afterDecomposition = evaluateAxisBudget(request.budget, usage)
      if (!afterDecomposition.allowed) return stoppedResult(afterDecomposition.stopReason!)

      const schedule = buildDagSchedule(dag, Math.min(request.budget.maxWorkers, complexity.suggestedWorkers))
      for (const [batchIndex, batch] of schedule.batches.entries()) {
        for (const taskId of batch) record('task-scheduled', `Shadow batch ${batchIndex + 1}`, taskId)
      }
      record('run-completed', 'Axis shadow planning completed without executing tasks')
      return AxisShadowRunResultSchema.parse({
        complexity, dag, mode: 'shadow', objective: request.objective, schedule, status: 'planned', stopReason: null, trace: snapshot(), usage,
      })
    } catch (error) {
      record('run-failed', error instanceof Error ? error.message : String(error))
      throw error
    }
  }
}
