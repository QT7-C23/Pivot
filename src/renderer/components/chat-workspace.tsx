import { AtSign, Bot, Command, FileCode2, FolderOpen, SendHorizontal, SlidersHorizontal, Square, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react'
import { AGENT_CONTEXT_MAX_FILES } from '../../shared/constants'
import type { ChatMessage, FileSearchEntry } from '../../shared/types/domain'
import type { AgentClientContext } from '../../shared/types/domain'
import { useFileMentionSearch } from '../hooks/useFileMentionSearch'
import type { MessageKey } from '../i18n/locale'
import { useLocale } from '../i18n/locale-context'
import { replaceFileMention } from '../services/file-mentions'
import type { ChatSubmode, ReasoningEffort } from '../stores/ui.store'
import { MessageContent } from './message-content'

interface ChatWorkspaceProps {
  activeFilePath: string | null
  activeSessionId: string | null
  focusRequest: number
  isStreaming: boolean
  messages: ChatMessage[]
  onChooseProject: () => Promise<void>
  onAbort: () => Promise<void>
  onOpenWorkspaceDetails: () => void
  onSetReasoningEffort: (effort: ReasoningEffort) => void
  interactionMode: Exclude<ChatSubmode, 'preview'>
  reasoningEffort: ReasoningEffort
  sendMessage: (
    text: string,
    sessionId: string,
    context?: AgentClientContext,
  ) => Promise<void>
  streamPhase: 'thinking' | 'writing' | 'tool_use' | null
}

const STARTER_PROMPTS: MessageKey[] = ['chat.prompt.review', 'chat.prompt.risk', 'chat.prompt.tests']

export function ChatWorkspace({
  activeFilePath,
  activeSessionId,
  focusRequest,
  isStreaming,
  messages,
  onAbort,
  onChooseProject,
  onOpenWorkspaceDetails,
  onSetReasoningEffort,
  interactionMode,
  reasoningEffort,
  sendMessage,
  streamPhase,
}: ChatWorkspaceProps): ReactElement {
  const { locale, t } = useLocale()
  const [draft, setDraft] = useState('')
  const [composerCursor, setComposerCursor] = useState(0)
  const [referencedFiles, setReferencedFiles] = useState<FileSearchEntry[]>([])
  const [activeMentionResult, setActiveMentionResult] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileMentions = useFileMentionSearch(activeSessionId, draft, composerCursor)
  const canSend = Boolean(activeSessionId) && draft.trim().length > 0 && !isStreaming

  useEffect(() => {
    setActiveMentionResult(0)
  }, [fileMentions.results])

  useEffect(() => {
    if (focusRequest === 0) return
    const frame = requestAnimationFrame(() => textareaRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [focusRequest])

  useEffect(() => {
    setDraft('')
    setComposerCursor(0)
    setReferencedFiles([])
  }, [activeSessionId])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const nextHeight = Math.min(textarea.scrollHeight, 150)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > 150 ? 'auto' : 'hidden'
  }, [draft])

  function submitMessage(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!activeSessionId || !canSend) return

    const text = draft.trim()
    setDraft('')
    setComposerCursor(0)
    const referencedFilePaths = referencedFiles.map((file) => file.path)
    setReferencedFiles([])
    void sendMessage(text, activeSessionId, {
      activeFilePath: activeFilePath ?? undefined,
      interactionMode,
      reasoningEffort,
      referencedFilePaths: referencedFilePaths.length > 0 ? referencedFilePaths : undefined,
    })
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (fileMentions.mention && fileMentions.results.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setActiveMentionResult((current) => (
          current + direction + fileMentions.results.length
        ) % fileMentions.results.length)
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        selectReferencedFile(fileMentions.results[activeMentionResult]!)
        return
      }
    }
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (canSend) event.currentTarget.form?.requestSubmit()
  }

  function insertPrefix(prefix: '@' | '/'): void {
    setDraft((value) => {
      const nextDraft = `${value}${value.length > 0 && !value.endsWith(' ') ? ' ' : ''}${prefix}`
      setComposerCursor(nextDraft.length)
      return nextDraft
    })
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length)
    })
  }

  function selectReferencedFile(file: FileSearchEntry): void {
    const mention = fileMentions.mention
    if (!mention) return
    let nextDraft = replaceFileMention(draft, mention, file.relativePath)
    let nextCursor = nextDraft.length - (draft.length - mention.end)
    if (/\s/.test(nextDraft[nextCursor] ?? '')) {
      nextCursor += 1
    } else {
      nextDraft = `${nextDraft.slice(0, nextCursor)} ${nextDraft.slice(nextCursor)}`
      nextCursor += 1
    }
    setDraft(nextDraft)
    setComposerCursor(nextCursor)
    setReferencedFiles((current) => {
      if (current.some((candidate) => candidate.path === file.path)) return current
      return [...current, file].slice(0, AGENT_CONTEXT_MAX_FILES)
    })
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  return (
    <section className="panel chat-panel">
      <div aria-live="polite" className="chat-thread">
        {messages.length === 0 ? (
          <WelcomeState
            activeSessionId={activeSessionId}
            onChooseProject={onChooseProject}
            onSelectPrompt={setDraft}
            onOpenWorkspaceDetails={onOpenWorkspaceDetails}
          />
        ) : (
          messages.map((message) => (
            <article className={`chat-message ${message.role}`} key={message.id}>
              <div className="message-meta">
                <span>{message.role === 'assistant' ? 'Pivot' : message.role}</span>
                <time dateTime={message.timestamp}>{formatMessageTime(message.timestamp)}</time>
              </div>
              <MessageContent text={message.text} />
            </article>
          ))
        )}
        {isStreaming && streamPhase && (
          <div className={`stream-phase stream-${streamPhase}`}>
            <span className="stream-phase-indicator" />
            <strong>{streamPhase === 'tool_use' ? t('chat.usingTools') : streamPhase}</strong>
          </div>
        )}
      </div>
      <form className="chat-composer" data-state={isStreaming ? 'running' : !activeSessionId ? 'disabled' : draft.trim() ? 'typing' : 'empty'} onSubmit={submitMessage}>
        {referencedFiles.length > 0 && (
          <div aria-label={t('chat.referencedFiles')} className="composer-references">
            {referencedFiles.map((file) => (
              <span className="reference-chip" key={file.path}>
                <FileCode2 size={12} />
                <span>{file.relativePath}</span>
                <button
                  aria-label={t('chat.removeFile', { path: file.relativePath })}
                  onClick={() => setReferencedFiles((current) => current.filter((candidate) => candidate.path !== file.path))}
                  type="button"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {fileMentions.mention && fileMentions.mention.query.trim() && (
          <div aria-label={t('chat.fileResults')} className="file-mention-popover" role="listbox">
            {fileMentions.isSearching && <div className="file-mention-status">{t('chat.searchingFiles')}</div>}
            {fileMentions.error && <div className="file-mention-status error">{fileMentions.error}</div>}
            {!fileMentions.isSearching && !fileMentions.error && fileMentions.results.length === 0 && (
              <div className="file-mention-status">{t('chat.noMatchingFiles')}</div>
            )}
            {fileMentions.results.map((file, index) => (
              <button
                aria-selected={index === activeMentionResult}
                className={index === activeMentionResult ? 'active' : undefined}
                key={file.path}
                onClick={() => selectReferencedFile(file)}
                role="option"
                type="button"
              >
                <FileCode2 size={14} />
                <span>{file.relativePath}</span>
              </button>
            ))}
          </div>
        )}
        <div className="composer-input-row">
          <div className="composer-context-actions">
            <button aria-label={t('chat.mentionFile')} disabled={!activeSessionId} onClick={() => insertPrefix('@')} type="button"><AtSign size={15} /><span>{t('chat.file')}</span></button>
            <button aria-label={t('chat.insertCommand')} disabled={!activeSessionId} onClick={() => insertPrefix('/')} type="button"><Command size={15} /><span>{t('chat.command')}</span></button>
          </div>
          <textarea
            disabled={!activeSessionId || isStreaming}
            onChange={(event) => { setDraft(event.target.value); setComposerCursor(event.target.selectionStart) }}
            onClick={(event) => setComposerCursor(event.currentTarget.selectionStart)}
            onKeyUp={(event) => setComposerCursor(event.currentTarget.selectionStart)}
            onKeyDown={handleComposerKeyDown}
            placeholder={activeSessionId ? t('chat.describe') : t('chat.openBeforeSend')}
            ref={textareaRef}
            rows={1}
            value={draft}
          />
          <button
            aria-label={isStreaming ? (locale === 'zh-CN' ? '停止' : 'Stop') : t('chat.send')}
            className={`primary-icon-button ${isStreaming ? 'danger' : ''}`}
            disabled={!isStreaming && !canSend}
            onClick={isStreaming ? () => void onAbort() : undefined}
            type={isStreaming ? 'button' : 'submit'}
          >
            {isStreaming ? <Square fill="currentColor" size={12} /> : <SendHorizontal size={16} />}
            <span>{isStreaming ? (locale === 'zh-CN' ? '停止' : 'Stop') : t('chat.send')}</span>
          </button>
        </div>
        <div className="composer-toolbar">
          <div className="composer-runtime-controls">
            <button className="composer-runtime-trigger" type="button"><Bot size={13} /><span>Pivot Engine</span></button>
            <label className="composer-depth-control">
              <SlidersHorizontal size={13} />
              <span className="sr-only">{t('mode.reasoning')}</span>
              <select aria-label={t('mode.reasoning')} onChange={(event) => onSetReasoningEffort(Number(event.target.value) as ReasoningEffort)} value={reasoningEffort}>
                <option value={1}>{t('mode.fast')}</option>
                <option value={2}>{t('mode.balancedFast')}</option>
                <option value={3}>{t('mode.moderate')}</option>
                <option value={4}>{t('mode.balancedDeep')}</option>
                <option value={5}>{t('mode.deep')}</option>
              </select>
            </label>
          </div>
          <span className="composer-hint">{t('chat.sendHint')}</span>
        </div>
      </form>
    </section>
  )
}

function WelcomeState({
  activeSessionId,
  onChooseProject,
  onSelectPrompt,
  onOpenWorkspaceDetails,
}: {
  activeSessionId: string | null
  onChooseProject: () => Promise<void>
  onSelectPrompt: (prompt: string) => void
  onOpenWorkspaceDetails: () => void
}): ReactElement {
  const { t } = useLocale()
  return (
    <div className="pivot-welcome">
      <div className="welcome-mark"><Bot size={28} /></div>
      <div>
        <span className="eyebrow">{t('chat.eyebrow')}</span>
        <h1>{activeSessionId ? t('chat.whatNext') : t('chat.openWorkspace')}</h1>
        <p>{t('chat.welcomeDescription')}</p>
      </div>
      <div className="welcome-actions">
        {!activeSessionId && (
          <button className="primary-button" onClick={() => void onChooseProject()} type="button">
            <FolderOpen size={15} />
            <span>{t('chat.openProject')}</span>
          </button>
        )}
        <button className="secondary-button" onClick={onOpenWorkspaceDetails} type="button">
          <FolderOpen size={15} />
          <span>{t('chat.enterIde')}</span>
        </button>
      </div>
      {activeSessionId && (
        <div className="starter-prompts">
          <span>{t('chat.tryOne')}</span>
          {STARTER_PROMPTS.map((promptKey) => (
            <button key={promptKey} onClick={() => onSelectPrompt(t(promptKey))} type="button">{t(promptKey)}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function formatMessageTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
