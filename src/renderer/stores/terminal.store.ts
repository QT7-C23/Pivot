import { create } from 'zustand'
import { terminalService } from '../services/terminal.service'

export interface TerminalInstance {
  cwd: string
  exitCode?: number
  id: string
  isActive: boolean
  output: string
  sessionId: string
  status: 'running' | 'exited'
}

export interface TerminalStore {
  activeTerminalId: string | null
  error: string | null
  instances: TerminalInstance[]

  appendOutput: (id: string, data: string) => void
  createTerminal: (sessionId: string, cwd: string) => Promise<void>
  destroyTerminal: (id: string) => Promise<void>
  ensureTerminalForProject: (sessionId: string, cwd: string) => Promise<void>
  markExited: (id: string, exitCode: number) => void
  resizeActive: (cols: number, rows: number) => Promise<void>
  sendToActive: (data: string) => Promise<void>
  setActiveTerminal: (id: string) => void
}

const MAX_BUFFER_LENGTH = 80_000

function trimBuffer(output: string): string {
  if (output.length <= MAX_BUFFER_LENGTH) {
    return output
  }

  return output.slice(output.length - MAX_BUFFER_LENGTH)
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  activeTerminalId: null,
  error: null,
  instances: [],

  appendOutput(id, data) {
    set((state) => ({
      instances: state.instances.map((instance) =>
        instance.id === id
          ? { ...instance, output: trimBuffer(`${instance.output}${data}`) }
          : instance,
      ),
    }))
  },

  async createTerminal(sessionId, cwd) {
    try {
      const id = await terminalService.create(sessionId, cwd)
      set((state) => ({
        activeTerminalId: id,
        error: null,
        instances: [
          ...state.instances.map((instance) => ({ ...instance, isActive: false })),
          {
            cwd,
            id,
            isActive: true,
            output: '',
            sessionId,
            status: 'running',
          },
        ],
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to create terminal' })
    }
  },

  async destroyTerminal(id) {
    try {
      await terminalService.destroy(id)
      set((state) => {
        const instances = state.instances.filter((instance) => instance.id !== id)
        const activeTerminalId = state.activeTerminalId === id ? (instances.at(-1)?.id ?? null) : state.activeTerminalId

        return {
          activeTerminalId,
          error: null,
          instances: instances.map((instance) => ({
            ...instance,
            isActive: instance.id === activeTerminalId,
          })),
        }
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to destroy terminal' })
    }
  },

  async ensureTerminalForProject(sessionId, cwd) {
    const trimmed = cwd.trim()
    if (!trimmed) {
      return
    }

    const existing = get().instances.find(
      (instance) => instance.sessionId === sessionId && instance.cwd === trimmed && instance.status === 'running',
    )
    if (existing) {
      get().setActiveTerminal(existing.id)
      set({ error: null })
      return
    }

    await get().createTerminal(sessionId, trimmed)
  },

  markExited(id, exitCode) {
    set((state) => {
      const exitedInstances = state.instances.map((instance) =>
        instance.id === id ? { ...instance, exitCode, isActive: false, status: 'exited' as const } : instance,
      )
      const activeTerminalId = state.activeTerminalId === id
        ? ([...exitedInstances].reverse().find((instance) => instance.status === 'running')?.id ?? null)
        : state.activeTerminalId
      return {
        activeTerminalId,
        instances: exitedInstances.map((instance) => ({
          ...instance,
          isActive: instance.id === activeTerminalId,
        })),
      }
    })
  },

  async resizeActive(cols, rows) {
    const id = get().activeTerminalId
    if (!id) {
      return
    }

    try {
      await terminalService.resize(id, cols, rows)
      set({ error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to resize terminal' })
    }
  },

  async sendToActive(data) {
    const id = get().activeTerminalId
    if (!id) {
      return
    }

    try {
      await terminalService.write(id, data)
      set({ error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to write to terminal' })
    }
  },

  setActiveTerminal(id) {
    set((state) => ({
      activeTerminalId: id,
      instances: state.instances.map((instance) => ({
        ...instance,
        isActive: instance.id === id,
      })),
    }))
  },
}))
