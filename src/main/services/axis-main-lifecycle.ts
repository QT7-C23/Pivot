import type { AxisProjectBindingAdminPort } from './axis-project-binding-ports'
import type { AxisLeaseLifecyclePort } from './axis-run-lease-lifecycle'

export interface AxisSessionProject {
  id: string
  projectPath: string
}

export class AxisMainLifecycleCoordinator {
  private readonly bindings: Pick<
    AxisProjectBindingAdminPort,
    'bind' | 'unbindSession'
  >
  private readonly leases: AxisLeaseLifecyclePort

  constructor(options: {
    bindings: Pick<AxisProjectBindingAdminPort, 'bind' | 'unbindSession'>
    leases: AxisLeaseLifecyclePort
  }) {
    this.bindings = options.bindings
    this.leases = options.leases
  }

  async initialize(sessions: readonly AxisSessionProject[]): Promise<void> {
    for (const session of sessions) {
      await this.bindSession(session)
    }
  }

  async bindSession<T extends AxisSessionProject>(session: T): Promise<T> {
    await this.bindings.bind({
      projectRoot: session.projectPath,
      sessionId: session.id,
    })
    return session
  }

  closeSession<T>(sessionId: string, commitClose: () => T): T {
    this.leases.cleanup({
      reason: 'session-closed',
      scope: 'session',
      sessionId,
    })
    this.bindings.unbindSession(sessionId)
    return commitClose()
  }

  deleteSession(sessionId: string, commitDeletion: () => void): void {
    this.leases.cleanup({
      reason: 'session-deleted',
      scope: 'session',
      sessionId,
    })
    this.bindings.unbindSession(sessionId)
    commitDeletion()
  }

  shutdown(sessionIds: readonly string[]): void {
    for (const sessionId of sessionIds) {
      this.leases.cleanup({
        reason: 'shutdown',
        scope: 'session',
        sessionId,
      })
    }
  }
}
