import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APP_RELEASE_VERSION,
  APP_VERSION,
} from '../../src/shared/app-version'

describe('Beta-2.x internal release qualification contract', () => {
  it('uses the Beta-2.x display name and matching legal SemVer', () => {
    const packageJson = readJson('package.json') as {
      scripts: Record<string, string>
      version: string
    }

    expect(APP_VERSION).toBe('Beta-2.0.22')
    expect(APP_RELEASE_VERSION).toBe('2.0.22-beta')
    expect(packageJson.version).toBe(APP_RELEASE_VERSION)
    expect(packageJson.scripts['verify:beta2']).toBe(
      'npm run verify:mvp && npm run verify:performance && node scripts/e2e-smoke.mjs --now',
    )
  })

  it('ships the decided Apache-2.0 license and third-party notices as release resources', () => {
    const license = readFileSync(path.resolve('LICENSE'), 'utf8')
    const packageJson = readJson('package.json') as {
      build: { extraResources: Array<{ from: string; to: string }> }
      license: string
    }
    const resources = packageJson.build.extraResources

    expect(packageJson.license).toBe('Apache-2.0')
    expect(license).toContain('Apache License')
    expect(license).toContain('Version 2.0, January 2004')
    for (let section = 1; section <= 9; section += 1) {
      expect(license).toMatch(new RegExp(`\\n\\s*${section}\\.`))
    }
    expect(resources).toContainEqual({ from: 'LICENSE', to: 'LICENSE' })
    expect(resources).toContainEqual({
      from: 'THIRD_PARTY_NOTICES.md',
      to: 'THIRD_PARTY_NOTICES.md',
    })
  })

  it('keeps the Beta-2 gate package-free and documents external distribution gaps', () => {
    const packageJson = readJson('package.json') as {
      scripts: Record<string, string>
    }
    const readme = readFileSync(path.resolve('README.md'), 'utf8')

    expect(packageJson.scripts['verify:beta2']).not.toMatch(/dist:|builder|portable/i)
    expect(readme).toMatch(/Beta-2\.0 internal/i)
    expect(readme).toMatch(/code-signing|signing/i)
    expect(readme).toMatch(/previous-version upgrade|upgrade\/rollback/i)
  })
})

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(path.resolve(filePath), 'utf8')) as unknown
}
