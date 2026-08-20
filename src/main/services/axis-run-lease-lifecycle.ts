import {
  AxisLeaseCleanupReceiptSchema,
  AxisLeaseCleanupRequestSchema,
  type AxisLeaseCleanupReceipt,
  type AxisLeaseCleanupRequest,
} from '../../shared/axis-project-binding-contracts'
import type { AxisFileLeaseAdminPort } from './axis-file-lease-ports'

export interface AxisLeaseLifecyclePort {
  cleanup(request: AxisLeaseCleanupRequest): AxisLeaseCleanupReceipt
}

export class AxisRunLeaseLifecycleCoordinator implements AxisLeaseLifecyclePort {
  private readonly clock: () => Date
  private readonly leases: Pick<
    AxisFileLeaseAdminPort,
    'releaseForRun' | 'releaseForSession'
  >

  constructor(options: {
    clock?: () => Date
    leases: Pick<AxisFileLeaseAdminPort, 'releaseForRun' | 'releaseForSession'>
  }) {
    this.clock = options.clock ?? (() => new Date())
    this.leases = options.leases
  }

  cleanup(requestInput: AxisLeaseCleanupRequest): AxisLeaseCleanupReceipt {
    const request = AxisLeaseCleanupRequestSchema.parse(requestInput)
    const releasedLeaseCount = request.scope === 'run'
      ? this.leases.releaseForRun({
          runId: request.runId,
          sessionId: request.sessionId,
        })
      : this.leases.releaseForSession({ sessionId: request.sessionId })

    return AxisLeaseCleanupReceiptSchema.parse({
      cleanedAt: this.clock().toISOString(),
      reason: request.reason,
      releasedLeaseCount,
      runId: request.scope === 'run' ? request.runId : null,
      schemaVersion: 1,
      scope: request.scope,
      sessionId: request.sessionId,
    })
  }
}
