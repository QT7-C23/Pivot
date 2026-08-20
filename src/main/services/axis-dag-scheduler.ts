import { AxisDagScheduleSchema, TaskDagSchema, type AxisDagSchedule, type TaskDag } from '../../shared/axis-engine-contracts'

export type AxisDagErrorCode =
  | 'invalid-worker-limit'
  | 'duplicate-task'
  | 'missing-dependency'
  | 'self-dependency'
  | 'cycle-detected'
  | 'file-ownership-conflict'

export type AxisScheduleWarning = 'serial-collapse-risk'

export class AxisDagError extends Error {
  constructor(readonly code: AxisDagErrorCode, message: string) {
    super(message)
    this.name = 'AxisDagError'
  }
}

/** Deterministic scheduler boundary. It never executes workers or reads mutable runtime state. */
export function buildDagSchedule(input: TaskDag, maxWorkers: number): AxisDagSchedule {
  const dag = TaskDagSchema.parse(input)
  if (!Number.isInteger(maxWorkers) || maxWorkers < 1 || maxWorkers > 8) {
    throw new AxisDagError('invalid-worker-limit', 'maxWorkers must be an integer between 1 and 8')
  }

  const taskById = new Map<string, TaskDag['tasks'][number]>()
  const fileOwner = new Map<string, string>()
  for (const task of dag.tasks) {
    if (taskById.has(task.id)) throw new AxisDagError('duplicate-task', `Duplicate task id: ${task.id}`)
    taskById.set(task.id, task)
    for (const filePath of task.assignedFiles) {
      const owner = fileOwner.get(filePath)
      if (owner && owner !== task.id) {
        throw new AxisDagError('file-ownership-conflict', `${filePath} is assigned to both ${owner} and ${task.id}`)
      }
      fileOwner.set(filePath, task.id)
    }
  }

  const dependents = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const task of dag.tasks) {
    const uniqueDependencies = new Set(task.dependencies)
    if (uniqueDependencies.has(task.id)) throw new AxisDagError('self-dependency', `${task.id} depends on itself`)
    for (const dependency of uniqueDependencies) {
      if (!taskById.has(dependency)) throw new AxisDagError('missing-dependency', `${task.id} depends on unknown task ${dependency}`)
      dependents.set(dependency, [...(dependents.get(dependency) ?? []), task.id])
    }
    indegree.set(task.id, uniqueDependencies.size)
  }

  let ready = dag.tasks.filter((task) => indegree.get(task.id) === 0).map((task) => task.id)
  const batches: string[][] = []
  const orderedTaskIds: string[] = []
  while (ready.length > 0) {
    const level = ready
    ready = []
    for (let index = 0; index < level.length; index += maxWorkers) {
      const batch = level.slice(index, index + maxWorkers)
      batches.push(batch)
      orderedTaskIds.push(...batch)
    }
    for (const completedId of level) {
      for (const dependentId of dependents.get(completedId) ?? []) {
        const remaining = indegree.get(dependentId)! - 1
        indegree.set(dependentId, remaining)
        if (remaining === 0) ready.push(dependentId)
      }
    }
  }

  if (orderedTaskIds.length !== dag.tasks.length) {
    throw new AxisDagError('cycle-detected', 'Task DAG contains a dependency cycle')
  }

  return AxisDagScheduleSchema.parse({
    batches,
    orderedTaskIds,
    warnings: maxWorkers === 1 && dag.tasks.length > 3 ? ['serial-collapse-risk'] : [],
  })
}
