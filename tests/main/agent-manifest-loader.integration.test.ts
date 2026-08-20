import { describe, expect, it } from 'vitest'
import { parseAgentManifest } from '../../src/main/services/agent-manifest-loader'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

function findAgentFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = resolve(dir, entry)
    const relPath = resolve(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      files.push(...findAgentFiles(fullPath, baseDir))
    } else if (entry.endsWith('.agent.md')) {
      files.push(fullPath)
    }
  }
  return files
}

describe('loadAgentManifest — real .agent.md files', () => {
  const examplesDir = resolve('.agents/examples')
  const files = findAgentFiles(examplesDir)

  it('finds at least 4 example files', () => {
    expect(files.length).toBeGreaterThanOrEqual(4)
  })

  for (const filePath of files) {
    it(`parses ${filePath.replace(/^.*[\\/]\.agents[\\/]examples[\\/]/, '')} successfully`, () => {
      const source = readFileSync(filePath, 'utf-8')
      const manifest = parseAgentManifest(source)

      expect(manifest).not.toBeNull()
      expect(manifest!.name).toBeTruthy()
      expect(manifest!.version).toBeTruthy()
      expect(manifest!.description).toBeTruthy()
    })
  }
})
