import { Square } from 'lucide-react'
import type { ReactElement } from 'react'
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
  projectPath?: string
  sessions: SessionRecord[]
  variant: 'now' | 'project'
}

export function WorkspaceContextSidebar({
  activeSessionId,
  onOpenSession,
  projectPath = '',
  sessions,
  variant,
}: WorkspaceContextSidebarProps): ReactElement {
  const { locale } = useLocale()
  const copy = COPY[locale === 'zh-CN' || locale === 'ja' || locale === 'de' ? locale : 'en']
  const visibleSessions = [...sessions]
    .filter((session) => variant === 'now' || !projectPath || session.projectPath === projectPath)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, variant === 'now' ? 3 : 8)
  const projectTitle = shortProjectName(projectPath || visibleSessions[0]?.projectPath || '')
  const projectDescription = visibleSessions[0]?.title && visibleSessions[0].title !== projectTitle
    ? visibleSessions[0].title
    : copy.sessionCount(visibleSessions.length)

  return (
    <aside className={`pv-workspace-context variant-${variant}`} data-context-variant={variant}>
      {variant === 'project' ? (
        <header className="pv-context-project-heading">
          <strong>{projectTitle || 'Pivot'}</strong>
          <small>{projectDescription}</small>
        </header>
      ) : (
        <header className="pv-context-simple-heading"><strong>{copy.sessions}</strong></header>
      )}

      {variant === 'project' && <div className="pv-context-section-label">{copy.sessions}</div>}
      <div className="pv-context-session-list">
        {visibleSessions.map((session) => (
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
        {visibleSessions.length === 0 && <p className="pv-context-empty">{copy.empty}</p>}
      </div>
    </aside>
  )
}

function shortProjectName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
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
