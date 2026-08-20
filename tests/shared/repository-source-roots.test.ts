import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('repository source roots', () => {
  it('keeps security-audit source snapshots outside production and AI source discovery', () => {
    const ignore = readFileSync(path.resolve('.gitignore'), 'utf8')
    expect(ignore).toContain('pivot-security-audit/src/')
    expect(ignore).toContain('pivot-security-audit/tests/')
    expect(ignore).toContain('.tmp/')

    const tsconfig = JSON.parse(readFileSync(path.resolve('tsconfig.json'), 'utf8')) as { include: string[] }
    expect(tsconfig.include).not.toContain('pivot-security-audit')
    expect(tsconfig.include).toContain('src')
    expect(tsconfig.include).toContain('tests')
  })
})
