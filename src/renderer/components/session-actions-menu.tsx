import { Archive, Copy, GitFork, Heart, MoreHorizontal, Trash2 } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import type { SessionGroupRecord, SessionMetadataPatch, SessionRecord } from '../../shared/types/domain'

export function SessionActionsMenu({
  groups,
  onDelete,
  onExport,
  onFork,
  onUpdate,
  session,
}: {
  groups: SessionGroupRecord[]
  onDelete: (id: string) => Promise<void>
  onExport: (id: string, format: 'markdown' | 'json') => Promise<void>
  onFork: (id: string) => Promise<void>
  onUpdate: (id: string, patch: SessionMetadataPatch) => Promise<void>
  session: SessionRecord
}): ReactElement {
  const [tags, setTags] = useState(session.tags.join(', '))

  return (
    <details className="session-actions-menu">
      <summary aria-label={`Actions for ${session.title}`}><MoreHorizontal size={13} /></summary>
      <div className="session-actions-popover">
        <button onClick={() => void onUpdate(session.id, { isFavorite: !session.isFavorite })} type="button">
          <Heart size={13} />{session.isFavorite ? 'Unfavorite' : 'Favorite'}
        </button>
        <button onClick={() => void onUpdate(session.id, { status: session.status === 'archived' ? 'active' : 'archived' })} type="button">
          <Archive size={13} />{session.status === 'archived' ? 'Unarchive' : 'Archive'}
        </button>
        <button onClick={() => void onUpdate(session.id, { isUnread: !session.isUnread })} type="button">
          {session.isUnread ? 'Mark read' : 'Mark unread'}
        </button>
        <button onClick={() => void onFork(session.id)} type="button"><GitFork size={13} />Fork session</button>
        <label>
          <span>Group</span>
          <select
            onChange={(event) => void onUpdate(session.id, { groupId: event.target.value || null })}
            value={session.groupId ?? ''}
          >
            <option value="">No group</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>
        <label>
          <span>Tags</span>
          <input onChange={(event) => setTags(event.target.value)} placeholder="tag, tag" value={tags} />
        </label>
        <button onClick={() => void onUpdate(session.id, { tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) })} type="button">
          Apply tags
        </button>
        <div className="session-export-actions">
          <button onClick={() => void onExport(session.id, 'markdown')} type="button"><Copy size={12} />MD</button>
          <button onClick={() => void onExport(session.id, 'json')} type="button"><Copy size={12} />JSON</button>
        </div>
        <button className="danger" onClick={() => void onDelete(session.id)} type="button"><Trash2 size={13} />Delete</button>
      </div>
    </details>
  )
}
