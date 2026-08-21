import { ChevronDown, Folder, Plus, Search, Settings, Square } from 'lucide-react'
import { useMemo, useState, type ReactElement } from 'react'
import type { SessionRecord } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'

const COPY = {
  en: { sessions: 'Sessions', empty: 'No sessions yet', sessionCount: (count: number) => `${count} sessions` },
  'zh-CN': { sessions: '会话', empty: '暂无会话', sessionCount: (count: number) => `${count} 个会话` },
  ja: { sessions: 'セッション', empty: 'セッションはありません', sessionCount: (count: number) => `${count} セッション` },
  de: { sessions: 'Sitzungen', empty: 'Noch keine Sitzungen', sessionCount: (count: number) => `${count} Sitzungen` },
} as const

interface WorkspaceContextSidebarProps {
  activeSessionId: string | null
  onOpenSession: (session: SessionRecord) => Promise<void>
  onCreateProject?: () => void
  onOpenSettings?: () => void
  projectPath?: string
  sessions: SessionRecord[]
  variant: 'now' | 'project'
}

export function WorkspaceContextSidebar({
  activeSessionId,
  onOpenSession,
  onCreateProject,
  onOpenSettings,
  projectPath = '',
  sessions,
  variant,
}: WorkspaceContextSidebarProps): ReactElement {
  const { locale } = useLocale()
  const [query, setQuery] = useState('')
  const copy = COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  const visibleSessions = [...sessions]
    .filter((session) => variant === 'now' || !projectPath || session.projectPath === projectPath)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, variant === 'now' ? 3 : 8)
  const normalizedQuery = query.trim().toLocaleLowerCase(locale)
  const filteredSessions = visibleSessions.filter((session) => `${session.title} ${shortProjectName(session.projectPath)}`.toLocaleLowerCase(locale).includes(normalizedQuery))
  const projectGroups = useMemo(() => groupByProject(filteredSessions), [filteredSessions])
  return (
    <aside className={`pv-workspace-context variant-${variant}`} data-context-variant={variant}>
      {variant === 'project' ? (
        <>
          <header className="pv-context-project-heading pv-project-sidebar-heading">
            <span><strong>{locale === 'zh-CN' ? '项目' : 'Projects'}</strong><em>{projectGroups.length}</em><small>{locale === 'zh-CN' ? `${projectGroups.length} 个项目` : `${projectGroups.length} projects`}</small></span>
            <div><button aria-label={locale === 'zh-CN' ? '项目设置' : 'Project settings'} disabled={!onOpenSettings} onClick={onOpenSettings} type="button"><Settings size={16} /></button><button aria-label={locale === 'zh-CN' ? '新建项目' : 'New project'} disabled={!onCreateProject} onClick={onCreateProject} type="button"><Plus size={17} /></button></div>
          </header>
          <label className="pv-project-sidebar-search"><Search aria-hidden="true" size={15} /><input aria-label={locale === 'zh-CN' ? '搜索项目' : 'Search projects'} onChange={(event) => setQuery(event.target.value)} placeholder={locale === 'zh-CN' ? '搜索项目…' : 'Search projects...'} value={query} /></label>
        </>
      ) : (
        <header className="pv-context-simple-heading"><strong>{copy.sessions}</strong></header>
      )}

      <div className="pv-context-session-list">
        {variant === 'project' ? projectGroups.map((group) => <section className="pv-project-session-group" key={group.path}><h2><ChevronDown size={14} /><span>{group.name}</span><em>{group.sessions.length}</em></h2><div><div className="pv-project-folder-row"><Folder size={16} /><strong>{group.name}</strong></div>{group.sessions.map((session) => (
          <button
            aria-current={session.id === activeSessionId ? 'page' : undefined}
            className={session.id === activeSessionId ? 'active' : ''}
            key={session.id}
            onClick={() => void onOpenSession(session)}
            type="button"
          >
            <Square aria-hidden="true" size={16} strokeWidth={1.35} />
            <span><strong>{session.title}</strong><small>{formatRelativeTime(session.updatedAt, locale)}</small></span>
          </button>
        ))}</div></section>) : filteredSessions.map((session) => (
          <button
            aria-current={session.id === activeSessionId ? 'page' : undefined}
            className={session.id === activeSessionId ? 'active' : ''}
            key={session.id}
            onClick={() => void onOpenSession(session)}
            type="button"
          >
            <Square aria-hidden="true" size={16} strokeWidth={1.35} />
            <span><strong>{session.title}</strong><small>{formatRelativeTime(session.updatedAt, locale)}</small></span>
          </button>
        ))}
        {filteredSessions.length === 0 && <p className="pv-context-empty">{copy.empty}</p>}
      </div>
    </aside>
  )
}

function shortProjectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
}

function groupByProject(sessions: SessionRecord[]): Array<{ name: string; path: string; sessions: SessionRecord[] }> {
  const groups = new Map<string, SessionRecord[]>()
  for (const session of sessions) groups.set(session.projectPath, [...(groups.get(session.projectPath) ?? []), session])
  return [...groups.entries()].map(([path, groupedSessions]) => ({ name: shortProjectName(path) || 'Pivot', path, sessions: groupedSessions }))
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
