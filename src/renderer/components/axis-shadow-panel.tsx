import { Activity, BrainCircuit, CircleDollarSign, Clock3, GitBranch, PlayCircle, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type {
  AxisGuardedSafeWriteCompletionEvidence,
  AxisRunLifecycleEvent,
  AxisRunState,
} from '../../shared/axis-engine-contracts'
import { useLocale } from '../i18n/locale-context'
import { useAxisShadowStore } from '../stores/axis-shadow.store'
import { AxisGuardedWriteApproval } from './axis-guarded-write-approval'

const COPY = {
  en: {
    title: 'Axis Shadow Plan', description: 'Plan and simulate first. Guarded file execution always requires explicit approval.', objective: 'Describe the outcome to decompose',
    create: 'Generate shadow plan', planning: 'Planning…', disabled: 'Enable Shadow planning in Agent settings first.', unavailable: 'Configure and activate a Provider before planning.',
    history: 'Recent shadow plans', tasks: 'Scheduled tasks', empty: 'No persisted Shadow plans for this session.', tokens: 'tokens', estimated: 'estimated ceiling', noFiles: 'No exclusive files', state: 'State', legacy: 'legacy', cancel: 'Cancel plan', reopen: 'Reopen plan', updating: 'Updating…', dryRun: 'Simulate DAG', dryRunning: 'Simulating…', dryRunDisabled: 'Enable Dry-run execution in Agent settings first.', completion: 'Durable completion', transaction: 'transaction', files: 'files', gates: 'Gate evidence',
  },
  'zh-CN': {
    title: 'Axis 影子规划', description: '先规划与模拟；文件执行必须经过显式受保护批准。', objective: '描述需要拆解的目标',
    create: '生成影子规划', planning: '正在规划…', disabled: '请先在 Agent 设置中开启影子规划。', unavailable: '请先配置并启用一个 Provider。',
    history: '最近的影子规划', tasks: '调度任务', empty: '当前会话还没有已保存的影子规划。', tokens: 'Token', estimated: '保守费用上界', noFiles: '没有独占文件', state: '状态', legacy: '旧版本', cancel: '取消规划', reopen: '重新打开规划', updating: '正在更新…', dryRun: '模拟 DAG', dryRunning: '正在模拟…', dryRunDisabled: '请先在 Agent 设置中开启模拟执行。', completion: '持久完成证据', transaction: '事务', files: '个文件', gates: '质量门证据',
  },
} as const

export function AxisShadowPanel({ sessionId }: { sessionId: string | null }): ReactElement {
  const { locale } = useLocale()
  const copy = locale === 'zh-CN' ? COPY['zh-CN'] : COPY.en
  const [objective, setObjective] = useState('')
  const activeRun = useAxisShadowStore((state) => state.activeRun)
  const cancelRun = useAxisShadowStore((state) => state.cancelRun)
  const dryRunningRunId = useAxisShadowStore((state) => state.dryRunningRunId)
  const dryRunState = useAxisShadowStore((state) => state.dryRunState)
  const error = useAxisShadowStore((state) => state.error)
  const executeDryRun = useAxisShadowStore((state) => state.executeDryRun)
  const guardedCompletionEvidence = useAxisShadowStore(
    (state) => state.guardedCompletionEvidence,
  )
  const guardedState = useAxisShadowStore((state) => state.guardedState)
  const isPlanning = useAxisShadowStore((state) => state.isPlanning)
  const loadRuns = useAxisShadowStore((state) => state.loadRuns)
  const loadState = useAxisShadowStore((state) => state.loadState)
  const mutatingRunId = useAxisShadowStore((state) => state.mutatingRunId)
  const openRun = useAxisShadowStore((state) => state.openRun)
  const plan = useAxisShadowStore((state) => state.plan)
  const restartRun = useAxisShadowStore((state) => state.restartRun)
  const runStates = useAxisShadowStore((state) => state.runStates)
  const runs = useAxisShadowStore((state) => state.runs)
  const shadowState = useAxisShadowStore((state) => state.state)

  useEffect(() => { void loadState() }, [loadState])
  useEffect(() => { void loadRuns(sessionId) }, [loadRuns, sessionId])

  const disabledReason = !shadowState?.enabled ? copy.disabled : !shadowState.available ? copy.unavailable : null
  const compact = Boolean(disabledReason) && runs.length === 0
  const activeRunState = activeRun ? runStates.find((state) => state.runId === activeRun.trace.runId) ?? null : null
  const isMutatingActiveRun = mutatingRunId === activeRun?.trace.runId
  const isDryRunningActiveRun = dryRunningRunId === activeRun?.trace.runId
  const activeCompletion = guardedCompletionEvidence?.runId === activeRun?.trace.runId
    ? guardedCompletionEvidence
    : null
  return <section className={`pv-axis-shadow-panel${compact ? ' compact' : ''}`}>
    <header><div><BrainCircuit size={17} /><span><strong>{copy.title}</strong><small>{copy.description}</small></span></div><em><ShieldCheck size={13} />Shadow</em></header>
    {!compact && <div className="pv-axis-shadow-create">
      <textarea aria-label={copy.objective} onChange={(event) => setObjective(event.target.value)} placeholder={copy.objective} value={objective} />
      <button disabled={!sessionId || !objective.trim() || isPlanning || Boolean(disabledReason)} onClick={() => sessionId && void plan(sessionId, objective.trim())} type="button">{isPlanning ? copy.planning : copy.create}</button>
    </div>}
    {disabledReason && <p className="pv-axis-shadow-note">{disabledReason}</p>}
    {error && <p className="pv-axis-shadow-error">{error}</p>}
    {!compact && <div className="pv-axis-shadow-content">
      <aside><h3>{copy.history}</h3>{runs.length === 0 ? <p>{copy.empty}</p> : runs.map((run) => <button className={activeRun?.trace.runId === run.trace.runId ? 'active' : ''} key={run.trace.runId} onClick={() => openRun(run.trace.runId)} type="button"><GitBranch size={13} /><span><strong>{run.objective}</strong><small>{new Date(run.trace.startedAt).toLocaleString()}</small></span></button>)}</aside>
      <div className="pv-axis-shadow-detail">
        {activeRun ? <><div className="pv-axis-shadow-metrics"><span><Activity size={13} />{activeRun.schedule?.orderedTaskIds.length ?? 0} {copy.tasks}</span><span><Clock3 size={13} />{activeRun.usage.durationMs} ms</span><span><CircleDollarSign size={13} />${activeRun.usage.costUsd.toFixed(4)} {copy.estimated}</span><span>{activeRun.usage.tokens} {copy.tokens}</span><span>{copy.state}: {activeRunState?.status ?? copy.legacy}</span></div>{activeCompletion && <AxisGuardedCompletionEvidence copy={copy} evidence={activeCompletion} />}{activeRunState && <div className="pv-axis-shadow-actions">{activeRunState.status === 'planned' && <button disabled={!dryRunState?.enabled || isDryRunningActiveRun || isMutatingActiveRun} onClick={() => void executeDryRun(activeRunState.runId)} title={dryRunState?.enabled ? copy.dryRun : copy.dryRunDisabled} type="button"><PlayCircle size={13} />{isDryRunningActiveRun ? copy.dryRunning : copy.dryRun}</button>}{['planned', 'running', 'paused'].includes(activeRunState.status) && <button disabled={isMutatingActiveRun || isDryRunningActiveRun} onClick={() => void cancelRun(activeRunState.runId)} type="button"><XCircle size={13} />{isMutatingActiveRun ? copy.updating : copy.cancel}</button>}{['cancelled', 'failed'].includes(activeRunState.status) && <button disabled={isMutatingActiveRun || isDryRunningActiveRun} onClick={() => void restartRun(activeRunState.runId)} type="button"><RotateCcw size={13} />{isMutatingActiveRun ? copy.updating : copy.reopen}</button>}</div>}<ol>{activeRun.schedule?.orderedTaskIds.map((taskId) => { const task = activeRun.dag?.tasks.find((item) => item.id === taskId); const taskState = activeRunState?.tasks.find((item) => item.taskId === taskId); return <li key={taskId}><div className="pv-axis-task-row"><span>{taskId}</span><strong>{task?.title ?? taskId}</strong><small>{(taskState?.status ?? task?.assignedFiles.join(' · ')) || copy.noFiles}</small></div>{task && taskState && <AxisGuardedWriteApproval featureState={guardedState} locale={locale === 'zh-CN' ? 'zh-CN' : 'en'} runId={activeRun.trace.runId} task={task} taskStatus={taskState.status} />}</li> })}</ol></> : <p>{copy.empty}</p>}
        {activeRunState && <AxisQualityAudit locale={locale === 'zh-CN' ? 'zh-CN' : 'en'} state={activeRunState} />}
      </div>
    </div>}
  </section>
}

function AxisGuardedCompletionEvidence({
  copy,
  evidence,
}: {
  copy: typeof COPY.en | typeof COPY['zh-CN']
  evidence: AxisGuardedSafeWriteCompletionEvidence
}): ReactElement {
  return <section className="pv-axis-quality-audit pv-axis-guarded-completion">
    <header>
      <h3><ShieldCheck size={13} />{copy.completion}</h3>
      <span>{copy.transaction} r{evidence.transactionRevision}</span>
    </header>
    <div>
      <article>
        <strong>{evidence.writes.length} {copy.files} · {evidence.gateEvidenceIds.length} {copy.gates}</strong>
        <small>{evidence.transactionId}</small>
        <time>{new Date(evidence.completedAt).toLocaleString()}</time>
      </article>
    </div>
  </section>
}

const QUALITY_EVENT_TYPES = new Set<AxisRunLifecycleEvent['type']>([
  'permission-allowed', 'permission-denied', 'checkpoint-ready', 'checkpoint-failed', 'checkpoint-skipped',
  'review-passed', 'review-failed', 'retry-scheduled',
])

function AxisQualityAudit({ locale, state }: { locale: 'en' | 'zh-CN'; state: AxisRunState }): ReactElement | null {
  const qualityAuditEvents = state.events.filter((event) => QUALITY_EVENT_TYPES.has(event.type)).slice(-6).reverse()
  if (qualityAuditEvents.length === 0) return null
  const copy = locale === 'zh-CN'
    ? { title: '质量审计', gates: '审查轮次', retries: '重试', noDetail: '无详细信息' }
    : { title: 'Quality audit', gates: 'gate cycles', retries: 'retries', noDetail: 'No detail' }
  return <section className="pv-axis-quality-audit">
    <header><h3>{copy.title}</h3><span>{state.usage.gateCyclesForFile} {copy.gates} · {state.usage.retriesForTask} {copy.retries}</span></header>
    <div>{qualityAuditEvents.map((event) => <article key={event.revision}>
      <strong>{qualityEventLabel(event.type, locale)}</strong>
      <small>{event.detail || copy.noDetail}</small>
      <time>{event.taskId ?? 'run'} · r{event.revision}</time>
    </article>)}</div>
  </section>
}

function qualityEventLabel(type: AxisRunLifecycleEvent['type'], locale: 'en' | 'zh-CN'): string {
  const labels: Partial<Record<AxisRunLifecycleEvent['type'], readonly [string, string]>> = {
    'permission-allowed': ['Permission allowed', '权限通过'],
    'permission-denied': ['Permission denied', '权限拒绝'],
    'checkpoint-ready': ['Checkpoint ready', '检查点就绪'],
    'checkpoint-failed': ['Checkpoint failed', '检查点失败'],
    'checkpoint-skipped': ['Checkpoint skipped', '无需检查点'],
    'review-passed': ['Review passed', '审查通过'],
    'review-failed': ['Review failed', '审查失败'],
    'retry-scheduled': ['Retry scheduled', '已安排重试'],
  }
  const label = labels[type]
  return label ? label[locale === 'zh-CN' ? 1 : 0] : type
}
