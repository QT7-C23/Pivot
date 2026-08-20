import { useEffect } from 'react'
import { usePermissionStore } from '../stores/permission.store'

export function usePermissionSignals(): void {
  const addRequest = usePermissionStore((state) => state.addRequest)
  const dismissRequest = usePermissionStore((state) => state.dismissRequest)

  useEffect(() => {
    const unsubscribeRequest = window.pivot.onSignal('permission:request', (request) => {
      addRequest(request)
    })
    const unsubscribeResolved = window.pivot.onSignal('permission:resolved', ({ requestId }) => {
      dismissRequest(requestId)
    })
    return () => {
      unsubscribeRequest()
      unsubscribeResolved()
    }
  }, [addRequest, dismissRequest])
}
