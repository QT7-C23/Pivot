import { useEffect } from 'react'
import type { SignalMap } from '../../shared/signal-channel'

type QuickCaptureSource = SignalMap['app:quick-capture']['source']
type QuickCaptureHandler = (payload: SignalMap['app:quick-capture']) => void
type OnQuickCaptureSignal = (
  signal: 'app:quick-capture',
  handler: QuickCaptureHandler,
) => () => void

export function subscribeQuickCaptureSignal(
  onCapture: (source: QuickCaptureSource) => void,
  onSignal: OnQuickCaptureSignal = (signal, handler) => window.pivot.onSignal(signal, handler),
): () => void {
  return onSignal('app:quick-capture', ({ source }) => onCapture(source))
}

export function useQuickCaptureSignal(
  onCapture: (source: QuickCaptureSource) => void,
): void {
  useEffect(
    () => subscribeQuickCaptureSignal(onCapture),
    [onCapture],
  )
}
