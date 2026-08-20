import type { PermissionDecision } from '../../shared/types/domain'

export const permissionService = {
  respond(requestId: string, behavior: PermissionDecision): Promise<void> {
    return window.pivot.invoke('chat:permission', { behavior, requestId })
  },
}
