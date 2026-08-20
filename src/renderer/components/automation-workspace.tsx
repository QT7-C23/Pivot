import { CalendarDays, Clock3, FolderSync, GitPullRequest, LayoutTemplate, Plus, Search, Workflow } from 'lucide-react'
import type { ReactElement } from 'react'
import { useLocale } from '../i18n/locale-context'

export interface AutomationSummary {
  id: string
  lastRunAt: string | null
  schedule: string
  status: 'active' | 'paused'
  title: string
}

export interface AutomationWorkspaceSnapshot {
  items: AutomationSummary[]
  runtimeAvailable: boolean
  selectedId: string | null
}

const COPY = {
  en: { attention: 'Attention', automations: 'Automations', background: 'Background', browse: 'Browse Templates', config: 'Config', create: 'Create Automation', details: 'Details', empty: 'No automations yet', emptyHint: 'Build repeatable workflows for routine development work.', history: 'History', logs: 'Logs', pipelines: 'Pipelines', queue: 'Queue', scheduled: 'Scheduled', search: 'Search pipelines…', unavailable: 'Scheduler runtime unavailable' },
  'zh-CN': { attention: '待处理', automations: '自动化', background: '后台运行', browse: '浏览模板', config: '配置', create: '创建自动化', details: '详情', empty: '尚无自动化', emptyHint: '为重复的开发工作构建可复用工作流。', history: '历史', logs: '日志', pipelines: '流水线', queue: '队列', scheduled: '已计划', search: '搜索流水线…', unavailable: '调度运行时尚不可用' },
  ja: { attention: '要確認', automations: '自動化', background: 'バックグラウンド', browse: 'テンプレートを見る', config: '設定', create: '自動化を作成', details: '詳細', empty: '自動化はまだありません', emptyHint: '繰り返し行う開発作業を再利用可能なワークフローにします。', history: '履歴', logs: 'ログ', pipelines: 'パイプライン', queue: 'キュー', scheduled: 'スケジュール', search: 'パイプラインを検索…', unavailable: 'スケジューラは利用できません' },
  de: { attention: 'Hinweise', automations: 'Automationen', background: 'Hintergrund', browse: 'Vorlagen ansehen', config: 'Konfiguration', create: 'Automation erstellen', details: 'Details', empty: 'Noch keine Automationen', emptyHint: 'Erstelle wiederverwendbare Abläufe für routinemäßige Entwicklungsarbeit.', history: 'Verlauf', logs: 'Protokolle', pipelines: 'Pipelines', queue: 'Warteschlange', scheduled: 'Geplant', search: 'Pipelines suchen…', unavailable: 'Scheduler-Laufzeit nicht verfügbar' },
} as const

export function AutomationWorkspace({ onBrowseTemplates, snapshot }: { onBrowseTemplates: () => void; snapshot: AutomationWorkspaceSnapshot }): ReactElement {
  const { locale } = useLocale()
  const copy = COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  const selected = snapshot.items.find((item) => item.id === snapshot.selectedId) ?? null

  if (snapshot.items.length === 0) {
    return (
      <section className="pv-automation-empty-layout" data-figma-screen="597:6278">
        <aside className="pv-automation-pipelines">
          <header><strong>{copy.pipelines}</strong><button aria-label={copy.create} disabled={!snapshot.runtimeAvailable} title={copy.unavailable} type="button"><Plus size={15} /></button></header>
          <label><Search aria-hidden="true" size={13} /><input aria-label={copy.search} placeholder={copy.search} type="search" /></label>
          <p>{copy.empty}</p>
        </aside>
        <main className="pv-automation-empty-state">
          <span className="pv-automation-empty-icon"><Workflow aria-hidden="true" size={34} strokeWidth={1.35} /></span>
          <h1>{copy.empty}</h1><p>{copy.emptyHint}</p>
          <div className="pv-automation-empty-actions">
            <button className="primary" disabled={!snapshot.runtimeAvailable} title={copy.unavailable} type="button"><Plus size={15} />{copy.create}</button>
            <button onClick={onBrowseTemplates} type="button"><LayoutTemplate size={15} />{copy.browse}</button>
          </div>
          <div className="pv-automation-examples" aria-label={copy.browse}>
            <AutomationExample icon={CalendarDays} title={locale === 'zh-CN' ? '每日代码摘要' : 'Daily code summary'} />
            <AutomationExample icon={GitPullRequest} title={locale === 'zh-CN' ? '拉取请求检查' : 'Pull request check'} />
            <AutomationExample icon={FolderSync} title={locale === 'zh-CN' ? '项目文件同步' : 'Project file sync'} />
          </div>
        </main>
      </section>
    )
  }

  return (
    <section className="pv-automation-workspace" data-figma-screen="71:1234">
      <aside className="pv-automation-context">
        <header><strong>{copy.automations}</strong><small>{`${snapshot.items.length} ${copy.scheduled.toLocaleLowerCase(locale)}`}</small></header>
        <h2>{copy.scheduled}</h2>
        {snapshot.items.length === 0 ? <p>{copy.empty}</p> : snapshot.items.map((item) => <div key={item.id}><Clock3 size={12} /><span><strong>{item.title}</strong><small>{item.schedule}</small></span></div>)}
        <h2>{copy.background}</h2>
        <h2>{copy.attention}</h2>
      </aside>
      <main className="pv-automation-main">
        <header><div><strong>{selected?.title ?? copy.automations}</strong><small>{selected?.schedule ?? copy.unavailable}</small></div></header>
        <nav><button className="active" type="button">{copy.queue}</button><button disabled type="button">{copy.history}</button><button disabled type="button">{copy.config}</button></nav>
        <div className="pv-automation-empty"><Workflow aria-hidden="true" size={24} /><strong>{copy.empty}</strong><p>{copy.emptyHint}</p></div>
      </main>
      <aside className="pv-automation-inspector">
        <header><button className="active" type="button">{copy.details}</button><button disabled type="button">{copy.logs}</button></header>
        <section><h2>{copy.config}</h2><div><span>{copy.scheduled}</span><strong>{snapshot.items.length}</strong></div><div><span>Runtime</span><strong>{snapshot.runtimeAvailable ? 'Ready' : copy.unavailable}</strong></div></section>
      </aside>
    </section>
  )
}

function AutomationExample({ icon: Icon, title }: { icon: typeof Workflow; title: string }): ReactElement {
  return <article className="pv-automation-example"><Icon aria-hidden="true" size={18} strokeWidth={1.5} /><strong>{title}</strong></article>
}
