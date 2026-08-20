import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Clock3, FileCheck2, ListTodo, Play, Route } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { TaskLifecycleStatus, WorkItemSnapshot } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'

type WorkFilter = 'all' | 'active' | 'attention' | 'complete'

const COPY = {
  en: {
    eyebrow: 'TASK CENTER', title: 'Work', description: 'One place for planned, running, review-ready, and delivered work across projects.',
    all: 'All', active: 'Active', attention: 'Attention', complete: 'Complete', empty: 'No work matches this filter.',
    run: 'Run', artifacts: 'Artifacts', needsAttention: 'Needs attention', noRun: 'No run has started for this task.',
    noArtifacts: 'Artifacts will appear here when a run produces reviewable outcomes.', open: 'Open workspace', plan: 'Plan & activity',
    progress: 'steps complete', local: 'Local', remote: 'Remote', current: 'Current task', project: 'Project',
  },
  'zh-CN': {
    eyebrow: '任务中心', title: '工作', description: '集中管理跨项目的计划、运行、待审查与已交付工作。',
    all: '全部', active: '进行中', attention: '待处理', complete: '已完成', empty: '当前筛选下没有工作。',
    run: '运行', artifacts: '成果', needsAttention: '需要处理', noRun: '此任务尚未开始运行。',
    noArtifacts: '运行产生可审查成果后会显示在这里。', open: '打开工作区', plan: '计划与活动',
    progress: '个步骤已完成', local: '本地', remote: '远程', current: '当前任务', project: '项目',
  },
  ja: {
    eyebrow: 'タスクセンター', title: '作業', description: 'プロジェクトをまたいで計画、実行、レビュー、完了した作業を管理します。',
    all: 'すべて', active: '進行中', attention: '要確認', complete: '完了', empty: 'この条件に一致する作業はありません。',
    run: '実行', artifacts: '成果物', needsAttention: '確認が必要', noRun: 'このタスクはまだ実行されていません。',
    noArtifacts: 'レビュー可能な成果が生成されると、ここに表示されます。', open: 'ワークスペースを開く', plan: '計画とアクティビティ',
    progress: 'ステップ完了', local: 'ローカル', remote: 'リモート', current: '現在のタスク', project: 'プロジェクト',
  },
  de: {
    eyebrow: 'AUFGABENZENTRALE', title: 'Arbeit', description: 'Geplante, laufende, prüfbereite und abgeschlossene Arbeit projektübergreifend verwalten.',
    all: 'Alle', active: 'Aktiv', attention: 'Hinweise', complete: 'Fertig', empty: 'Für diesen Filter gibt es keine Arbeit.',
    run: 'Ausführung', artifacts: 'Ergebnisse', needsAttention: 'Aktion erforderlich', noRun: 'Für diese Aufgabe wurde noch keine Ausführung gestartet.',
    noArtifacts: 'Prüfbare Ergebnisse erscheinen hier, sobald eine Ausführung sie erzeugt.', open: 'Arbeitsbereich öffnen', plan: 'Plan und Aktivität',
    progress: 'Schritte abgeschlossen', local: 'Lokal', remote: 'Remote', current: 'Aktuelle Aufgabe', project: 'Projekt',
  },
} as const

interface WorkCenterWorkspaceProps {
  activeSessionId: string | null
  items: WorkItemSnapshot[]
  onOpenPlan: (sessionId: string) => void
  onOpenWorkspace: (sessionId: string) => void
}

export function WorkCenterWorkspace({ activeSessionId, items, onOpenPlan, onOpenWorkspace }: WorkCenterWorkspaceProps): ReactElement {
  const { locale } = useLocale()
  const copy = COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  const [filter, setFilter] = useState<WorkFilter>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => items.find((item) => item.task.sessionId === activeSessionId)?.task.id ?? items[0]?.task.id ?? null)
  const visibleItems = useMemo(() => items.filter((item) => matchesFilter(item, filter)), [filter, items])
  const selected = items.find((item) => item.task.id === selectedTaskId) ?? visibleItems[0] ?? items[0] ?? null

  useEffect(() => {
    if (selectedTaskId && items.some((item) => item.task.id === selectedTaskId)) return
    setSelectedTaskId(items.find((item) => item.task.sessionId === activeSessionId)?.task.id ?? items[0]?.task.id ?? null)
  }, [activeSessionId, items, selectedTaskId])

  return (
    <section className="pv-work-center">
      <aside className="pv-work-list">
        <header><span>{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.description}</p></header>
        <div aria-label="Work filters" className="pv-work-filters" role="group">
          {(['all', 'active', 'attention', 'complete'] as const).map((value) => (
            <button className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)} type="button">{copy[value]}</button>
          ))}
        </div>
        <div className="pv-task-list">
          {visibleItems.map((item) => (
            <button className={selected?.task.id === item.task.id ? 'active' : ''} key={item.task.id} onClick={() => setSelectedTaskId(item.task.id)} type="button">
              <StatusIcon status={item.task.status} />
              <span><strong>{item.task.title}</strong><small>{shortProjectName(item.task.projectPath)}</small></span>
              {item.attention.length > 0 && <em>{item.attention.length}</em>}
            </button>
          ))}
          {visibleItems.length === 0 && <p className="pv-work-empty">{copy.empty}</p>}
        </div>
      </aside>

      <div className="pv-task-detail">
        {selected ? (
          <>
            <header className="pv-task-header">
              <div><span>{selected.task.sessionId === activeSessionId ? copy.current : copy.project}</span><h2>{selected.task.title}</h2><p>{selected.task.projectPath}</p></div>
              <span className={`pv-task-status ${statusTone(selected.task.status)}`}>{statusLabel(selected.task.status, locale)}</span>
            </header>
            <div className="pv-task-actions">
              <button onClick={() => onOpenWorkspace(selected.task.sessionId)} type="button">{copy.open}<ArrowRight size={14} /></button>
              <button onClick={() => onOpenPlan(selected.task.sessionId)} type="button"><Route size={14} />{copy.plan}</button>
            </div>
            <div className="pv-task-content">
              <div className="pv-task-metrics">
                <article><Play size={15} /><span>{copy.run}</span><strong>{selected.run ? statusLabel(selected.task.status, locale) : '—'}</strong></article>
                <article><FileCheck2 size={15} /><span>{copy.artifacts}</span><strong>{selected.artifacts.length}</strong></article>
                <article><AlertTriangle size={15} /><span>{copy.needsAttention}</span><strong>{selected.attention.length}</strong></article>
              </div>

              <section className="pv-task-section">
                <div className="pv-section-heading"><h3>{copy.run}</h3></div>
                {selected.run ? (
                  <article className="pv-run-card">
                    <span className="pv-status-dot running" />
                    <div><strong>{selected.run.runtimeLabel}</strong><small>{selected.run.location === 'remote' ? copy.remote : copy.local} · {selected.run.completedSteps}/{selected.run.totalSteps || '—'} {copy.progress}</small></div>
                    <Clock3 size={15} />
                  </article>
                ) : <p className="pv-detail-empty">{copy.noRun}</p>}
              </section>

              {selected.attention.length > 0 && (
                <section className="pv-task-section">
                  <div className="pv-section-heading"><h3>{copy.needsAttention}</h3><span>{selected.attention.length}</span></div>
                  <div className="pv-task-attention">{selected.attention.map((item) => <article key={item.id}><AlertTriangle size={15} /><div><strong>{item.title}</strong><small>{item.detail}</small></div></article>)}</div>
                </section>
              )}

              <section className="pv-task-section">
                <div className="pv-section-heading"><h3>{copy.artifacts}</h3><span>{selected.artifacts.length}</span></div>
                {selected.artifacts.length > 0 ? <div className="pv-artifact-list">{selected.artifacts.map((artifact) => <article key={artifact.id}><FileCheck2 size={15} /><div><strong>{artifact.title}</strong><small>{artifact.type} · {artifact.status.replaceAll('_', ' ')}</small></div></article>)}</div> : <p className="pv-detail-empty">{copy.noArtifacts}</p>}
              </section>
            </div>
          </>
        ) : <div className="pv-task-detail-empty"><ListTodo size={24} /><p>{copy.empty}</p></div>}
      </div>
    </section>
  )
}

function matchesFilter(item: WorkItemSnapshot, filter: WorkFilter): boolean {
  if (filter === 'attention') return item.attention.length > 0
  if (filter === 'complete') return item.task.status === 'delivered' || item.task.status === 'cancelled'
  if (filter === 'active') return !['draft', 'delivered', 'cancelled'].includes(item.task.status)
  return true
}

function StatusIcon({ status }: { status: TaskLifecycleStatus }): ReactElement {
  if (status === 'delivered') return <CheckCircle2 aria-hidden="true" size={15} />
  if (status === 'waiting_permission' || status === 'failed_recoverable' || status === 'failed_terminal') return <AlertTriangle aria-hidden="true" size={15} />
  return <CircleDot aria-hidden="true" size={15} />
}

function statusTone(status: TaskLifecycleStatus): string {
  if (status === 'delivered') return 'success'
  if (status === 'waiting_permission' || status === 'paused') return 'attention'
  if (status === 'failed_recoverable' || status === 'failed_terminal') return 'danger'
  return status.startsWith('running') || status === 'background' ? 'running' : 'neutral'
}

function statusLabel(status: TaskLifecycleStatus, locale: string): string {
  const labels: Record<TaskLifecycleStatus, { de: string; en: string; ja: string; zh: string }> = {
    draft: { de: 'Entwurf', en: 'Draft', ja: '下書き', zh: '草稿' }, plan_ready: { de: 'Plan bereit', en: 'Plan ready', ja: '計画準備完了', zh: '计划就绪' }, queued: { de: 'Eingereiht', en: 'Queued', ja: '待機中', zh: '排队中' },
    running_local: { de: 'Läuft lokal', en: 'Running locally', ja: 'ローカル実行中', zh: '本地运行中' }, running_remote: { de: 'Läuft remote', en: 'Running remotely', ja: 'リモート実行中', zh: '远程运行中' }, background: { de: 'Im Hintergrund', en: 'Background', ja: 'バックグラウンド', zh: '后台运行' },
    paused: { de: 'Pausiert', en: 'Paused', ja: '一時停止', zh: '已暂停' }, waiting_permission: { de: 'Berechtigung nötig', en: 'Permission required', ja: '権限待ち', zh: '等待权限' }, waiting_question: { de: 'Wartet auf Antwort', en: 'Waiting for answer', ja: '回答待ち', zh: '等待回答' },
    failed_recoverable: { de: 'Wiederherstellbar', en: 'Recovery available', ja: '復旧可能', zh: '可恢复失败' }, failed_terminal: { de: 'Beendet', en: 'Stopped', ja: '停止', zh: '已停止' }, review_ready: { de: 'Prüfung bereit', en: 'Review ready', ja: 'レビュー待ち', zh: '等待审查' },
    delivered: { de: 'Geliefert', en: 'Delivered', ja: '納品済み', zh: '已交付' }, cancelled: { de: 'Abgebrochen', en: 'Cancelled', ja: 'キャンセル済み', zh: '已取消' },
  }
  return locale === 'zh-CN' ? labels[status].zh : locale === 'ja' ? labels[status].ja : locale === 'de' ? labels[status].de : labels[status].en
}

function shortProjectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Workspace'
}
