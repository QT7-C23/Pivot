export interface SessionAgentRevocationPort {
  abort(sessionId: string): void
  abortAll(): void
  clearPermissionSession(sessionId: string): void
}

export interface SessionTerminalRevocationPort {
  destroyAll(): void
  destroyForOwner(ownerId: number): void
  destroyForSession(sessionId: string): void
}

export interface SessionWatcherRevocationPort {
  disposeAll(): Promise<void>
  disposeOwner(ownerId: number): Promise<void>
  disposeSession(sessionId: string): Promise<void>
}

export class SessionCapabilityRevocationCoordinator {
  constructor(private readonly capabilities: {
    agents: SessionAgentRevocationPort
    terminals: SessionTerminalRevocationPort
    watchers: SessionWatcherRevocationPort
  }) {}

  async revokeSession(sessionId: string): Promise<void> {
    this.capabilities.agents.abort(sessionId)
    this.capabilities.agents.clearPermissionSession(sessionId)
    this.capabilities.terminals.destroyForSession(sessionId)
    await this.capabilities.watchers.disposeSession(sessionId)
  }

  async revokeRenderer(ownerId: number): Promise<void> {
    this.capabilities.terminals.destroyForOwner(ownerId)
    await this.capabilities.watchers.disposeOwner(ownerId)
  }

  async close(): Promise<void> {
    this.capabilities.agents.abortAll()
    this.capabilities.terminals.destroyAll()
    await this.capabilities.watchers.disposeAll()
  }
}
