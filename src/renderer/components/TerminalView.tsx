import { useEffect, useLayoutEffect, useRef, type ReactElement } from 'react'
import { Terminal as XTermTerminal } from 'xterm'
import type { TerminalInstance } from '../stores/terminal.store'

interface TerminalViewProps {
  activeTerminal: TerminalInstance | null
  onResize: (cols: number, rows: number) => Promise<void>
  onWrite: (data: string) => Promise<void>
}

export function TerminalView({ activeTerminal, onResize, onWrite }: TerminalViewProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lastRenderedRef = useRef<{ id: string | null; length: number }>({ id: null, length: 0 })
  const terminalRef = useRef<XTermTerminal | null>(null)

  useLayoutEffect(() => {
    if (!containerRef.current) {
      return
    }

    const terminal = new XTermTerminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: '"Cascadia Code", Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      rows: 24,
      theme: {
        background: '#05070d',
        black: '#101622',
        blue: '#86a0ff',
        brightBlack: '#4f5b70',
        brightBlue: '#a8bbff',
        brightCyan: '#8de9e0',
        brightGreen: '#a7f2bd',
        brightMagenta: '#d7b4ff',
        brightRed: '#ffb4b4',
        brightWhite: '#ffffff',
        brightYellow: '#ffe08a',
        cursor: '#eaf0ff',
        cyan: '#70d8d0',
        foreground: '#d8e0ef',
        green: '#8ee6a8',
        magenta: '#caa4ff',
        red: '#ff8f8f',
        selectionBackground: '#26334c',
        white: '#d8e0ef',
        yellow: '#ffd36a',
      },
    })

    terminal.open(containerRef.current)
    terminalRef.current = terminal

    const dataSubscription = terminal.onData((data) => {
      void onWrite(data)
    })

    void onResize(terminal.cols, terminal.rows)

    return () => {
      dataSubscription.dispose()
      terminal.dispose()
      terminalRef.current = null
    }
  }, [onResize, onWrite])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    if (!activeTerminal) {
      terminal.clear()
      terminal.writeln('No terminal session.')
      lastRenderedRef.current = { id: null, length: 0 }
      return
    }

    const lastRendered = lastRenderedRef.current
    if (lastRendered.id !== activeTerminal.id || activeTerminal.output.length < lastRendered.length) {
      terminal.clear()
      terminal.write(activeTerminal.output)
      lastRenderedRef.current = { id: activeTerminal.id, length: activeTerminal.output.length }
      return
    }

    const delta = activeTerminal.output.slice(lastRendered.length)
    if (delta) {
      terminal.write(delta)
      lastRenderedRef.current = { id: activeTerminal.id, length: activeTerminal.output.length }
    }
  }, [activeTerminal])

  return <div className="xterm-host" ref={containerRef} />
}
