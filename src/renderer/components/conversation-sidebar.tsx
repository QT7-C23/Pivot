import {
  FolderOpen,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Star,
  FolderPlus,
  Undo2,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type {
  ProjectHistoryEntry,
  SessionGroupRecord,
  SessionMetadataPatch,
  SessionRecord,
} from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'
import { SessionActionsMenu } from './session-actions-menu'

interface ConversationSidebarProps {
  activeSessionId: string | null
  isCollapsed: boolean
  onChooseProject: () => Promise<void>
  onCreateSession: () => Promise<void>
  onOpenProject: () => Promise<void>
  onOpenRecentProject: (projectPath: string) => Promise<void>
  onOpenSession: (session: SessionRecord) => Promise<void>
  onPinSession: (sessionId: string) => Promise<void>
  onSearchSessions: (query: string) => Promise<void>
  onUpdateSession: (id: string, patch: SessionMetadataPatch) => Promise<void>
  onForkSession: (id: string) => Promise<void>
  onDeleteSession: (id: string) => Promise<void>
  onUndoDelete: () => Promise<void>
  onExportSession: (id: string, format: 'markdown' | 'json') => Promise<void>
  onCreateGroup: (name: string) => Promise<void>
  onProjectPathChange: (projectPath: string) => void
  onToggleCollapsed: () => void
  projectPath: string
  recentProjects: ProjectHistoryEntry[]
  groups: SessionGroupRecord[]
  lastDeleted: SessionRecord | null
  sessions: SessionRecord[]
}

export function ConversationSidebar({
  activeSessionId,
  isCollapsed,
  onChooseProject,
  onCreateSession,
  onOpenProject,
  onOpenRecentProject,
  onOpenSession,
  onPinSession,
  onSearchSessions,
  onUpdateSession,
  onForkSession,
  onDeleteSession,
  onUndoDelete,
  onExportSession,
  onCreateGroup,
  onProjectPathChange,
  onToggleCollapsed,
  projectPath,
  recentProjects,
  groups,
  lastDeleted,
  sessions,
}: ConversationSidebarProps): ReactElement {
  const { t } = useLocale()
  const [sessionQuery, setSessionQuery] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const visibleSessions = useMemo(() => {
    const query = sessionQuery.trim().toLocaleLowerCase()
    if (!query) return sessions
    return sessions.filter((session) =>
      `${session.title} ${session.projectPath}`.toLocaleLowerCase().includes(query),
    )
  }, [sessionQuery, sessions])

  useEffect(() => {
    const timer = window.setTimeout(() => void onSearchSessions(sessionQuery), 180)
    return () => window.clearTimeout(timer)
  }, [onSearchSessions, sessionQuery])

  if (isCollapsed) {
    return (
      <aside aria-label={t('session.sessions')} className="conversation-sidebar collapsed">
        <button aria-label={t('session.expand')} className="sidebar-icon-button" onClick={onToggleCollapsed} type="button">
          <PanelLeftOpen size={17} />
        </button>
        <button aria-label={t('session.new')} className="sidebar-icon-button" onClick={() => void onCreateSession()} type="button">
          <MessageSquarePlus size={17} />
        </button>
      </aside>
    )
  }

  const pinned = visibleSessions.filter((session) => session.isPinned)
  const favorites = visibleSessions.filter((session) => !session.isPinned && session.isFavorite && session.status !== 'archived')
  const unpinned = visibleSessions.filter((session) => !session.isPinned && !session.isFavorite && !session.groupId && session.status !== 'archived')
  const today = unpinned.filter((session) => isToday(session.updatedAt))
  const earlier = unpinned.filter((session) => !isToday(session.updatedAt))
  const archived = visibleSessions.filter((session) => session.status === 'archived')

  return (
    <aside aria-label={t('session.sessions')} className="conversation-sidebar">
      <div className="sidebar-heading">
        <div>
          <span className="section-label">{t('session.workspace')}</span>
          <strong>{t('session.sessions')}</strong>
        </div>
        <button aria-label={t('session.collapse')} className="sidebar-icon-button" onClick={onToggleCollapsed} type="button">
          <PanelLeftClose size={17} />
        </button>
      </div>

      <section className="project-card">
        <label className="project-input-row">
          <FolderOpen size={16} />
          <input
            aria-label={t('session.projectPath')}
            onChange={(event) => onProjectPathChange(event.target.value)}
            placeholder={t('session.chooseFolder')}
            value={projectPath}
          />
        </label>
        <div className="project-actions">
          <button className="secondary-button" onClick={() => void onChooseProject()} type="button">
            {t('common.browse')}
          </button>
          <button className="primary-button" disabled={!projectPath.trim()} onClick={() => void onOpenProject()} type="button">
            {t('common.open')}
          </button>
        </div>
      </section>

      <label className="sidebar-search">
        <Search size={15} />
        <input
          aria-label={t('session.search')}
          onChange={(event) => setSessionQuery(event.target.value)}
          placeholder={t('session.search')}
          value={sessionQuery}
        />
      </label>

      <form
        className="session-group-create"
        onSubmit={(event) => {
          event.preventDefault()
          if (!newGroupName.trim()) return
          void onCreateGroup(newGroupName.trim()).then(() => setNewGroupName(''))
        }}
      >
        <FolderPlus size={13} />
        <input aria-label={t('session.newGroup')} onChange={(event) => setNewGroupName(event.target.value)} placeholder={t('session.newGroup')} value={newGroupName} />
        <button disabled={!newGroupName.trim()} type="submit">{t('common.add')}</button>
      </form>

      {lastDeleted && (
        <div className="session-undo-banner">
          <span>{t('session.deleted', { title: lastDeleted.title })}</span>
          <button onClick={() => void onUndoDelete()} type="button"><Undo2 size={12} />{t('session.undo')}</button>
        </div>
      )}

      <div className="session-groups">
        <SessionGroup
          activeSessionId={activeSessionId}
          icon={<Star aria-hidden="true" size={12} />}
          label={t('session.pinned')}
          onOpenSession={onOpenSession}
          onPinSession={onPinSession}
          groups={groups}
          onDeleteSession={onDeleteSession}
          onExportSession={onExportSession}
          onForkSession={onForkSession}
          onUpdateSession={onUpdateSession}
          sessions={pinned}
        />
        <SessionGroup
          activeSessionId={activeSessionId}
          label={t('session.favorites')}
          onOpenSession={onOpenSession}
          onPinSession={onPinSession}
          groups={groups}
          onDeleteSession={onDeleteSession}
          onExportSession={onExportSession}
          onForkSession={onForkSession}
          onUpdateSession={onUpdateSession}
          sessions={favorites}
        />
        {groups.map((group) => (
          <SessionGroup
            activeSessionId={activeSessionId}
            groups={groups}
            key={group.id}
            label={group.name}
            onDeleteSession={onDeleteSession}
            onExportSession={onExportSession}
            onForkSession={onForkSession}
            onOpenSession={onOpenSession}
            onPinSession={onPinSession}
            onUpdateSession={onUpdateSession}
            sessions={visibleSessions.filter((session) => session.groupId === group.id && session.status !== 'archived')}
          />
        ))}
        <SessionGroup
          activeSessionId={activeSessionId}
          label={t('session.today')}
          onOpenSession={onOpenSession}
          onPinSession={onPinSession}
          groups={groups}
          onDeleteSession={onDeleteSession}
          onExportSession={onExportSession}
          onForkSession={onForkSession}
          onUpdateSession={onUpdateSession}
          sessions={today}
        />
        <SessionGroup
          activeSessionId={activeSessionId}
          label={t('session.earlier')}
          onOpenSession={onOpenSession}
          onPinSession={onPinSession}
          groups={groups}
          onDeleteSession={onDeleteSession}
          onExportSession={onExportSession}
          onForkSession={onForkSession}
          onUpdateSession={onUpdateSession}
          sessions={earlier}
        />
        <SessionGroup
          activeSessionId={activeSessionId}
          groups={groups}
          label={t('session.archived')}
          onDeleteSession={onDeleteSession}
          onExportSession={onExportSession}
          onForkSession={onForkSession}
          onOpenSession={onOpenSession}
          onPinSession={onPinSession}
          onUpdateSession={onUpdateSession}
          sessions={archived}
        />
        {visibleSessions.length === 0 && (
          <div className="session-empty">
            {sessions.length === 0 ? t('session.empty') : t('session.noMatch')}
          </div>
        )}
      </div>

      {recentProjects.length > 0 && (
        <section aria-label={t('session.recentProjects')} className="recent-projects compact">
          <div className="section-label">{t('session.recentProjects')}</div>
          <div className="recent-project-list compact">
            {recentProjects.slice(0, 3).map((project) => (
              <button className="recent-project" key={project.path} onClick={() => void onOpenRecentProject(project.path)} type="button">
                <strong>{project.title}</strong>
                <span>{project.path}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <button className="new-session-button" disabled={!projectPath.trim()} onClick={() => void onCreateSession()} type="button">
        <MessageSquarePlus size={15} />
        <span>{t('session.new')}</span>
      </button>
    </aside>
  )
}

function SessionGroup({
  activeSessionId,
  icon,
  label,
  onOpenSession,
  onPinSession,
  groups,
  onDeleteSession,
  onExportSession,
  onForkSession,
  onUpdateSession,
  sessions,
}: {
  activeSessionId: string | null
  icon?: ReactElement
  label: string
  onOpenSession: (session: SessionRecord) => Promise<void>
  onPinSession: (sessionId: string) => Promise<void>
  groups: SessionGroupRecord[]
  onDeleteSession: (id: string) => Promise<void>
  onExportSession: (id: string, format: 'markdown' | 'json') => Promise<void>
  onForkSession: (id: string) => Promise<void>
  onUpdateSession: (id: string, patch: SessionMetadataPatch) => Promise<void>
  sessions: SessionRecord[]
}): ReactElement | null {
  if (sessions.length === 0) return null

  return (
    <section className="session-group">
      <div className="session-group-label">
        {icon}
        <span>{label}</span>
        <small>{sessions.length}</small>
      </div>
      {sessions.map((session) => (
        <div className="session-row-wrap" key={session.id}>
          <button
            aria-current={session.id === activeSessionId ? 'page' : undefined}
            className={session.id === activeSessionId ? 'session-row active' : 'session-row'}
            onClick={() => void onOpenSession(session)}
            type="button"
          >
            <strong>{session.title}</strong>
            <span>
              {session.isUnread && <i aria-label="Unread" className="session-unread-dot" />}
              {formatSessionTime(session.updatedAt)}
            </span>
          </button>
          <button
            aria-label={session.isPinned ? `Unpin ${session.title}` : `Pin ${session.title}`}
            className={session.isPinned ? 'session-pin active' : 'session-pin'}
            onClick={() => void onPinSession(session.id)}
            type="button"
          >
            <Star size={12} />
          </button>
          <SessionActionsMenu
            groups={groups}
            onDelete={onDeleteSession}
            onExport={onExportSession}
            onFork={onForkSession}
            onUpdate={onUpdateSession}
            session={session}
          />
        </div>
      ))}
    </section>
  )
}

function isToday(value: string): boolean {
  const date = new Date(value)
  const now = new Date()
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
}

function formatSessionTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return isToday(value)
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: '2-digit', month: 'short' })
}
