import { create } from 'zustand'
import type {
  AgentAdapterInfo,
  AgentCliCustomProfileConfig,
  AgentCliMaintenanceAction,
  AgentCliMaintenanceResult,
  AgentCliProfile,
  AgentCliProfileId,
} from '../../shared/types/domain'
import { agentService } from '../services/agent.service'

export type AgentState = 'idle' | 'thinking' | 'writing' | 'executing' | 'waiting_permission' | 'error'

export interface AgentOperation {
  id: string
  description: string
  status: 'pending' | 'running' | 'done' | 'error'
}

export interface AgentStore {
  state: AgentState
  currentTask: string | null
  adapterInfo: AgentAdapterInfo | null
  cliProfiles: AgentCliProfile[]
  lastMaintenanceResult: AgentCliMaintenanceResult | null
  maintenanceInProgress: string | null
  error: string | null
  operations: AgentOperation[]
  tokenUsage: { in: number; out: number }

  loadAdapterInfo: () => Promise<void>
  loadCliProfiles: () => Promise<void>
  configureCustomProfile: (config: AgentCliCustomProfileConfig) => Promise<void>
  dismissMaintenanceResult: () => void
  runCliMaintenance: (profileId: AgentCliProfileId, action: AgentCliMaintenanceAction) => Promise<void>
  resetRunState: () => void
  selectCliProfile: (profileId: AgentCliProfileId) => Promise<void>
  setState: (state: AgentState) => void
  setCurrentTask: (task: string | null) => void
  addOperation: (op: AgentOperation) => void
  upsertOperation: (op: AgentOperation) => void
  updateOperation: (id: string, status: AgentOperation['status']) => void
  setTokenUsage: (usage: { in: number; out: number }) => void
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  state: 'idle',
  currentTask: null,
  adapterInfo: null,
  cliProfiles: [],
  lastMaintenanceResult: null,
  maintenanceInProgress: null,
  error: null,
  operations: [],
  tokenUsage: { in: 0, out: 0 },

  async loadAdapterInfo() {
    try {
      const adapterInfo = await agentService.info()
      set({ adapterInfo, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load agent adapter info' })
    }
  },

  async loadCliProfiles() {
    try {
      const cliProfiles = await agentService.profiles()
      set({ cliProfiles, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load CLI profiles' })
    }
  },

  async configureCustomProfile(config) {
    try {
      const customProfile = await agentService.configureCustomProfile(config)
      set((state) => ({
        cliProfiles: state.cliProfiles.some((profile) => profile.id === 'custom')
          ? state.cliProfiles.map((profile) => (profile.id === 'custom' ? customProfile : profile))
          : [...state.cliProfiles, customProfile],
        error: null,
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to configure custom CLI profile' })
    }
  },

  async runCliMaintenance(profileId, action) {
    set({ error: null, maintenanceInProgress: `${profileId}:${action}` })
    try {
      const lastMaintenanceResult = await agentService.runCliMaintenance(profileId, action)
      set({ error: null, lastMaintenanceResult, maintenanceInProgress: null })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to run CLI ${action}`
      if (isMissingExecutableError(errorMessage)) {
        const profile = get().cliProfiles.find((candidate) => candidate.id === profileId)
        const commandSpec = action === 'version' ? profile?.versionCommand : profile?.updateCommand
        set({
          error: null,
          lastMaintenanceResult: {
            action,
            args: commandSpec?.args ?? [],
            command: commandSpec?.command ?? profile?.adapterCommand ?? profileId,
            exitCode: null,
            output: errorMessage,
            outputTruncated: false,
            profileId,
            timedOut: false,
            unavailable: true,
          },
          maintenanceInProgress: null,
        })
        return
      }
      set({
        error: errorMessage,
        lastMaintenanceResult: null,
        maintenanceInProgress: null,
      })
    }
  },

  dismissMaintenanceResult: () => set({ lastMaintenanceResult: null }),

  async selectCliProfile(profileId) {
    try {
      const adapterInfo = await agentService.selectProfile(profileId)
      const cliProfiles = await agentService.profiles()
      set({ adapterInfo, cliProfiles, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to select CLI profile' })
    }
  },

  resetRunState: () => {
    set({ currentTask: null, operations: [], state: 'idle', tokenUsage: { in: 0, out: 0 } })
  },

  setState: (state) => {
    set({ state })
  },

  setCurrentTask: (currentTask) => {
    set({ currentTask })
  },

  addOperation: (op) => {
    set((state) => ({ operations: [...state.operations, op] }))
  },

  upsertOperation: (op) => {
    set((state) => {
      const exists = state.operations.some((operation) => operation.id === op.id)
      return {
        operations: exists
          ? state.operations.map((operation) => (operation.id === op.id ? op : operation))
          : [...state.operations, op],
      }
    })
  },

  updateOperation: (id, status) => {
    set((state) => ({
      operations: state.operations.map((operation) =>
        operation.id === id ? { ...operation, status } : operation,
      ),
    }))
  },

  setTokenUsage: (tokenUsage) => {
    set({ tokenUsage })
  },
}))

function isMissingExecutableError(message: string): boolean {
  return /\bENOENT\b|executable (?:was )?not found|cannot find (?:the )?(?:file|executable)/i.test(message)
}
