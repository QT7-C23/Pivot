import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = path.resolve('src')

describe('source module size boundary', () => {
  it('keeps every TypeScript module within the 800-line hard ceiling', async () => {
    const violations: string[] = []
    for (const relativePath of await sourceFiles()) {
      const source = await readFile(path.join(sourceRoot, relativePath), 'utf8')
      const lines = source.split(/\r?\n/).length
      if (lines > 800) violations.push(`${relativePath.replaceAll('\\', '/')}: ${lines} lines`)
    }
    expect(violations).toEqual([])
  })

  it('requires an explicit reviewed allowlist for modules above the 400-line target', async () => {
    const allowed = new Set([
      'main/ipc-handlers.ts',
      'main/main.ts',
      'main/services/axis-guarded-safe-write.ts',
      'main/services/axis-pivot-dedicated-fixer-action-handler.ts',
      'main/services/axis-pivot-self-repair-action-handler.ts',
      'main/services/axis-production-pivot-runtime.ts',
      'main/services/session-registry.ts',
      'main/services/sqlite-axis-file-lease-store.ts',
      'renderer/i18n/locale.ts',
      'renderer/pivot-app.tsx',
      'shared/axis-engine-contracts.ts',
      'shared/axis-execution-contracts.ts',
      'shared/axis-pivot-action-contracts.ts',
      'shared/axis-run-state.ts',
      'shared/ipc-validation.ts',
      'shared/types/domain.ts',
    ])
    const large: string[] = []
    for (const relativePath of await sourceFiles()) {
      const normalized = relativePath.replaceAll('\\', '/')
      const lines = (await readFile(path.join(sourceRoot, relativePath), 'utf8')).split(/\r?\n/).length
      if (lines > 400) large.push(normalized)
    }
    expect(large.sort()).toEqual([...allowed].sort())
  })
})

async function sourceFiles(): Promise<string[]> {
  const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => path.relative(sourceRoot, path.join(entry.parentPath, entry.name)))
}
