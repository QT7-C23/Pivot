import path from 'node:path'

export function resolveUserDataPath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  electronDefault: string,
): string {
  const isolatedPath = env['PIVOT_E2E_USER_DATA']
  if (isolatedPath) return isolatedPath
  if (platform === 'win32' && env['LOCALAPPDATA']) {
    return path.win32.join(env['LOCALAPPDATA'], 'Pivot')
  }
  return electronDefault
}
