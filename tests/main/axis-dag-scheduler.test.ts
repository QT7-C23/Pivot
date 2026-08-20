import { describe, expect, it } from 'vitest'
import { AxisDagError, buildDagSchedule } from '../../src/main/services/axis-dag-scheduler'
import type { TaskDag } from '../../src/shared/axis-engine-contracts'

describe('Axis DAG scheduler', () => {
  it('creates stable parallel batches from dependency order', () => {
    const schedule = buildDagSchedule(dag([
      task('inspect'),
      task('renderer', ['inspect'], ['src/renderer/app.tsx']),
      task('main', ['inspect'], ['src/main/runtime.ts']),
      task('verify', ['renderer', 'main'], ['tests/verify.test.ts']),
    ]), 3)

    expect(schedule.batches).toEqual([['inspect'], ['renderer', 'main'], ['verify']])
    expect(schedule.warnings).toEqual([])
  })

  it('caps batches and warns when a non-trivial DAG collapses to one worker', () => {
    const schedule = buildDagSchedule(dag([
      task('a'), task('b'), task('c'), task('d'),
    ]), 1)
    expect(schedule.batches).toEqual([['a'], ['b'], ['c'], ['d']])
    expect(schedule.warnings).toContain('serial-collapse-risk')
  })

  it.each([
    ['missing-dependency', dag([task('a', ['missing'])])],
    ['cycle-detected', dag([task('a', ['b']), task('b', ['a'])])],
    ['file-ownership-conflict', dag([task('a', [], ['same.ts']), task('b', [], ['same.ts'])])],
  ])('rejects %s', (code, input) => {
    expect(() => buildDagSchedule(input, 2)).toThrowError(AxisDagError)
    try { buildDagSchedule(input, 2) } catch (error) { expect((error as AxisDagError).code).toBe(code) }
  })
})

function dag(tasks: TaskDag['tasks']): TaskDag {
  return { createdAt: '2026-07-22T00:00:00.000Z', dagId: 'dag-1', objective: 'test', schemaVersion: 1, tasks }
}

function task(id: string, dependencies: string[] = [], assignedFiles: string[] = []): TaskDag['tasks'][number] {
  return { assignedFiles, dependencies, estimatedComplexity: 2, id, objective: id, requiredGates: ['compile', 'test'], requiresHumanReview: false, requiredTools: [], spawnDepth: 1, title: id }
}
