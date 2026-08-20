import { describe, expect, it } from 'vitest'
import { AxisTaskDecomposer } from '../../src/main/services/axis-task-decomposer'
import type { AxisPlanningModel } from '../../src/main/services/axis-planning-model'
import type { ComplexityReport, TaskDag, TaskDagProposal } from '../../src/shared/axis-engine-contracts'

const complexity: ComplexityReport = {
  confidence: 1, policyAdjustments: [], reasons: ['Two independent modules'], requiredGates: ['compile', 'test', 'correctness'], requiresHumanReview: false, riskFlags: ['cross-module'], route: 'multi-agent', schemaVersion: 1, score: 4, suggestedWorkers: 2,
}

describe('Axis task decomposer', () => {
  it('validates a model DAG before it can reach a runtime', async () => {
    const dag = validDag()
    const model: Pick<AxisPlanningModel, 'decomposeTask'> = {
      decomposeTask: async () => ({ output: dag, usage: { costUsd: 0.002, tokens: 900 } }),
    }
    const result = await new AxisTaskDecomposer(model).decompose('Build shadow planning', complexity, {
      availableFiles: ['src/main/a.ts', 'src/main/b.ts'], constraints: [],
    })

    expect(result.dag.tasks.map((task) => task.id)).toEqual(['a', 'b'])
    expect(result.dag.tasks.map((task) => ({
      requiredGates: (task as unknown as { requiredGates?: string[] }).requiredGates,
      requiresHumanReview: (task as unknown as { requiresHumanReview?: boolean }).requiresHumanReview,
    }))).toEqual([
      { requiredGates: ['compile', 'test', 'correctness'], requiresHumanReview: false },
      { requiredGates: ['compile', 'test', 'correctness'], requiresHumanReview: false },
    ])
    expect(result.usage.tokens).toBe(900)
  })

  it.each([
    ['objective mismatch', { ...validDag(), objective: 'Different objective' }],
    ['dependency cycle', validDag([{ ...task('a'), dependencies: ['b'] }, { ...task('b'), dependencies: ['a'] }])],
    ['file ownership collision', validDag([task('a', ['same.ts']), task('b', ['same.ts'])])],
  ])('rejects %s', async (_label, output) => {
    const decomposer = new AxisTaskDecomposer({
      decomposeTask: async () => ({ output, usage: { costUsd: 0, tokens: 1 } }),
    })
    await expect(decomposer.decompose('Build shadow planning', complexity, { availableFiles: [], constraints: [] })).rejects.toThrow()
  })

  it('raises execution Gates from the model-selected file scope', async () => {
    const output = validDag([
      task('a', ['src/main/ipc-handlers.ts']),
      task('b', ['src/renderer/services/file.service.ts']),
    ])
    const result = await new AxisTaskDecomposer({
      decomposeTask: async () => ({ output, usage: { costUsd: 0, tokens: 1 } }),
    }).decompose('Build shadow planning', {
      confidence: 0.95, policyAdjustments: [], reasons: ['Model missed file risks'], requiredGates: ['compile', 'test'],
      requiresHumanReview: false, riskFlags: [], route: 'multi-agent', schemaVersion: 1, score: 2, suggestedWorkers: 2,
    }, { availableFiles: ['src/main/ipc-handlers.ts', 'src/renderer/services/file.service.ts'], constraints: [] })

    expect(result.classification).toMatchObject({
      requiredGates: ['compile', 'test', 'correctness', 'security'],
      requiresHumanReview: true,
      score: 4,
    })
    expect(result.dag.tasks.every((item) => item.requiredGates.includes('security'))).toBe(true)
  })
})

function validDag(tasks: TaskDagProposal['tasks'] = [task('a', ['src/main/a.ts']), task('b', ['src/main/b.ts'])]): TaskDagProposal {
  return { createdAt: '2026-07-22T00:00:00.000Z', dagId: 'dag-1', objective: 'Build shadow planning', schemaVersion: 1, tasks }
}

function task(id: string, assignedFiles: string[] = []): TaskDagProposal['tasks'][number] {
  return { assignedFiles, dependencies: [], estimatedComplexity: 2, id, objective: id, requiredTools: ['read'], spawnDepth: 1, title: id }
}
