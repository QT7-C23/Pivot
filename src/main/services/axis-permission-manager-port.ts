import type { AxisToolPermissionOutcome, AxisToolPermissionPort, AxisToolPermissionRequest } from './axis-permission-grant-collector'
import type { PermissionManager, PermissionSignalSender } from './permission-manager'

export class AxisPermissionManagerPort implements AxisToolPermissionPort {
  private readonly permissions: PermissionManager
  private readonly sendSignal: PermissionSignalSender

  constructor(options: { permissions: PermissionManager; sendSignal: PermissionSignalSender }) {
    this.permissions = options.permissions
    this.sendSignal = options.sendSignal
  }

  async request(input: AxisToolPermissionRequest, signal?: AbortSignal): Promise<AxisToolPermissionOutcome> {
    try {
      return await this.permissions.requestDetailed({
        input: {
          assignedFiles: [...input.assignedFiles],
          taskId: input.taskId,
        },
        runId: input.runId,
        sessionId: input.sessionId,
        toolName: input.toolName,
      }, this.sendSignal, signal)
    } catch {
      return { behavior: 'deny', reason: 'error' }
    }
  }
}
