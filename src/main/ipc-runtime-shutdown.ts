export interface RuntimeCapabilityShutdownPort {
  close(): Promise<void>
}

export interface RuntimeSessionLifecyclePort {
  shutdown(sessionIds: readonly string[]): void
}

export interface RuntimeSessionReaderPort {
  list(): readonly { id: string }[]
}

export interface RuntimeClosePort {
  close(): void
}

export class IpcRuntimeShutdownCoordinator {
  private closed = false
  private closing: Promise<void> | null = null

  constructor(private readonly dependencies: {
    capabilities: RuntimeCapabilityShutdownPort
    lifecycle: RuntimeSessionLifecyclePort
    resources: readonly (RuntimeClosePort | null)[]
    sessions: RuntimeSessionReaderPort
  }) {}

  async close(): Promise<void> {
    if (this.closed) return
    if (this.closing) return this.closing

    this.closing = this.closeBoundaries().finally(() => {
      this.closed = true
      this.closing = null
    })
    return this.closing
  }

  private async closeBoundaries(): Promise<void> {
    const errors: unknown[] = []
    try {
      await this.dependencies.capabilities.close()
    } catch (error) {
      errors.push(error)
    }

    try {
      this.dependencies.lifecycle.shutdown(this.dependencies.sessions.list().map((session) => session.id))
    } catch (error) {
      errors.push(error)
    }

    for (const resource of this.dependencies.resources) {
      try {
        resource?.close()
      } catch (error) {
        errors.push(error)
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'One or more runtime resources failed to close')
    }
  }
}
