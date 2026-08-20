import { Bot, FileClock, FileDiff, History, MessageSquareText, RotateCcw, UserRound } from 'lucide-react'
import { useMemo, useState, type ReactElement } from 'react'
import type { ContextTimelineEntry, ContextTimelineRestoreResult } from '../../shared/types/domain'
import { useLocale } from '../i18n/locale-context'

type TimelineFilter = 'all' | 'conversation' | 'files'

interface ContextTimelineWorkspaceProps {
  entries: ContextTimelineEntry[]
  isLoading: boolean
  lastRestore: ContextTimelineRestoreResult | null
  onOpenReview: (reviewId: string) => Promise<void>
  onRestore: (reviewId: string) => Promise<void>
  onUndo: () => Promise<void>
  sessionId: string | null
}

export function ContextTimelineWorkspace({ entries, isLoading, lastRestore, onOpenReview, onRestore, onUndo, sessionId }: ContextTimelineWorkspaceProps): ReactElement {
  const { locale, t } = useLocale()
  const [filter, setFilter] = useState<TimelineFilter>('all')
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null)
  const [isUndoing, setIsUndoing] = useState(false)
  const visibleEntries = useMemo(() => entries.filter((entry) => (
    filter === 'all' || (filter === 'conversation' ? entry.type === 'message' : entry.type === 'file-change')
  )), [entries, filter])
  const messageCount = entries.filter((entry) => entry.type === 'message').length
  const fileCount = entries.length - messageCount

  async function restore(reviewId: string): Promise<void> {
    if (!window.confirm(t('timeline.restoreConfirm'))) return
    setBusyReviewId(reviewId)
    try { await onRestore(reviewId) } finally { setBusyReviewId(null) }
  }

  async function undo(): Promise<void> {
    setIsUndoing(true)
    try { await onUndo() } finally { setIsUndoing(false) }
  }

  return (
    <section aria-label={t('timeline.title')} className="timeline-workspace">
      <header className="timeline-header">
        <div className="timeline-heading-icon"><History size={20} /></div>
        <div>
          <p className="timeline-eyebrow">{t('timeline.eyebrow')}</p>
          <h1>{t('timeline.title')}</h1>
          <p>{t('timeline.description')}</p>
        </div>
        <div className="timeline-counts" aria-label={t('timeline.summary')}>
          <span><MessageSquareText size={13} />{messageCount}</span>
          <span><FileDiff size={13} />{fileCount}</span>
        </div>
      </header>

      <div className="timeline-toolbar">
        <div aria-label={t('timeline.filter')} className="timeline-filter" role="tablist">
          {(['all', 'conversation', 'files'] as const).map((value) => (
            <button aria-selected={filter === value} className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)} role="tab" type="button">
              {t(`timeline.filter.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {lastRestore && (
        <div className="timeline-undo-banner" role="status">
          <RotateCcw size={15} />
          <span>{t(lastRestore.action === 'deleted' ? 'timeline.deleted' : 'timeline.restored', { file: shortFileName(lastRestore.filePath) })}</span>
          <button disabled={isUndoing} onClick={() => void undo()} type="button">{t('timeline.undo')}</button>
        </div>
      )}

      <div className="timeline-scroll">
        {!sessionId ? (
          <TimelineEmpty icon={<History size={24} />} text={t('timeline.noSession')} />
        ) : isLoading && entries.length === 0 ? (
          <TimelineEmpty icon={<span className="search-spinner" />} text={t('common.loading')} />
        ) : visibleEntries.length === 0 ? (
          <TimelineEmpty icon={<History size={24} />} text={t('timeline.empty')} />
        ) : (
          <ol className="timeline-list">
            {visibleEntries.map((entry) => (
              <li className={`timeline-entry ${entry.type}`} key={`${entry.type}-${entry.id}`}>
                <div className="timeline-marker" aria-hidden="true">
                  {entry.type === 'file-change' ? <FileClock size={14} /> : entry.role === 'user' ? <UserRound size={14} /> : <Bot size={14} />}
                </div>
                <article>
                  <header>
                    <strong>{entry.type === 'file-change' ? shortFileName(entry.filePath) : t(`timeline.role.${entry.role}`)}</strong>
                    <time dateTime={entry.timestamp}>{formatTime(entry.timestamp, locale)}</time>
                  </header>
                  {entry.type === 'file-change' ? (
                    <>
                      <p className="timeline-path" title={entry.filePath}>{entry.filePath}</p>
                      <div className="timeline-change-meta">
                        <span className="additions">+{entry.additions}</span>
                        <span className="deletions">−{entry.deletions}</span>
                        <span className={`review-status ${entry.status}`}>{entry.status}</span>
                      </div>
                      <div className="timeline-actions">
                        <button onClick={() => void onOpenReview(entry.reviewId)} type="button"><FileDiff size={14} />{t('timeline.viewDiff')}</button>
                        <button className="restore" disabled={busyReviewId === entry.reviewId} onClick={() => void restore(entry.reviewId)} type="button"><RotateCcw size={14} />{t('timeline.restore')}</button>
                      </div>
                    </>
                  ) : (
                    <p className="timeline-message">{entry.text}</p>
                  )}
                </article>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function TimelineEmpty({ icon, text }: { icon: ReactElement; text: string }): ReactElement {
  return <div className="timeline-empty">{icon}<p>{text}</p></div>
}

function shortFileName(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? filePath
}

function formatTime(timestamp: string, locale: string): string {
  const value = new Date(timestamp)
  if (Number.isNaN(value.getTime())) return timestamp
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(value)
}
