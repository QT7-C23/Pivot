import { describe, expect, it } from 'vitest'
import {
  resolveHardwareAccelerationPolicy,
  shouldDisableHardwareAcceleration,
} from '../../src/main/services/hardware-acceleration'

describe('hardware acceleration startup policy', () => {
  it('defaults to software rendering on Windows', () => {
    expect(shouldDisableHardwareAcceleration({}, 'win32')).toBe(true)
  })

  it('allows an explicit Windows hardware acceleration opt-in', () => {
    expect(shouldDisableHardwareAcceleration({ PIVOT_ENABLE_HARDWARE_ACCELERATION: '1' }, 'win32')).toBe(false)
  })

  it('honors the portable disable flag on every platform', () => {
    expect(shouldDisableHardwareAcceleration({ PIVOT_DISABLE_HARDWARE_ACCELERATION: '1' }, 'darwin')).toBe(true)
  })

  it('keeps the platform default outside Windows', () => {
    expect(shouldDisableHardwareAcceleration({}, 'linux')).toBe(false)
  })

  it('disables only the GPU sandbox with the Windows software-rendering fallback', () => {
    expect(resolveHardwareAccelerationPolicy({}, 'win32')).toEqual({
      disableGpuSandbox: true,
      disableHardwareAcceleration: true,
    })
  })

  it('keeps the GPU sandbox when Windows hardware acceleration is explicitly enabled', () => {
    expect(
      resolveHardwareAccelerationPolicy(
        { PIVOT_ENABLE_HARDWARE_ACCELERATION: '1' },
        'win32',
      ),
    ).toEqual({
      disableGpuSandbox: false,
      disableHardwareAcceleration: false,
    })
  })
})
