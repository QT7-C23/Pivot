import { ArrowRight, Clock3, FileCheck2, FolderInput, FolderPlus, LayoutTemplate, PlayCircle, ShieldAlert } from 'lucide-react'
import type { ReactElement } from 'react'
import type { SessionRecord, WorkItemSnapshot } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'

const NOW_COPY = {
  en: { title: 'Now', overview: 'Live workspace overview', continue: 'Continue', completed: 'Completed', empty: 'Open a project to create your first continuous AI workspace.', attention: 'Attention', ready: 'All systems are ready for work.', streaming: 'An agent is currently working.', operations: (count: number) => `${count} recent agent operations.`, runs: 'Local / Remote Runs', noRuns: 'No active runs.', artifacts: 'Recent Artifacts', noArtifacts: 'No artifacts yet.', new: 'New', newProject: 'New Project', newProjectHint: 'Create a local workspace and connect a runtime.', newAutomation: 'New Automation', newAutomationHint: 'Schedule or trigger repeatable work.', importProject: 'Import Project', importProjectHint: 'Bring an existing workspace into Pivot.', browseTemplates: 'Browse Templates', browseTemplatesHint: 'Start from a reusable workflow.' },
  'zh-CN': { title: '现在', overview: '实时工作区概览', continue: '继续', completed: '已完成', empty: '打开一个项目，创建你的第一个连续 AI 工作区。', attention: '待处理', ready: '所有系统均已就绪。', streaming: 'Agent 正在执行工作。', operations: (count: number) => `最近有 ${count} 条 Agent 操作记录。`, runs: '本地 / 远程运行', noRuns: '暂无活动运行。', artifacts: '最近成果', noArtifacts: '暂无成果。', new: '新建', newProject: '新建项目', newProjectHint: '创建本地工作区并连接运行时。', newAutomation: '新建自动化', newAutomationHint: '安排定时或触发式重复工作。', importProject: '导入项目', importProjectHint: '将现有工作区带入 Pivot。', browseTemplates: '浏览模板', browseTemplatesHint: '从可复用工作流开始。' },
  ja: { title: '現在', overview: 'ライブワークスペース概要', continue: '続ける', completed: '完了', empty: 'プロジェクトを開いて、最初の連続 AI ワークスペースを作成します。', attention: '要確認', ready: 'すべてのシステムが準備できています。', streaming: 'Agent が作業中です。', operations: (count: number) => `最近の Agent 操作: ${count} 件`, runs: 'ローカル / リモート実行', noRuns: '実行中のタスクはありません。', artifacts: '最近の成果物', noArtifacts: '成果物はまだありません。', new: '新規', newProject: '新しいプロジェクト', newProjectHint: 'ローカルワークスペースとランタイムを設定します。', newAutomation: '新しい自動化', newAutomationHint: '反復作業をスケジュールします。', importProject: 'プロジェクトをインポート', importProjectHint: '既存のワークスペースを Pivot に追加します。', browseTemplates: 'テンプレートを見る', browseTemplatesHint: '再利用可能なワークフローから始めます。' },
  de: { title: 'Jetzt', overview: 'Live-Arbeitsbereich', continue: 'Fortsetzen', completed: 'Abgeschlossen', empty: 'Öffne ein Projekt, um deinen ersten durchgängigen KI-Arbeitsbereich zu erstellen.', attention: 'Hinweise', ready: 'Alle Systeme sind bereit.', streaming: 'Ein Agent arbeitet gerade.', operations: (count: number) => `${count} aktuelle Agent-Vorgänge.`, runs: 'Lokale / Remote-Ausführungen', noRuns: 'Keine aktiven Ausführungen.', artifacts: 'Aktuelle Ergebnisse', noArtifacts: 'Noch keine Ergebnisse.', new: 'Neu', newProject: 'Neues Projekt', newProjectHint: 'Lokalen Arbeitsbereich und Laufzeit einrichten.', newAutomation: 'Neue Automation', newAutomationHint: 'Wiederkehrende Arbeit planen oder auslösen.', importProject: 'Projekt importieren', importProjectHint: 'Einen vorhandenen Arbeitsbereich hinzufügen.', browseTemplates: 'Vorlagen durchsuchen', browseTemplatesHint: 'Mit einem wiederverwendbaren Ablauf beginnen.' },
} as const

interface NowWorkspaceProps {
  attentionMessage: string | null
  isStreaming: boolean
  onCreateProject: () => void
  onNavigateToAutomations: () => void
  onNavigateToExtensions: () => void
  onNavigateToProjects: () => void
  onOpenSession: (session: SessionRecord) => Promise<void>
  operationCount: number
  sessions: SessionRecord[]
  workItems: WorkItemSnapshot[]
}

export function NowWorkspace({
  attentionMessage,
  isStreaming,
  onCreateProject,
  onNavigateToAutomations,
  onNavigateToExtensions,
  onNavigateToProjects,
  onOpenSession,
  operationCount,
  sessions,
  workItems,
}: NowWorkspaceProps): ReactElement {
  const { locale } = useLocale()
  const copy = NOW_COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  const recentSessions = [...sessions]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 3)
  const allAttentionItems = workItems.flatMap((item) => item.attention)
  const attentionItems = allAttentionItems.slice(0, 3)
  const activeRuns = workItems.filter((item) => item.run && !['completed', 'cancelled'].includes(item.run.status))
  const allArtifacts = workItems
    .flatMap((item) => item.artifacts)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const recentArtifacts = allArtifacts.slice(0, 3)
  const attentionCount = allAttentionItems.length + (attentionMessage ? 1 : 0)
  const completedWorkCount = workItems.filter((item) => item.task.status === 'delivered').length

  return (
    <div className="pv-now-workspace" data-figma-screen="1026:8514">
      <header className="pv-now-hero">
        <div><h1>{copy.title}</h1><p>{copy.overview}</p></div>
        <button className="pv-now-primary-action" onClick={onCreateProject} type="button"><FolderPlus size={15} />{copy.newProject}</button>
      </header>

      <section aria-label={copy.overview} className="pv-now-summary-grid">
        <SummaryCard label={copy.attention} tone={attentionCount > 0 ? 'attention' : 'accent'} value={attentionCount} />
        <SummaryCard label={copy.runs} tone={activeRuns.length > 0 ? 'running' : 'muted'} value={activeRuns.length} />
        <SummaryCard label={copy.completed} tone="accent" value={completedWorkCount} />
        <SummaryCard label={copy.artifacts} tone="accent" value={allArtifacts.length} />
      </section>

      <div className="pv-now-dashboard">
        <div className="pv-now-primary">
          <section className="pv-now-section">
            <div className="pv-section-heading"><h2>{copy.continue}</h2><span>{recentSessions.length}</span></div>
            <div className="pv-continue-grid">
              {recentSessions.map((session) => (
                <button className="pv-continue-card" key={session.id} onClick={() => void onOpenSession(session)} type="button">
                  <strong>{session.title}</strong>
                  <span>{shortProjectName(session.projectPath)} · {formatRelativeTime(session.updatedAt, locale)}</span>
                  <ArrowRight aria-hidden="true" size={15} />
                </button>
              ))}
              {recentSessions.length === 0 && <div className="pv-empty-card">{copy.empty}</div>}
            </div>
          </section>

          <section className="pv-now-section">
            <div className="pv-section-heading"><h2>{copy.attention}</h2>{attentionCount > 0 && <span>{attentionCount}</span>}</div>
            <div className="pv-attention-list">
              {attentionMessage && <article className="pv-attention-item warning"><ShieldAlert size={16} /><span>{attentionMessage}</span></article>}
              {attentionItems.map((item) => <article className="pv-attention-item warning" key={item.id}><ShieldAlert size={16} /><span><strong>{item.title}</strong><small>{item.detail}</small></span></article>)}
              {!attentionMessage && attentionItems.length === 0 && <article className="pv-attention-item"><span className="pv-status-dot" />{copy.ready}</article>}
              {(isStreaming || operationCount > 0) && <article className="pv-attention-item"><span className="pv-status-dot running" />{isStreaming ? copy.streaming : copy.operations(operationCount)}</article>}
            </div>
          </section>

          <section className="pv-now-section">
            <div className="pv-section-heading"><h2>{copy.new}</h2></div>
            <div className="pv-new-grid">
              <button onClick={onCreateProject} type="button"><FolderPlus size={18} /><span><strong>{copy.newProject}</strong><small>{copy.newProjectHint}</small></span></button>
              <button onClick={onNavigateToAutomations} type="button"><Clock3 size={18} /><span><strong>{copy.newAutomation}</strong><small>{copy.newAutomationHint}</small></span></button>
              <button onClick={onNavigateToProjects} type="button"><FolderInput size={18} /><span><strong>{copy.importProject}</strong><small>{copy.importProjectHint}</small></span></button>
              <button onClick={onNavigateToExtensions} type="button"><LayoutTemplate size={18} /><span><strong>{copy.browseTemplates}</strong><small>{copy.browseTemplatesHint}</small></span></button>
            </div>
          </section>
        </div>

        <aside className="pv-now-secondary">
          <section className="pv-now-section">
            <div className="pv-section-heading"><h2>{copy.runs}</h2></div>
            <div className="pv-now-list">
              {activeRuns.slice(0, 3).map((item) => <article key={item.run!.id}><PlayCircle size={16} /><span><strong>{item.task.title}</strong><small>{item.run!.runtimeLabel} · {item.run!.location} · {item.run!.completedSteps}/{item.run!.totalSteps || '—'}</small></span><em>{item.run!.status}</em></article>)}
              {activeRuns.length === 0 && <div className="pv-empty-row">{copy.noRuns}</div>}
            </div>
          </section>

          <section className="pv-now-section">
            <div className="pv-section-heading"><h2>{copy.artifacts}</h2></div>
            <div className="pv-now-list">
              {recentArtifacts.map((artifact) => <article key={artifact.id}><FileCheck2 size={16} /><span><strong>{artifact.title}</strong><small>{artifact.type} · {formatRelativeTime(artifact.updatedAt, locale)}</small></span><em>{artifact.status.replaceAll('_', ' ')}</em></article>)}
              {recentArtifacts.length === 0 && <div className="pv-empty-row">{copy.noArtifacts}</div>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function SummaryCard({ label, tone, value }: { label: string; tone: 'accent' | 'attention' | 'muted' | 'running'; value: number }): ReactElement {
  return (
    <article className={`pv-now-summary ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <i aria-hidden="true" />
    </article>
  )
}

function shortProjectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Workspace'
}

function formatRelativeTime(value: string, locale: string): string {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000))
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  if (minutes < 1) return formatter.format(0, 'minute')
  if (minutes < 60) return formatter.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return formatter.format(-hours, 'hour')
  return formatter.format(-Math.round(hours / 24), 'day')
}
