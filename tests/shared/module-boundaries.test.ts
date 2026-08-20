import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = path.resolve('src')

describe('module import boundaries', () => {
  it('keeps renderer, main, and shared dependency directions acyclic', async () => {
    const violations: string[] = []
    for (const relativePath of await sourceFiles()) {
      const normalized = relativePath.replaceAll('\\', '/')
      const content = await readFile(path.join(sourceRoot, relativePath), 'utf8')
      const imports = [...content.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map((match) => match[2])

      for (const importPath of imports) {
        if (normalized.startsWith('renderer/') && importPath.includes('/main/')) {
          violations.push(`${normalized} imports main process code: ${importPath}`)
        }
        if (normalized.startsWith('shared/') && (importPath.includes('/main/') || importPath.includes('/renderer/'))) {
          violations.push(`${normalized} imports an application layer: ${importPath}`)
        }
        if (normalized.startsWith('main/') && importPath.includes('/renderer/')) {
          violations.push(`${normalized} imports renderer code: ${importPath}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})

async function sourceFiles(): Promise<string[]> {
  const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => path.relative(sourceRoot, path.join(entry.parentPath, entry.name)))
}
