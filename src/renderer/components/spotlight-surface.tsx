import {
  useCallback,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { getSpotlightPosition, supportsSpotlightPointer } from '../lib/spotlight'

interface SpotlightHandlers<T extends HTMLElement> {
  onPointerEnter: (event: ReactPointerEvent<T>) => void
  onPointerLeave: () => void
  onPointerMove: (event: ReactPointerEvent<T>) => void
  ref: React.RefObject<T | null>
}

function useSpotlightSurface<T extends HTMLElement>(): SpotlightHandlers<T> {
  const ref = useRef<T>(null)
  const frameRef = useRef<number | null>(null)
  const pointRef = useRef({ clientX: 0, clientY: 0 })

  const cancelPendingFrame = useCallback(() => {
    if (frameRef.current === null) return
    window.cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  const onPointerEnter = useCallback((event: ReactPointerEvent<T>) => {
    if (!supportsSpotlightPointer(event.pointerType)) return
    event.currentTarget.style.setProperty('--spotlight-opacity', '1')
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    if (!supportsSpotlightPointer(event.pointerType)) return
    pointRef.current = { clientX: event.clientX, clientY: event.clientY }
    if (frameRef.current !== null) return

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      const surface = ref.current
      if (!surface) return
      const { x, y } = getSpotlightPosition(pointRef.current.clientX, pointRef.current.clientY, surface.getBoundingClientRect())
      surface.style.setProperty('--spotlight-x', `${x}px`)
      surface.style.setProperty('--spotlight-y', `${y}px`)
    })
  }, [])

  const onPointerLeave = useCallback(() => {
    cancelPendingFrame()
    ref.current?.style.setProperty('--spotlight-opacity', '0')
  }, [cancelPendingFrame])

  useEffect(() => cancelPendingFrame, [cancelPendingFrame])

  return { onPointerEnter, onPointerLeave, onPointerMove, ref }
}

export function SpotlightSurface({ children, className = '' }: { children: ReactNode; className?: string }): ReactElement {
  const spotlight = useSpotlightSurface<HTMLElement>()
  return <article {...spotlight} className={`spotlight-surface ${className}`.trim()}>{children}</article>
}

export function SpotlightButton({ children, className = '', onPointerEnter, onPointerLeave, onPointerMove, ...props }: ButtonHTMLAttributes<HTMLButtonElement>): ReactElement {
  const spotlight = useSpotlightSurface<HTMLButtonElement>()
  return (
    <button
      {...props}
      className={`spotlight-surface ${className}`.trim()}
      onPointerEnter={(event) => { spotlight.onPointerEnter(event); onPointerEnter?.(event) }}
      onPointerLeave={(event) => { spotlight.onPointerLeave(); onPointerLeave?.(event) }}
      onPointerMove={(event) => { spotlight.onPointerMove(event); onPointerMove?.(event) }}
      ref={spotlight.ref}
    >
      {children}
    </button>
  )
}
