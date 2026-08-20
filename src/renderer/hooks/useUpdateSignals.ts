import { useEffect } from 'react'
import { useUpdateStore } from '../stores/update.store'

export function useUpdateSignals(): void {
  const receive = useUpdateStore((state) => state.receive)
  useEffect(() => window.pivot.onSignal('update:state', receive), [receive])
}
