export const terminalService = {
  create(sessionId: string, cwd: string, cols?: number, rows?: number): Promise<string> {
    return window.pivot.invoke('term:create', { cols, cwd, rows, sessionId })
  },

  destroy(id: string): Promise<void> {
    return window.pivot.invoke('term:destroy', { id })
  },

  resize(id: string, cols: number, rows: number): Promise<void> {
    return window.pivot.invoke('term:resize', { cols, id, rows })
  },

  write(id: string, data: string): Promise<void> {
    return window.pivot.invoke('term:write', { data, id })
  },
}
