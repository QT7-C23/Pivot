import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cn } from '../../src/renderer/lib/cn'

describe('UI foundation', () => {
  it('merges conditional and conflicting utility classes deterministically', () => {
    expect(cn('px-2', false && 'hidden', ['px-4', 'text-sm'])).toBe('px-4 text-sm')
  })

  it('keeps Tailwind namespaced and excludes preflight from the existing Figma-aligned UI', async () => {
    const stylesheet = await readFile(path.resolve('src/renderer/tailwind.css'), 'utf8')
    const button = await readFile(path.resolve('src/renderer/components/ui-button.tsx'), 'utf8')

    expect(stylesheet).toContain('prefix(pv)')
    expect(stylesheet).not.toContain('preflight.css')
    expect(button).toContain("from 'class-variance-authority'")
    expect(button).toContain("from '../lib/cn'")
  })
})
