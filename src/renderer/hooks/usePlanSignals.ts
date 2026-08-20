import { useEffect } from 'react'
import { usePlanStore } from '../stores/plan.store'

export function usePlanSignals(): void {
  const receive = usePlanStore((state) => state.receive)
  useEffect(() => window.pivot.onSignal('plan:updated', receive), [receive])
}
