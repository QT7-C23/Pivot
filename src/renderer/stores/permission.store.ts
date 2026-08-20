import { create } from 'zustand'
import type { PermissionDecision, PermissionRequest } from '../../shared/types/domain'
import { permissionService } from '../services/permission.service'

export interface PermissionStore {
  error: string | null
  pending: PermissionRequest[]

  addRequest: (request: PermissionRequest) => void
  dismissRequest: (requestId: string) => void
  respond: (requestId: string, behavior: PermissionDecision) => Promise<void>
}

export const usePermissionStore = create<PermissionStore>((set) => ({
  error: null,
  pending: [],

  addRequest(request) {
    set((state) => ({
      pending: [
        ...state.pending.filter((item) => item.requestId !== request.requestId),
        request,
      ],
    }))
  },

  dismissRequest(requestId) {
    set((state) => ({
      pending: state.pending.filter((item) => item.requestId !== requestId),
    }))
  },

  async respond(requestId, behavior) {
    try {
      await permissionService.respond(requestId, behavior)
      set((state) => ({
        error: null,
        pending: state.pending.filter((item) => item.requestId !== requestId),
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to respond to permission request' })
    }
  },
}))
