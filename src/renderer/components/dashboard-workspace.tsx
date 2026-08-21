import { AlertTriangle, Bot, CheckCircle2, FileCheck2, FolderPlus, Gauge, PlayCircle, Settings2, X } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import type { SessionRecord, WorkItemSnapshot } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'
import type { AgentOperation } from '../stores/agent.store'
import { useUpdateStore } from '../stores/update.store'

const COPY = {
  en: {
    greeting: (period: string) => `Good ${period}`,
    createProject: 'Create Project', urgent: 'Urgent Tasks', running: 'Running Tasks', completed: 'Completed', delivery: 'Project Delivery',
    attention: 'Attention', activity: 'Agent Activity', activeTasks: 'Active Tasks', runs: 'Local / Remote Runs', continue: 'Continue', artifacts: 'Recent Artifacts',
    noAttention: 'No items need your attention.', noActivity: 'No recent agent activity.', noTasks: 'No active tasks.', noRuns: 'No recent runs.', noSessions: 'Open a project to start your first workspace.', noArtifacts: 'No artifacts yet.',
    workspace: 'Workspace snapshot', calendar: 'Calendar', tip: 'Tip', tipBody: 'Open a project and start a session to turn this dashboard into a live view of your work.',
    update: (version: string) => `Pivot ${version} is available.`, updateAction: 'Update now', restartAction: 'Restart & install', needsAttention: 'need attention', tasks: 'tasks', onTrack: 'On track', delayed: 'Delayed',
  },
  'zh-CN': {
    greeting: (period: string) => `${period}好`,
    createProject: '创建项目', urgent: '紧急任务', running: '运行中任务', completed: '已完成', delivery: '项目交付',
    attention: '待处理', activity: 'Agent 活动', activeTasks: '活动任务', runs: '本地 / 远程运行', continue: '继续', artifacts: '最近成果',
    noAttention: '当前没有需要处理的事项。', noActivity: '暂无 Agent 活动。', noTasks: '暂无活动任务。', noRuns: '暂无运行记录。', noSessions: '打开项目以创建第一个工作区。', noArtifacts: '暂无成果。',
    workspace: '工作区概览', calendar: '日历', tip: '提示', tipBody: '打开项目并启动会话后，此处会实时呈现你的工作状态。',
    update: (version: string) => `Pivot ${version} 已可用。`, updateAction: '立即更新', restartAction: '重启并安装', needsAttention: '项需要处理', tasks: '个任务', onTrack: '按计划', delayed: '延期',
  },
} as const

interface DashboardWorkspaceProps {
  attentionMessage: string | null
  isStreaming: boolean
  onCreateProject: () => void
  onOpenSession: (session: SessionRecord) => Promise<void>
  operations: AgentOperation[]
  sessions: SessionRecord[]
  workItems: WorkItemSnapshot[]
}

type DashboardCard = 'activity' | 'artifacts' | 'attention' | 'calendar' | 'continue' | 'runs' | 'tasks' | 'tip' | 'update'
const DASHBOARD_CARDS: DashboardCard[] = ['update', 'attention', 'tasks', 'continue', 'activity', 'runs', 'artifacts', 'calendar', 'tip']
const DEFAULT_DASHBOARD_LAYOUT = Object.fromEntries(DASHBOARD_CARDS.map((card) => [card, true])) as Record<DashboardCard, boolean>
const DASHBOARD_LAYOUT_KEY = 'pivot:dashboard-layout:v1'

export function DashboardWorkspace({ attentionMessage, isStreaming, onCreateProject, onOpenSession, operations, sessions, workItems }: DashboardWorkspaceProps): ReactElement {
  const { locale } = useLocale()
  const copy = COPY[locale === 'zh-CN' ? 'zh-CN' : 'en']
  const updateState = useUpdateStore((state) => state.state)
  const loadUpdate = useUpdateStore((state) => state.load)
  const downloadUpdate = useUpdateStore((state) => state.download)
  const installUpdate = useUpdateStore((state) => state.install)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [layout, setLayout] = useState<Record<DashboardCard, boolean>>(readDashboardLayout)
  useEffect(() => { if (!updateState) void loadUpdate() }, [loadUpdate, updateState])

  const recentSessions = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3)
  const attentionItems = workItems.flatMap((item) => item.attention)
  const activeWork = workItems.filter((item) => !['delivered', 'cancelled'].includes(item.task.status))
  const activeRuns = workItems.filter((item) => item.run && !['completed', 'cancelled'].includes(item.run.status))
  const completedCount = workItems.filter((item) => item.task.status === 'delivered').length
  const deliveryPercent = workItems.length === 0 ? 0 : Math.round((completedCount / workItems.length) * 100)
  const artifacts = workItems.flatMap((item) => item.artifacts).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4)
  const urgentCount = attentionItems.length + (attentionMessage ? 1 : 0)
  const now = new Date()
  const period = locale === 'zh-CN' ? (now.getHours() < 12 ? '早上' : now.getHours() < 18 ? '下午' : '晚上') : (now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening')
  const showUpdate = updateState?.status === 'available' || updateState?.status === 'downloaded'

  return (
    <div className="pv-now-workspace pv-dashboard" data-figma-screen="1026:8514">
      {layout.update && showUpdate && <section className="pv-dashboard-update" aria-live="polite"><span><Gauge size={16} />{copy.update(updateState.availableVersion ?? updateState.currentVersion)}</span><button onClick={() => void (updateState.status === 'downloaded' ? installUpdate() : downloadUpdate())} type="button">{updateState.status === 'downloaded' ? copy.restartAction : copy.updateAction}</button></section>}

      <header className="pv-dashboard-greeting">
        <div><h1>{copy.greeting(period)}</h1><time dateTime={now.toISOString()}>{formatDashboardDate(now, locale)}</time></div>
        <div><button aria-expanded={settingsOpen} aria-label="Dashboard Settings" className="icon" onClick={() => setSettingsOpen((open) => !open)} type="button"><Settings2 size={16} /></button><button className="primary" onClick={onCreateProject} type="button"><FolderPlus size={15} />{copy.createProject}</button></div>
      </header>
      {settingsOpen && <DashboardSettings layout={layout} onClose={() => setSettingsOpen(false)} onToggle={(card) => setLayout((current) => { const next = { ...current, [card]: !current[card] }; window.localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(next)); return next })} />}

      <section className="pv-dashboard-metrics" aria-label={copy.workspace}>
        <MetricCard detail={copy.needsAttention} label={copy.urgent} tone="danger" value={urgentCount} />
        <MetricCard detail={isStreaming ? 'Active' : copy.tasks} label={copy.running} tone="active" value={activeWork.length} />
        <MetricCard detail={copy.tasks} label={copy.completed} progress={deliveryPercent} tone="complete" value={completedCount} />
        <DeliveryMetric copy={copy} percent={deliveryPercent} />
      </section>

      <div className="pv-dashboard-grid">
        <div className="pv-dashboard-main-column">
          {layout.attention && <DashboardPanel className="pv-dashboard-attention" title={copy.attention}><div className="pv-dashboard-rows">{attentionMessage && <DashboardRow detail={attentionMessage} icon={<AlertTriangle size={13} />} tone="danger" />}{attentionItems.slice(0, 4).map((item) => <DashboardRow detail={item.detail} icon={<AlertTriangle size={13} />} key={item.id} title={item.title} tone="warning" />)}{!attentionMessage && attentionItems.length === 0 && <EmptyRow icon={<CheckCircle2 size={14} />} text={copy.noAttention} />}</div></DashboardPanel>}

          {layout.tasks && <DashboardPanel className="pv-dashboard-active-tasks" title={copy.activeTasks}><div className="pv-dashboard-task-list">{activeWork.slice(0, 4).map((item) => { const progress = item.run?.totalSteps ? Math.round((item.run.completedSteps / item.run.totalSteps) * 100) : 0; return <article key={item.task.id}><span><strong>{item.task.title}</strong><em>{item.task.status.replaceAll('_', ' ')}</em></span><div><i style={{ width: `${progress}%` }} /></div><small>{progress}%</small></article> })}{activeWork.length === 0 && <EmptyRow icon={<PlayCircle size={14} />} text={copy.noTasks} />}</div></DashboardPanel>}

          {layout.continue && <DashboardPanel className="pv-dashboard-continue" title={copy.continue}><div className="pv-dashboard-session-list">{recentSessions.map((session) => <button key={session.id} onClick={() => void onOpenSession(session)} type="button"><span><strong>{session.title}</strong><small>{shortProjectName(session.projectPath)}</small></span><time>{formatRelativeTime(session.updatedAt, locale)}</time><b>{copy.continue}</b></button>)}{recentSessions.length === 0 && <EmptyRow icon={<PlayCircle size={14} />} text={copy.noSessions} />}</div></DashboardPanel>}
        </div>

        <aside className="pv-dashboard-side-column">
          {layout.activity && <DashboardPanel className="pv-dashboard-agent-activity" title={copy.activity}><div className="pv-dashboard-rows">{operations.slice(-4).reverse().map((operation) => <DashboardRow detail={operation.status} icon={<Bot size={13} />} key={operation.id} title={operation.description} tone={operation.status === 'error' ? 'danger' : operation.status === 'running' ? 'active' : 'complete'} />)}{operations.length === 0 && <EmptyRow icon={<Bot size={14} />} text={copy.noActivity} />}</div></DashboardPanel>}

          {layout.runs && <DashboardPanel className="pv-dashboard-runs" title={copy.runs}><div className="pv-dashboard-run-summary"><RunColumn items={workItems} location="local" /><RunColumn items={workItems} location="remote" /></div>{activeRuns.length === 0 && <small className="pv-dashboard-panel-empty">{copy.noRuns}</small>}</DashboardPanel>}

          {layout.artifacts && <DashboardPanel className="pv-dashboard-artifacts" title={copy.artifacts}><div className="pv-dashboard-artifact-list">{artifacts.map((artifact) => <article key={artifact.id}><FileCheck2 size={13} /><span><strong>{artifact.title}</strong><small>{artifact.type} · {formatRelativeTime(artifact.updatedAt, locale)}</small></span></article>)}{artifacts.length === 0 && <EmptyRow icon={<FileCheck2 size={14} />} text={copy.noArtifacts} />}</div></DashboardPanel>}

          {layout.calendar && <DashboardPanel className="pv-dashboard-calendar" title={copy.calendar}><Calendar date={now} locale={locale} /></DashboardPanel>}
          {layout.tip && <DashboardPanel className="pv-dashboard-tip" title={copy.tip}><p>{copy.tipBody}</p></DashboardPanel>}
        </aside>
      </div>
    </div>
  )
}

function DashboardSettings({ layout, onClose, onToggle }: { layout: Record<DashboardCard, boolean>; onClose: () => void; onToggle: (card: DashboardCard) => void }): ReactElement {
  return <aside className="pv-dashboard-settings" data-figma-screen="1332:9449"><header><h2>Dashboard Settings</h2><button aria-label="Close dashboard settings" onClick={onClose} type="button"><X size={16} /></button></header><p>Choose which cards to display on your dashboard.</p><section><h3>TOP BANNER</h3><DashboardToggle card="update" label="Update Notification" layout={layout} onToggle={onToggle} /></section><section><h3>LEFT COLUMN</h3><DashboardToggle card="attention" label="Attention" layout={layout} onToggle={onToggle} /><DashboardToggle card="tasks" label="Active Tasks" layout={layout} onToggle={onToggle} /><DashboardToggle card="continue" label="Continue" layout={layout} onToggle={onToggle} /></section><section><h3>RIGHT COLUMN</h3><DashboardToggle card="activity" label="Agent Activity" layout={layout} onToggle={onToggle} /><DashboardToggle card="runs" label="Local / Remote Runs" layout={layout} onToggle={onToggle} /><DashboardToggle card="artifacts" label="Recent Artifacts" layout={layout} onToggle={onToggle} /><DashboardToggle card="calendar" label="Calendar" layout={layout} onToggle={onToggle} /><DashboardToggle card="tip" label="Tip of the Day" layout={layout} onToggle={onToggle} /></section><button className="reset" onClick={() => { for (const card of DASHBOARD_CARDS) if (!layout[card]) onToggle(card) }} type="button">Reset to Default</button></aside>
}
function DashboardToggle({ card, label, layout, onToggle }: { card: DashboardCard; label: string; layout: Record<DashboardCard, boolean>; onToggle: (card: DashboardCard) => void }): ReactElement { return <label><span>{label}</span><input checked={layout[card]} onChange={() => onToggle(card)} type="checkbox" /></label> }
function readDashboardLayout(): Record<DashboardCard, boolean> { if (typeof window === 'undefined') return DEFAULT_DASHBOARD_LAYOUT; try { const parsed = JSON.parse(window.localStorage.getItem(DASHBOARD_LAYOUT_KEY) ?? '{}') as Record<string, unknown>; return Object.fromEntries(DASHBOARD_CARDS.map((card) => [card, typeof parsed[card] === 'boolean' ? parsed[card] : true])) as Record<DashboardCard, boolean> } catch { return DEFAULT_DASHBOARD_LAYOUT } }

function MetricCard({ detail, label, progress, tone, value }: { detail: string; label: string; progress?: number; tone: string; value: number }): ReactElement { return <article className={`pv-dashboard-metric ${tone}`}><header><span>{label}</span></header><div><strong>{value}</strong><small>{detail}</small></div><i><b style={{ width: `${progress ?? Math.min(100, value * 8)}%` }} /></i></article> }
function DeliveryMetric({ copy, percent }: { copy: typeof COPY.en | typeof COPY['zh-CN']; percent: number }): ReactElement { return <article className="pv-dashboard-metric delivery"><header><span>{copy.delivery}</span></header><div className="pv-dashboard-delivery"><strong style={{ '--progress': `${percent * 3.6}deg` } as CSSProperties}>{percent}%</strong><small><i />{percent >= 50 ? copy.onTrack : copy.delayed}</small></div></article> }
function DashboardPanel({ children, className, title }: { children: ReactNode; className: string; title: string }): ReactElement { return <section className={`pv-dashboard-panel ${className}`}><h2>{title}</h2>{children}</section> }
function DashboardRow({ detail, icon, title, tone }: { detail: string; icon: ReactNode; title?: string; tone: string }): ReactElement { return <article className={`pv-dashboard-row ${tone}`}>{icon}<span>{title && <strong>{title}</strong>}<small>{detail}</small></span></article> }
function EmptyRow({ icon, text }: { icon: ReactNode; text: string }): ReactElement { return <div className="pv-dashboard-empty">{icon}<span>{text}</span></div> }
function RunColumn({ items, location }: { items: WorkItemSnapshot[]; location: 'local' | 'remote' }): ReactElement { const runs = items.flatMap((item) => item.run ? [item.run] : []).filter((run) => run.location === location); const completed = runs.filter((run) => run.status === 'completed').length; const failed = runs.filter((run) => run.status === 'failed').length; return <div><span>{location.toUpperCase()}</span><strong>{runs.length}</strong><small>Success <b>{completed}</b></small><i><b style={{ width: `${runs.length ? Math.round((completed / runs.length) * 100) : 0}%` }} /></i><small>Failed <b>{failed}</b></small></div> }
function Calendar({ date, locale }: { date: Date; locale: string }): ReactElement { const first = new Date(date.getFullYear(), date.getMonth(), 1); const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(); const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)]; return <div className="pv-dashboard-calendar-grid"><strong>{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date)}</strong><div>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <b key={`${day}-${index}`}>{day}</b>)}{cells.map((day, index) => <span className={day === date.getDate() ? 'today' : ''} key={`${day}-${index}`}>{day}</span>)}</div></div> }
function shortProjectName(value: string): string { return value.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Workspace' }
function formatDashboardDate(value: Date, locale: string): string { return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(value) }
function formatRelativeTime(value: string, locale: string): string { const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000)); const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }); if (minutes < 60) return formatter.format(-minutes, 'minute'); const hours = Math.round(minutes / 60); return hours < 24 ? formatter.format(-hours, 'hour') : formatter.format(-Math.round(hours / 24), 'day') }
