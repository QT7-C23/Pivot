import { Plus, Terminal, X } from 'lucide-react'
import { lazy, Suspense, type ReactElement } from 'react'
import type { TerminalInstance } from '../stores/terminal.store'

const TerminalView = lazy(() =>
  import('./TerminalView').then((module) => ({ default: module.TerminalView })),
)

interface TerminalWorkspaceProps {
  activeTerminalId: string | null
  createTerminal: (sessionId: string, cwd: string) => Promise<void>
  destroyTerminal: (id: string) => Promise<void>
  projectPath: string
  resizeActive: (cols: number, rows: number) => Promise<void>
  sessionId: string | null
  sendToActive: (data: string) => Promise<void>
  setActiveTerminal: (id: string) => void
  terminals: TerminalInstance[]
}

export function TerminalWorkspace({
  activeTerminalId,
  createTerminal,
  destroyTerminal,
  projectPath,
  resizeActive,
  sessionId,
  sendToActive,
  setActiveTerminal,
  terminals,
}: TerminalWorkspaceProps): ReactElement {
  const visibleTerminals = sessionId
    ? terminals.filter((terminal) => terminal.sessionId === sessionId)
    : []
  const activeTerminal = visibleTerminals.find((terminal) => terminal.id === activeTerminalId) ?? null

  return (
    <section className="terminal-layout">
      <div className="panel terminal-panel">
        <div className="terminal-header">
          <div className="terminal-tabs">
            {visibleTerminals.map((terminal, index) => (
              <button className={terminal.isActive ? 'terminal-tab active' : 'terminal-tab'} key={terminal.id} onClick={() => setActiveTerminal(terminal.id)} type="button">
                <Terminal size={14} />
                <span>{`Term ${index + 1}`}</span>
                {terminal.status === 'exited' && <small>{terminal.exitCode}</small>}
              </button>
            ))}
          </div>
          <button
            className="primary-icon-button"
            disabled={!projectPath.trim() || !sessionId}
            onClick={() => sessionId && void createTerminal(sessionId, projectPath.trim())}
            type="button"
          >
            <Plus size={16} />
            <span>New</span>
          </button>
        </div>
        <Suspense fallback={<div className="xterm-host loading">Loading terminal…</div>}>
          <TerminalView activeTerminal={activeTerminal} onResize={resizeActive} onWrite={sendToActive} />
        </Suspense>
        <div className="terminal-footer">
          <span>{activeTerminal ? activeTerminal.cwd : 'Create a terminal to start an interactive shell.'}</span>
          <button aria-label="Close terminal" className="icon-button" disabled={!activeTerminal} onClick={() => activeTerminal && void destroyTerminal(activeTerminal.id)} type="button">
            <X size={16} />
          </button>
        </div>
      </div>
    </section>
  )
}
