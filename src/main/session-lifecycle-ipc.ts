import type { SessionRecord } from '../shared/types/domain'
import { handle } from './ipc-registration'

export interface SessionCapabilityRevocationPort {
  revokeSession(sessionId: string): Promise<void>
}

export interface SessionBindingLifecyclePort {
  bindSession(session: SessionRecord): Promise<SessionRecord>
  closeSession(sessionId: string, commitClose: () => SessionRecord): SessionRecord
}

export interface SessionLifecycleRegistryPort {
  fork(id: string): SessionRecord
  getActive(id: string): SessionRecord | null
  softDelete(id: string): SessionRecord
  undoDelete(id: string): SessionRecord
}

export function registerSessionLifecycleIpc(options: {
  capabilities: SessionCapabilityRevocationPort
  lifecycle: SessionBindingLifecyclePort
  lifecycleReady: Promise<void>
  sessions: SessionLifecycleRegistryPort
}): void {
  handle('session:get', async ({ id }) => options.sessions.getActive(id))
  handle('session:soft-delete', async ({ id }) => {
    await options.lifecycleReady
    await options.capabilities.revokeSession(id)
    return options.lifecycle.closeSession(id, () => options.sessions.softDelete(id))
  })
  handle('session:undo-delete', async ({ id }) => {
    await options.lifecycleReady
    return options.lifecycle.bindSession(options.sessions.undoDelete(id))
  })
  handle('session:fork', async ({ id }) => {
    await options.lifecycleReady
    return options.lifecycle.bindSession(options.sessions.fork(id))
  })
}
