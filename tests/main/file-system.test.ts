import { mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assertAbsolutePath,
  createProjectDirectory,
  createProjectFile,
  listProjectFilePaths,
  listProjectTree,
  readTextFile,
  resolvePathWithinRoot,
  resolveProjectPathWithinRoot,
  searchProjectFiles,
  writeTextFile,
} from '../../src/main/services/file-system'

let tempRoot = ''

beforeEach(async () => {
  tempRoot = path.join(os.tmpdir(), `pivot-fs-${Date.now()}`)
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

describe('file-system service', () => {
  it('requires absolute paths', () => {
    expect(() => assertAbsolutePath('relative/path')).toThrow('Expected an absolute path')
  })

  it('lists first-level project files and ignores heavy folders', async () => {
    await writeFile(path.join(tempRoot, 'README.md'), '# Pivot')
    await mkdir(path.join(tempRoot, 'src'))
    await mkdir(path.join(tempRoot, 'node_modules'))
    await mkdir(path.join(tempRoot, '.git'))

    const entries = await listProjectTree(tempRoot)

    expect(entries.map((entry) => entry.name)).toEqual(['src', 'README.md'])
  })

  it('reads small UTF-8 text files', async () => {
    const filePath = path.join(tempRoot, 'note.txt')
    await writeFile(filePath, 'hello pivot')

    await expect(readTextFile(tempRoot, filePath)).resolves.toBe('hello pivot')
  })

  it('writes UTF-8 text files through the fs contract', async () => {
    const filePath = path.join(tempRoot, 'draft.txt')

    await writeTextFile(tempRoot, filePath, 'saved from pivot')

    await expect(readTextFile(tempRoot, filePath)).resolves.toBe('saved from pivot')
  })

  it('creates files and directories without overwriting existing entries', async () => {
    const folder = path.join(tempRoot, 'feature')
    const file = path.join(folder, 'index.ts')

    await expect(createProjectDirectory(tempRoot, folder)).resolves.toMatchObject({ name: 'feature', type: 'directory' })
    await expect(createProjectFile(tempRoot, file)).resolves.toMatchObject({ name: 'index.ts', type: 'file' })
    await expect(createProjectFile(tempRoot, file)).rejects.toMatchObject({ code: 'EEXIST' })
  })

  it('rejects sibling paths that only share the project name prefix', async () => {
    const siblingRoot = `${tempRoot}-outside`
    await mkdir(siblingRoot, { recursive: true })
    const outsideFile = path.join(siblingRoot, 'secret.txt')
    await writeFile(outsideFile, 'not in the project')

    await expect(resolvePathWithinRoot(tempRoot, outsideFile)).rejects.toThrow('outside the project root')
    await expect(readTextFile(tempRoot, outsideFile)).rejects.toThrow('outside the project root')
    await rm(siblingRoot, { recursive: true, force: true })
  })

  it('allows new files only when their existing parent is inside the project root', async () => {
    const nestedRoot = path.join(tempRoot, 'src')
    await mkdir(nestedRoot)
    const newFile = path.join(nestedRoot, 'new-file.ts')

    await writeTextFile(tempRoot, newFile, 'export {}')

    await expect(readTextFile(tempRoot, newFile)).resolves.toBe('export {}')
    await expect(writeTextFile(tempRoot, path.join(tempRoot, '..', 'escape.ts'), 'no')).rejects.toThrow(
      'outside the project root',
    )
  })

  it('normalizes planner-relative paths without allowing project-root traversal', async () => {
    await mkdir(path.join(tempRoot, 'src'))
    const filePath = path.join(tempRoot, 'src', 'planned.ts')
    await writeFile(filePath, 'export {}')

    await expect(resolveProjectPathWithinRoot(tempRoot, 'src/planned.ts')).resolves.toBe(
      await realpath(filePath),
    )
    await expect(resolveProjectPathWithinRoot(
      tempRoot,
      '../outside.ts',
      { allowMissingLeaf: true },
    )).rejects.toThrow('outside the project root')
  })

  it('searches project files recursively while ignoring heavy folders', async () => {
    await mkdir(path.join(tempRoot, 'src', 'renderer'), { recursive: true })
    await mkdir(path.join(tempRoot, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(path.join(tempRoot, 'src', 'renderer', 'App.tsx'), 'export function App() {}')
    await writeFile(path.join(tempRoot, 'node_modules', 'pkg', 'App.tsx'), 'ignored')
    await writeFile(path.join(tempRoot, 'README.md'), '# Pivot')

    const results = await searchProjectFiles(tempRoot, 'app')

    expect(results).toEqual([
      {
        name: 'App.tsx',
        path: path.join(tempRoot, 'src', 'renderer', 'App.tsx'),
        relativePath: path.join('src', 'renderer', 'App.tsx'),
      },
    ])
  })

  it('applies project gitignore rules to the tree and recursive search', async () => {
    await mkdir(path.join(tempRoot, 'coverage'))
    await mkdir(path.join(tempRoot, 'src'))
    await writeFile(path.join(tempRoot, '.gitignore'), 'coverage/\n*.log\n!keep.log\n')
    await writeFile(path.join(tempRoot, 'coverage', 'report.ts'), 'ignored')
    await writeFile(path.join(tempRoot, 'debug.log'), 'ignored')
    await writeFile(path.join(tempRoot, 'keep.log'), 'visible')
    await writeFile(path.join(tempRoot, 'src', 'visible.ts'), 'visible')

    const tree = await listProjectTree(tempRoot)
    const results = await searchProjectFiles(tempRoot, 'report')

    expect(tree.map((entry) => entry.name)).toContain('keep.log')
    expect(tree.map((entry) => entry.name)).not.toContain('coverage')
    expect(tree.map((entry) => entry.name)).not.toContain('debug.log')
    expect(results).toEqual([])
  })

  it('builds a bounded, normalized planning manifest without ignored or linked files', async () => {
    await mkdir(path.join(tempRoot, 'src', 'nested'), { recursive: true })
    await mkdir(path.join(tempRoot, 'coverage'))
    await writeFile(path.join(tempRoot, '.gitignore'), 'coverage/\n*.secret\n')
    await writeFile(path.join(tempRoot, 'src', 'index.ts'), 'export {}')
    await writeFile(path.join(tempRoot, 'src', 'nested', 'feature.ts'), 'export {}')
    await writeFile(path.join(tempRoot, 'coverage', 'report.json'), '{}')
    await writeFile(path.join(tempRoot, 'key.secret'), 'hidden')

    await expect(listProjectFilePaths(tempRoot, 2)).resolves.toEqual(['.gitignore', 'src/index.ts'])
    await expect(listProjectFilePaths(tempRoot, 0)).rejects.toThrow('Planning file limit')
  })

  it('uses complete gitignore semantics for escaped comments, ranges, and negation', async () => {
    await writeFile(path.join(tempRoot, '.gitignore'), '\\#draft.md\nreport-[0-9].txt\n*.tmp\n!important.tmp\n')
    await writeFile(path.join(tempRoot, '#draft.md'), 'ignored escaped hash')
    await writeFile(path.join(tempRoot, 'report-7.txt'), 'ignored range')
    await writeFile(path.join(tempRoot, 'report-a.txt'), 'visible')
    await writeFile(path.join(tempRoot, 'cache.tmp'), 'ignored wildcard')
    await writeFile(path.join(tempRoot, 'important.tmp'), 'visible negation')

    const tree = await listProjectTree(tempRoot)

    expect(tree.map((entry) => entry.name)).toEqual(['.gitignore', 'important.tmp', 'report-a.txt'])
  })

  it('returns no search results for empty queries', async () => {
    await writeFile(path.join(tempRoot, 'README.md'), '# Pivot')

    await expect(searchProjectFiles(tempRoot, '   ')).resolves.toEqual([])
  })
})
