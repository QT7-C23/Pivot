export interface SpotlightBounds {
  height: number
  left: number
  top: number
  width: number
}

export interface SpotlightPosition {
  x: number
  y: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function getSpotlightPosition(clientX: number, clientY: number, bounds: SpotlightBounds): SpotlightPosition {
  return {
    x: clamp(clientX - bounds.left, 0, bounds.width),
    y: clamp(clientY - bounds.top, 0, bounds.height),
  }
}

export function supportsSpotlightPointer(pointerType: string): boolean {
  return pointerType === 'mouse' || pointerType === 'pen'
}
