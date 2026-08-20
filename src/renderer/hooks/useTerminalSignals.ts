import { useEffect } from 'react'
import { useTerminalStore } from '../stores/terminal.store'

export function useTerminalSignals(): void {
  const appendOutput = useTerminalStore((state) => state.appendOutput)
  const markExited = useTerminalStore((state) => state.markExited)

  useEffect(() => {
    const unsubscribeData = window.pivot.onSignal('term:data', ({ data, id }) => {
      appendOutput(id, data)
    })
    const unsubscribeExit = window.pivot.onSignal('term:exit', ({ exitCode, id }) => {
      markExited(id, exitCode)
    })

    return () => {
      unsubscribeData()
      unsubscribeExit()
    }
  }, [appendOutput, markExited])
}
