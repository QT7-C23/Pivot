import { BookOpen, Circle, FileCode2, Folder, FolderOpen, FolderPlus, Link2, PlayCircle, Store } from 'lucide-react'
import type { ReactElement } from 'react'
import type { ArtifactRecord, SessionRecord, WorkItemSnapshot } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'

interface ProjectOverviewWorkspaceProps {
  activeProjectPath: string
  onBrowseTemplates: () => void
  onOpenArtifact: (artifact: ArtifactRecord) => void
  onCreateProject: () => void
  onImportProject: () => void
  onOpenTask: (sessionId: string) => void
  sessions: SessionRecord[]
  workItems: WorkItemSnapshot[]
}

const COPY = {
  en: {
    artifacts: 'Artifacts', context: 'Context Sources', empty: 'Nothing here yet', overview: 'Overview',
    browseTemplates: 'Browse Templates', browseTemplatesHint: 'Start from a reusable project structure.', create: 'New Project', createFirst: 'Create New Project',
    emptyHint: 'Create a project to organize conversations, tasks, and files in one place.', importExisting: 'Import Existing Project',
    noProjects: 'No projects yet', quickGuide: 'Quick Start Guide', quickGuideHint: 'Learn the project workflow and create your first task.',
    runs: 'Runs', sessions: 'Sessions', tasks: 'Tasks', untitled: 'Select a project', watchTutorial: 'Watch Tutorial', watchTutorialHint: 'See how a project moves from an idea to a reviewed result.',
  },
  'zh-CN': {
    artifacts: '成果', context: '上下文来源', empty: '暂无内容', overview: '概览',
    browseTemplates: '浏览项目模板', browseTemplatesHint: '从可复用的项目结构开始。', create: '新建项目', createFirst: '创建新项目',
    emptyHint: '创建项目，将对话、任务和文件整理在同一处。', importExisting: '导入现有项目', noProjects: '尚无项目',
    quickGuide: '快速入门指南', quickGuideHint: '了解项目工作流并创建第一个任务。', runs: '运行', sessions: '会话', tasks: '任务', untitled: '请选择项目',
    watchTutorial: '观看教程', watchTutorialHint: '了解项目如何从想法推进到经过审查的成果。',
  },
  ja: {
    artifacts: '成果物', context: 'コンテキスト', empty: 'まだありません', overview: '概要',
    browseTemplates: 'テンプレートを見る', browseTemplatesHint: '再利用可能なプロジェクト構成から始めます。', create: '新しいプロジェクト', createFirst: 'プロジェクトを作成',
    emptyHint: 'プロジェクトを作成して、会話、タスク、ファイルを一か所に整理します。', importExisting: '既存プロジェクトを読み込む', noProjects: 'プロジェクトはまだありません',
    quickGuide: 'クイックスタート', quickGuideHint: 'プロジェクトの流れと最初のタスクの作り方を確認します。', runs: '実行', sessions: 'セッション', tasks: 'タスク', untitled: 'プロジェクトを選択',
    watchTutorial: 'チュートリアル', watchTutorialHint: 'アイデアがレビュー済みの成果になる流れを確認します。',
  },
  de: {
    artifacts: 'Artefakte', context: 'Kontextquellen', empty: 'Noch keine Einträge', overview: 'Übersicht',
    browseTemplates: 'Vorlagen ansehen', browseTemplatesHint: 'Mit einer wiederverwendbaren Projektstruktur starten.', create: 'Neues Projekt', createFirst: 'Neues Projekt erstellen',
    emptyHint: 'Erstelle ein Projekt, um Unterhaltungen, Aufgaben und Dateien zusammenzufassen.', importExisting: 'Bestehendes Projekt importieren', noProjects: 'Noch keine Projekte',
    quickGuide: 'Schnellstart', quickGuideHint: 'Lerne den Projektablauf kennen und erstelle deine erste Aufgabe.', runs: 'Ausführungen', sessions: 'Sitzungen', tasks: 'Aufgaben', untitled: 'Projekt auswählen',
    watchTutorial: 'Tutorial ansehen', watchTutorialHint: 'Sieh, wie aus einer Idee ein geprüftes Ergebnis wird.',
  },
} as const

export function ProjectOverviewWorkspace({
  activeProjectPath,
  onBrowseTemplates,
  onCreateProject,
  onImportProject,
  onOpenArtifact,
  onOpenTask,
  sessions,
  workItems,
}: ProjectOverviewWorkspaceProps): ReactElement {
  const { locale } = useLocale()
  const copy = COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  if (!activeProjectPath && sessions.length === 0) {
    return (
      <section className="pv-project-empty-state" data-figma-screen="597:6165">
        <div className="pv-project-empty-primary">
          <span className="pv-project-empty-icon"><FolderOpen aria-hidden="true" size={34} strokeWidth={1.35} /></span>
          <h1>{copy.noProjects}</h1>
          <p>{copy.emptyHint}</p>
          <div className="pv-project-empty-actions">
            <button className="primary" onClick={onCreateProject} type="button"><FolderPlus aria-hidden="true" size={15} />{copy.createFirst}</button>
            <button onClick={onImportProject} type="button"><FolderOpen aria-hidden="true" size={15} />{copy.importExisting}</button>
          </div>
        </div>
        <div className="pv-project-empty-guides">
          <EmptyGuide icon={BookOpen} hint={copy.quickGuideHint} title={copy.quickGuide} />
          <EmptyGuide icon={PlayCircle} hint={copy.watchTutorialHint} title={copy.watchTutorial} />
          <EmptyGuide icon={Store} hint={copy.browseTemplatesHint} onClick={onBrowseTemplates} title={copy.browseTemplates} />
        </div>
      </section>
    )
  }
  const projectSessions = sessions.filter((session) => !activeProjectPath || session.projectPath === activeProjectPath)
  const projectSessionIds = new Set(projectSessions.map((session) => session.id))
  const projectWorkItems = workItems.filter((item) => projectSessionIds.has(item.task.sessionId))
  const artifacts = projectWorkItems.flatMap((item) => item.artifacts)
  const runs = projectWorkItems.flatMap((item) => item.run ? [item.run] : [])
  const projectTitle = shortProjectName(activeProjectPath) || shortProjectName(projectSessions[0]?.projectPath ?? '') || copy.untitled
  const subtitle = `${projectSessions.length} ${copy.sessions.toLocaleLowerCase(locale)} · ${projectWorkItems.length} ${copy.tasks.toLocaleLowerCase(locale)} · ${artifacts.length} ${copy.artifacts.toLocaleLowerCase(locale)}`
  const contextSources = [
    activeProjectPath ? { icon: Folder, label: activeProjectPath } : null,
    ...unique(runs.map((run) => run.runtimeLabel)).map((label) => ({ icon: Link2, label })),
  ].filter((source): source is { icon: typeof Folder; label: string } => source !== null)

  return (
    <section className="pv-project-overview" data-figma-screen="63:394">
      <nav aria-label={copy.overview} className="pv-project-tabs">
        {[copy.overview, copy.sessions, copy.tasks, copy.artifacts, copy.runs].map((label, index) => (
          <button aria-current={index === 0 ? 'page' : undefined} className={index === 0 ? 'active' : ''} disabled={index !== 0} key={label} type="button">{label}</button>
        ))}
      </nav>
      <div className="pv-project-overview-scroll">
        <header className="pv-project-title">
          <div><h1>{projectTitle}</h1><p>{subtitle}</p></div>
          <button onClick={onCreateProject} type="button"><FolderPlus size={14} />{copy.create}</button>
        </header>
        <div className="pv-project-dashboard">
          <OverviewCard className="tasks" title={copy.tasks}>
            {projectWorkItems.length === 0 ? <EmptyState label={copy.empty} /> : projectWorkItems.slice(0, 5).map((item) => (
              <button className="pv-project-row" key={item.task.id} onClick={() => onOpenTask(item.task.sessionId)} type="button">
                <StatusDot status={item.task.status} />
                <span><strong>{item.task.title}</strong><small>{formatStatus(item.task.status)}</small></span>
              </button>
            ))}
          </OverviewCard>
          <OverviewCard className="artifacts" title={copy.artifacts}>
            {artifacts.length === 0 ? <EmptyState label={copy.empty} /> : artifacts.slice(0, 5).map((artifact) => (
              <button className="pv-project-row" key={artifact.id} onClick={() => onOpenArtifact(artifact)} type="button">
                <FileCode2 aria-hidden="true" size={16} strokeWidth={1.4} />
                <span><strong>{artifact.title}</strong><small>{formatArtifactType(artifact.type)}</small></span>
              </button>
            ))}
          </OverviewCard>
          <OverviewCard className="runs" title={copy.runs}>
            {runs.length === 0 ? <EmptyState label={copy.empty} /> : runs.slice(0, 4).map((run, index) => (
              <div className="pv-project-row run" key={run.id}>
                <StatusDot status={run.status} />
                <strong>{`Run #${runs.length - index} · ${run.runtimeLabel}`}</strong>
                <small>{`${run.completedSteps}/${run.totalSteps}`}</small>
                <em>{formatStatus(run.status)}</em>
              </div>
            ))}
          </OverviewCard>
          <OverviewCard className="context" title={copy.context}>
            {contextSources.length === 0 ? <EmptyState label={copy.empty} /> : (
              <div className="pv-context-source-list">
                {contextSources.map(({ icon: Icon, label }) => <span key={label} title={label}><Icon aria-hidden="true" size={12} />{compactSource(label)}</span>)}
              </div>
            )}
          </OverviewCard>
        </div>
      </div>
    </section>
  )
}

function EmptyGuide({ hint, icon: Icon, onClick, title }: { hint: string; icon: typeof BookOpen; onClick?: () => void; title: string }): ReactElement {
  const content = <><Icon aria-hidden="true" size={19} strokeWidth={1.5} /><span><strong>{title}</strong><small>{hint}</small></span></>
  return onClick
    ? <button className="pv-project-empty-guide" onClick={onClick} type="button">{content}</button>
    : <article className="pv-project-empty-guide">{content}</article>
}

function OverviewCard({ children, className, title }: { children: ReactElement | ReactElement[]; className: string; title: string }): ReactElement {
  return <section className={`pv-project-card ${className}`}><h2>{title}</h2><div>{children}</div></section>
}

function EmptyState({ label }: { label: string }): ReactElement {
  return <p className="pv-project-empty">{label}</p>
}

function StatusDot({ status }: { status: string }): ReactElement {
  const tone = /fail|cancel|reject/.test(status) ? 'danger' : /waiting|paused|queued/.test(status) ? 'attention' : /running|complete|deliver|accept|review/.test(status) ? 'accent' : 'muted'
  return <Circle aria-hidden="true" className={`pv-status-dot ${tone}`} fill="currentColor" size={7} strokeWidth={0} />
}

function shortProjectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
}

function compactSource(value: string): string {
  if (!/[\\/]/.test(value)) return value
  return shortProjectName(value) || value
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function formatStatus(value: string): string {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function formatArtifactType(value: string): string {
  return value.replaceAll('-', ' ').replace(/^./, (letter) => letter.toUpperCase())
}
