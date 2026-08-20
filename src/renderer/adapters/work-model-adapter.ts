import type {
  AgentAdapterInfo,
  ArtifactLifecycleStatus,
  ArtifactReviewLifecycleStatus,
  FileReviewRecord,
  PermissionRequest,
  PlanDocument,
  RunLifecycleStatus,
  SessionRecord,
  TaskLifecycleStatus,
  WorkItemSnapshot,
} from '../../shared/types/domain'

export type LegacyAgentState = 'idle' | 'thinking' | 'writing' | 'executing' | 'waiting_permission' | 'error'

export interface LegacyWorkProjectionInput {
  activeRunId: string | null
  activeSessionId: string | null
  adapterInfo: AgentAdapterInfo | null
  agentError: string | null
  agentState: LegacyAgentState
  fileReviews: FileReviewRecord[]
  permissionRequests: PermissionRequest[]
  plans: PlanDocument[]
  sessions: SessionRecord[]
}

/**
 * Compatibility boundary for UI V2. Legacy session/plan/runtime stores stay
 * independent; only this pure adapter may project them into unified work data.
 */
export function projectLegacyWorkItems(input: LegacyWorkProjectionInput): WorkItemSnapshot[] {
  const latestPlanBySession = new Map<string, PlanDocument>()
  for (const plan of [...input.plans].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) {
    if (!latestPlanBySession.has(plan.sessionId)) latestPlanBySession.set(plan.sessionId, plan)
  }

  return [...input.sessions]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((session) => projectSession(session, latestPlanBySession.get(session.id) ?? null, input))
}

function projectSession(
  session: SessionRecord,
  plan: PlanDocument | null,
  input: LegacyWorkProjectionInput,
): WorkItemSnapshot {
  const taskId = `task:${session.id}`
  const isActive = session.id === input.activeSessionId
  const permissions = input.permissionRequests.filter((request) => request.sessionId === session.id)
  const fileReviews = input.fileReviews.filter((review) => review.sessionId === session.id)
  const pendingReviews = fileReviews.filter((review) => review.status === 'pending' || review.status === 'mixed')
  const taskStatus = resolveTaskStatus({
    activeRunId: isActive ? input.activeRunId : null,
    agentState: isActive ? input.agentState : 'idle',
    isRemote: isActive && input.adapterInfo?.kind === 'http',
    isActive,
    pendingPermissionCount: permissions.length,
    pendingReviewCount: pendingReviews.length,
    plan,
  })
  const run = projectRun(session, taskId, plan, taskStatus, isActive, input)

  const artifacts = fileReviews.map((review) => ({
    id: `artifact:${review.id}`,
    path: review.filePath,
    sessionId: session.id,
    status: artifactStatus(review),
    taskId,
    title: fileName(review.filePath),
    type: 'code-change' as const,
    updatedAt: review.updatedAt,
  }))
  const reviews = fileReviews.map((review) => ({
    artifactId: `artifact:${review.id}`,
    id: review.id,
    sessionId: session.id,
    status: reviewStatus(review),
    taskId,
    updatedAt: review.updatedAt,
  }))
  const attention = [
    ...permissions.map((request) => ({
      createdAt: session.updatedAt,
      detail: request.toolName,
      id: `attention:${request.requestId}`,
      kind: 'permission' as const,
      priority: 'high' as const,
      runId: request.runId,
      sessionId: session.id,
      taskId,
      title: 'Permission required',
    })),
    ...pendingReviews.map((review) => ({
      createdAt: review.updatedAt,
      detail: fileName(review.filePath),
      id: `attention:review:${review.id}`,
      kind: 'review' as const,
      priority: 'normal' as const,
      runId: run?.id ?? null,
      sessionId: session.id,
      taskId,
      title: 'Artifact ready for review',
    })),
    ...(isActive && input.agentState === 'error' ? [{
      createdAt: session.updatedAt,
      detail: input.agentError ?? 'The current run stopped before completion.',
      id: `attention:failure:${session.id}`,
      kind: 'failure' as const,
      priority: 'high' as const,
      runId: run?.id ?? null,
      sessionId: session.id,
      taskId,
      title: 'Run needs recovery',
    }] : []),
  ]

  return {
    artifacts,
    attention,
    reviews,
    run,
    task: {
      createdAt: session.createdAt,
      id: taskId,
      planId: plan?.id ?? null,
      projectPath: session.projectPath,
      sessionId: session.id,
      status: taskStatus,
      studio: 'code',
      title: plan?.title ?? session.title,
      updatedAt: plan && plan.updatedAt > session.updatedAt ? plan.updatedAt : session.updatedAt,
    },
  }
}

function resolveTaskStatus(input: {
  activeRunId: string | null
  agentState: LegacyAgentState
  isActive: boolean
  isRemote: boolean
  pendingPermissionCount: number
  pendingReviewCount: number
  plan: PlanDocument | null
}): TaskLifecycleStatus {
  if (input.pendingPermissionCount > 0 || input.agentState === 'waiting_permission') return 'waiting_permission'
  if (input.agentState === 'error') return 'failed_recoverable'
  if (input.activeRunId) return input.isRemote ? 'running_remote' : 'running_local'
  if (input.plan?.status === 'executing') return input.isActive ? (input.isRemote ? 'running_remote' : 'running_local') : 'background'
  if (input.pendingReviewCount > 0) return 'review_ready'
  if (input.plan?.status === 'paused') return 'paused'
  if (input.plan?.status === 'done') return 'delivered'
  if (input.plan?.status === 'cancelled') return 'cancelled'
  if (input.plan) return 'plan_ready'
  return 'draft'
}

function projectRun(
  session: SessionRecord,
  taskId: string,
  plan: PlanDocument | null,
  taskStatus: TaskLifecycleStatus,
  isActive: boolean,
  input: LegacyWorkProjectionInput,
): WorkItemSnapshot['run'] {
  const hasRun = Boolean(isActive && input.activeRunId)
    || plan?.status === 'executing'
    || plan?.status === 'paused'
    || plan?.status === 'done'
    || plan?.status === 'cancelled'
  if (!hasRun) return null

  const location = isActive && input.adapterInfo?.kind === 'http' ? 'remote' : 'local'
  return {
    completedSteps: plan?.steps.filter((step) => step.status === 'done').length ?? 0,
    id: isActive && input.activeRunId ? input.activeRunId : `run:${plan!.id}`,
    location,
    runtimeId: isActive ? input.adapterInfo?.profileId ?? input.adapterInfo?.id ?? 'pivot' : 'legacy-unrecorded',
    runtimeLabel: isActive ? input.adapterInfo?.label ?? 'Pivot Runtime' : 'Recorded runtime',
    sessionId: session.id,
    status: runStatus(taskStatus),
    taskId,
    totalSteps: plan?.steps.length ?? 0,
    updatedAt: plan?.updatedAt ?? session.updatedAt,
  }
}

function runStatus(status: TaskLifecycleStatus): RunLifecycleStatus {
  if (status === 'delivered' || status === 'review_ready') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'failed_recoverable' || status === 'failed_terminal') return 'failed'
  if (status === 'paused') return 'paused'
  if (status === 'waiting_permission' || status === 'waiting_question') return 'waiting'
  if (status === 'queued') return 'queued'
  return 'running'
}

function artifactStatus(review: FileReviewRecord): ArtifactLifecycleStatus {
  if (review.status === 'accepted') return 'accepted'
  if (review.status === 'rejected') return 'rejected'
  if (review.status === 'mixed') return 'changes_requested'
  return 'review_ready'
}

function reviewStatus(review: FileReviewRecord): ArtifactReviewLifecycleStatus {
  if (review.status === 'accepted') return 'accepted'
  if (review.status === 'rejected') return 'rejected'
  if (review.status === 'mixed') return 'changes_requested'
  return 'pending'
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}
