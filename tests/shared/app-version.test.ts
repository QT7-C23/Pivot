import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_RELEASE_VERSION, APP_VERSION } from '../../src/shared/app-version'

describe('application version contract', () => {
  it('matches the package version used by Electron Builder', () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve('package.json'), 'utf8'),
    ) as { version: string }

    expect(APP_VERSION).toBe('Beta-2.0.21')
    expect(APP_RELEASE_VERSION).toBe('2.0.21-beta')
    expect(packageJson.version).toBe(APP_RELEASE_VERSION)
  })
})
