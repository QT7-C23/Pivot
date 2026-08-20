import type { SessionCapabilityRevocationPort } from './session-lifecycle-ipc'

export interface SessionOwnedDataDeletionPort {
  deleteForSession(sessionId: string): void
}

export interface SessionDeletionLifecyclePort {
  deleteSession(sessionId: string, commitDeletion: () => void): void
}

export interface SessionRecordDeletionPort {
  delete(sessionId: string): void
  get(sessionId: string): { deletedAt: string | null } | null
}

export class SessionPermanentDeletionCoordinator {
  constructor(private readonly dependencies: {
    capabilities: SessionCapabilityRevocationPort
    lifecycle: SessionDeletionLifecyclePort
    ownedData: readonly SessionOwnedDataDeletionPort[]
    sessions: SessionRecordDeletionPort
  }) {}

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.dependencies.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    if (!session.deletedAt) throw new Error('Permanent deletion requires a soft-deleted Session')
    await this.dependencies.capabilities.revokeSession(sessionId)
    this.dependencies.lifecycle.deleteSession(sessionId, () => {
      for (const store of this.dependencies.ownedData) store.deleteForSession(sessionId)
      this.dependencies.sessions.delete(sessionId)
    })
  }
}
