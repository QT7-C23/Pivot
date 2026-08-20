import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis semantic Reviewer contract boundaries', () => {
  it('keeps the strict contract in Shared without privileged dependencies', () => {
    const source = readFileSync(path.resolve('src/shared/axis-semantic-review-contracts.ts'), 'utf8')
    expect(source).toContain("from 'zod'")
    expect(source).not.toMatch(/from ['"]\.\.\/main\//)
    expect(source).not.toMatch(/from ['"]\.\.\/renderer\//)
    expect(source).not.toContain('Database')
    expect(source).not.toContain('node:fs')
  })
})
