export interface HardwareAccelerationPolicy {
  disableGpuSandbox: boolean
  disableHardwareAcceleration: boolean
}

export function shouldDisableHardwareAcceleration(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (env['PIVOT_DISABLE_HARDWARE_ACCELERATION'] === '1') return true
  if (platform !== 'win32') return false
  return env['PIVOT_ENABLE_HARDWARE_ACCELERATION'] !== '1'
}

export function resolveHardwareAccelerationPolicy(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): HardwareAccelerationPolicy {
  const disableHardwareAcceleration = shouldDisableHardwareAcceleration(env, platform)
  return {
    disableGpuSandbox: platform === 'win32' && disableHardwareAcceleration,
    disableHardwareAcceleration,
  }
}
