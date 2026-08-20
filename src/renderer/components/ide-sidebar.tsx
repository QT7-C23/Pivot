import { Bot, CheckCircle2, ChevronDown, ChevronRight, Circle, ExternalLink, FilePlus2, FileText, Folder, FolderPlus, History, Search, Sparkles } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, useState, type MouseEvent, type ReactElement } from 'react'
import type { FileSearchEntry } from '../../shared/types/domain'
import type { AgentOperation } from '../stores/agent.store'
import type { FileNode } from '../stores/file.store'
import type { WorkspaceActivity } from '../stores/ui.store'
import { useLocale } from '../i18n/locale-context'

interface IdeSidebarProps {
  activity: WorkspaceActivity
  agentState: string
  collapseDirectory: (path: string) => void
  currentTask: string | null
  expandDirectory: (path: string) => Promise<void>
  files: FileNode[]
  isSearching: boolean
  onCreateDirectory: (parentPath: string, name: string) => Promise<void>
  onCreateFile: (parentPath: string, name: string) => Promise<void>
  onOpenFile: (path: string) => Promise<void>
  onOpenResult: (result: FileSearchEntry) => Promise<void>
  onQueryChange: (query: string) => void
  onReveal: (path: string) => Promise<void>
  operations: AgentOperation[]
  query: string
  rootPath: string | null
  results: FileSearchEntry[]
}

export function IdeSidebar({
  activity,
  agentState,
  collapseDirectory,
  currentTask,
  expandDirectory,
  files,
  isSearching,
  onCreateDirectory,
  onCreateFile,
  onOpenFile,
  onOpenResult,
  onQueryChange,
  onReveal,
  operations,
  query,
  rootPath,
  results,
}: IdeSidebarProps): ReactElement {
  const { t } = useLocale()
  const [contextTarget, setContextTarget] = useState<{ file: FileNode | null; x: number; y: number } | null>(null)
  const fileListRef = useRef<HTMLDivElement>(null)
  const fileVirtualizer = useVirtualizer({
    count: activity === 'files' ? files.length : 0,
    estimateSize: () => 28,
    getItemKey: (index) => files[index]?.path ?? index,
    getScrollElement: () => fileListRef.current,
    overscan: 12,
  })

  function requestEntry(kind: 'file' | 'directory'): void {
    const parentPath = contextTarget?.file?.type === 'directory'
      ? contextTarget.file.path
      : contextTarget?.file ? parentDirectory(contextTarget.file.path) : rootPath
    setContextTarget(null)
    if (!parentPath) return
    const name = window.prompt(kind === 'file' ? 'New file name' : 'New folder name')?.trim()
    if (!name) return
    if (kind === 'file') void onCreateFile(parentPath, name)
    else void onCreateDirectory(parentPath, name)
  }

  if (activity === 'files') {
    return (
      <aside aria-label="Files" className="ide-sidebar">
        <div className="ide-sidebar-heading">
          <span>Explorer</span>
          <small>{files.filter((file) => file.changeType).length || ''}</small>
        </div>
        <label className="sidebar-search">
          <Search size={15} />
          <input
            aria-label="Quick open file"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Quick open file"
            value={query}
          />
          {isSearching && <span className="search-spinner" />}
        </label>
        {query.trim().length >= 2 && (
          <div className="quick-open-results inline-results">
            {results.length === 0 && !isSearching ? (
              <div className="quick-open-empty">No files found</div>
            ) : (
              results.map((result) => (
                <button className="quick-open-result" key={result.path} onClick={() => void onOpenResult(result)} type="button">
                  <strong>{result.name}</strong>
                  <span>{result.relativePath}</span>
                </button>
              ))
            )}
          </div>
        )}
        <div
          className="file-list compact-tree"
          ref={fileListRef}
          onContextMenu={(event) => {
            const target = event.target
            if (!(target instanceof Element) || !target.closest('.file-row')) {
              event.preventDefault()
              setContextTarget({ file: null, x: event.clientX, y: event.clientY })
            }
          }}
        >
          {files.length === 0 ? (
            <p className="muted sidebar-empty">Open a project to load its files.</p>
          ) : (
            <div className="file-list-virtual-space" style={{ height: fileVirtualizer.getTotalSize() }}>
              {fileVirtualizer.getVirtualItems().map((virtualRow) => {
                const file = files[virtualRow.index]
                if (!file) return null
                return (
                  <div
                    className="file-list-virtual-row"
                    data-index={virtualRow.index}
                    key={file.path}
                    ref={fileVirtualizer.measureElement}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <FileTreeRow
                      collapseDirectory={collapseDirectory}
                      expandDirectory={expandDirectory}
                      file={file}
                      onOpenFile={onOpenFile}
                      onOpenMenu={(event) => {
                        event.preventDefault()
                        setContextTarget({ file, x: event.clientX, y: event.clientY })
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {contextTarget && (
          <div className="file-context-menu" role="menu" style={{ left: contextTarget.x, top: contextTarget.y }}>
            <button onClick={() => requestEntry('file')} role="menuitem" type="button"><FilePlus2 size={13} />New file</button>
            <button onClick={() => requestEntry('directory')} role="menuitem" type="button"><FolderPlus size={13} />New folder</button>
            {contextTarget.file && (
              <button onClick={() => { void onReveal(contextTarget.file!.path); setContextTarget(null) }} role="menuitem" type="button">
                <ExternalLink size={13} />Show in Explorer
              </button>
            )}
            <button className="context-dismiss" onClick={() => setContextTarget(null)} type="button">Dismiss</button>
          </div>
        )}
      </aside>
    )
  }

  if (activity === 'agent' || activity === 'plan') {
    return (
      <aside aria-label={activity === 'agent' ? 'Agent team' : 'Current plan'} className="ide-sidebar">
        <div className="ide-sidebar-heading">
          <span>{activity === 'agent' ? 'Agent team' : 'Current plan'}</span>
          <small>{agentState}</small>
        </div>
        <div className="sidebar-summary-card">
          <Bot size={18} />
          <div>
            <strong>{currentTask ?? 'Ready for the next task'}</strong>
            <span>Pivot Axis Engine · {agentState}</span>
          </div>
        </div>
        <ol className="sidebar-operation-list">
          {operations.length === 0 ? (
            <li className="sidebar-empty">Operations appear here as the Agent works.</li>
          ) : (
            operations.map((operation) => (
              <li key={operation.id}>
                {operation.status === 'done' ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                <span>{operation.description}</span>
                <small>{operation.status}</small>
              </li>
            ))
          )}
        </ol>
      </aside>
    )
  }

  if (activity === 'timeline') {
    return (
      <aside aria-label={t('timeline.title')} className="ide-sidebar timeline-sidebar">
        <div className="ide-sidebar-heading"><span>{t('timeline.title')}</span></div>
        <div className="sidebar-placeholder">
          <History size={20} />
          <strong>{t('timeline.sidebarSummary')}</strong>
          <p>{t('timeline.sidebarDescription')}</p>
        </div>
      </aside>
    )
  }

  return (
    <aside aria-label="Skills" className="ide-sidebar">
      <div className="ide-sidebar-heading"><span>Skills</span></div>
      <div className="sidebar-placeholder">
        <Sparkles size={20} />
        <strong>Skills workspace</strong>
        <p>Installed and project skills will be grouped here as the plugin layer lands.</p>
      </div>
    </aside>
  )
}

function FileTreeRow({
  collapseDirectory,
  expandDirectory,
  file,
  onOpenFile,
  onOpenMenu,
}: {
  collapseDirectory: (path: string) => void
  expandDirectory: (path: string) => Promise<void>
  file: FileNode
  onOpenFile: (path: string) => Promise<void>
  onOpenMenu: (event: MouseEvent<HTMLButtonElement>) => void
}): ReactElement {
  const isDirectory = file.type === 'directory'
  const className = [
    'file-row',
    isDirectory ? 'directory' : 'file',
    file.changeType ? `changed ${file.changeType}` : '',
    file.isLoading ? 'loading' : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      className={className}
      onClick={() => {
        if (!isDirectory) {
          void onOpenFile(file.path)
          return
        }
        if (file.isExpanded) collapseDirectory(file.path)
        else void expandDirectory(file.path)
      }}
      onContextMenu={onOpenMenu}
      style={{ paddingLeft: 10 + file.depth * 14 }}
      title={file.changeType ? `${file.changeType}: ${file.path}` : file.path}
      type="button"
    >
      <span className="file-kind">
        {isDirectory && (file.isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
        {isDirectory ? <Folder size={14} /> : <FileText size={14} />}
      </span>
      <strong>{file.name}</strong>
      {file.changeType && <span aria-label={file.changeType} className={`file-change-dot ${file.changeType}`} />}
    </button>
  )
}

function parentDirectory(value: string): string {
  const normalized = value.replaceAll('\\', '/')
  const parent = normalized.slice(0, normalized.lastIndexOf('/'))
  return value.includes('\\') ? parent.replaceAll('/', '\\') : parent
}
