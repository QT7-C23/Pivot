import { mkdir, open, readdir, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FileSearchEntry, FileTreeEntry } from '../../shared/types/domain'
import { loadGitignore } from './gitignore'

const IGNORED_NAMES = new Set(['.git', 'node_modules', 'out', 'dist'])
const MAX_READ_BYTES = 1024 * 1024
const DEFAULT_SEARCH_LIMIT = 40
const MAX_SEARCH_DIRECTORIES = 2_000
const MAX_PLANNING_FILES = 2_000

export function assertAbsolutePath(inputPath: string): string {
  if (!inputPath || !path.isAbsolute(inputPath)) {
    throw new Error('Expected an absolute path')
  }

  return path.resolve(inputPath)
}

export async function resolvePathWithinRoot(
  rootPath: string,
  candidatePath: string,
  options: { allowMissingLeaf?: boolean } = {},
): Promise<string> {
  const root = await realpath(assertAbsolutePath(rootPath))
  const rootStats = await stat(root)
  if (!rootStats.isDirectory()) {
    throw new Error('Project root must be a directory')
  }

  const candidate = assertAbsolutePath(candidatePath)
  let resolvedCandidate: string
  try {
    resolvedCandidate = await realpath(candidate)
  } catch (error) {
    if (!options.allowMissingLeaf || !isNotFoundError(error)) {
      throw error
    }
    const parent = await realpath(path.dirname(candidate))
    resolvedCandidate = path.join(parent, path.basename(candidate))
  }

  const relativePath = path.relative(root, resolvedCandidate)
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error('Path is outside the project root')
  }

  return resolvedCandidate
}

export function resolveProjectPathWithinRoot(
  rootPath: string,
  candidatePath: string,
  options: { allowMissingLeaf?: boolean } = {},
): Promise<string> {
  const root = assertAbsolutePath(rootPath)
  const candidate = path.isAbsolute(candidatePath)
    ? candidatePath
    : path.resolve(root, candidatePath)
  return resolvePathWithinRoot(root, candidate, options)
}

export async function listProjectTree(rootPath: string, projectRoot = rootPath): Promise<FileTreeEntry[]> {
  const root = await resolvePathWithinRoot(projectRoot, rootPath)
  const rootStats = await stat(root)
  if (!rootStats.isDirectory()) {
    throw new Error('Project root must be a directory')
  }

  const entries = await readdir(root, { withFileTypes: true })
  const isGitignored = await loadGitignore(await resolvePathWithinRoot(projectRoot, projectRoot))
  return entries
    .filter((entry) => !IGNORED_NAMES.has(entry.name) && !isGitignored(
      path.join(root, entry.name),
      entry.isDirectory() ? 'directory' : 'file',
    ))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
    .map((entry) => ({
      name: entry.name,
      path: path.join(root, entry.name),
      type: entry.isDirectory() ? 'directory' : 'file',
    }))
}

export async function readTextFile(projectRoot: string, filePath: string): Promise<string> {
  const resolved = await resolvePathWithinRoot(projectRoot, filePath)
  const fileStats = await stat(resolved)

  if (!fileStats.isFile()) {
    throw new Error('Only files can be read')
  }
  if (fileStats.size > MAX_READ_BYTES) {
    throw new Error('File is too large for the MVP reader')
  }

  return readFile(resolved, 'utf8')
}

export async function searchProjectFiles(
  rootPath: string,
  query: string,
  limit = DEFAULT_SEARCH_LIMIT,
): Promise<FileSearchEntry[]> {
  const root = assertAbsolutePath(rootPath)
  const rootStats = await stat(root)
  if (!rootStats.isDirectory()) {
    throw new Error('Project root must be a directory')
  }

  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return []
  }

  const results: FileSearchEntry[] = []
  const isGitignored = await loadGitignore(root)
  const queue = [root]
  let visitedDirectories = 0

  while (queue.length > 0 && results.length < limit && visitedDirectories < MAX_SEARCH_DIRECTORIES) {
    const currentDirectory = queue.shift()!
    visitedDirectories += 1

    const entries = await readdir(currentDirectory, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name)
      if (IGNORED_NAMES.has(entry.name) || entry.isSymbolicLink() || isGitignored(
        absolutePath,
        entry.isDirectory() ? 'directory' : 'file',
      )) {
        continue
      }

      if (entry.isDirectory()) {
        queue.push(absolutePath)
        continue
      }
      if (!entry.isFile()) {
        continue
      }

      const relativePath = path.relative(root, absolutePath)
      if (!matchesSearch(relativePath, normalizedQuery)) {
        continue
      }

      results.push({
        name: entry.name,
        path: absolutePath,
        relativePath,
      })
      if (results.length >= limit) {
        break
      }
    }
  }

  return results.sort((a, b) => scoreSearchResult(a, normalizedQuery) - scoreSearchResult(b, normalizedQuery))
}

export async function listProjectFilePaths(rootPath: string, limit = MAX_PLANNING_FILES): Promise<string[]> {
  const root = await resolvePathWithinRoot(rootPath, rootPath)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PLANNING_FILES) {
    throw new Error(`Planning file limit must be between 1 and ${MAX_PLANNING_FILES}`)
  }
  const isGitignored = await loadGitignore(root)
  const queue = [root]
  const files: string[] = []
  let visitedDirectories = 0
  while (queue.length > 0 && files.length < limit && visitedDirectories < MAX_SEARCH_DIRECTORIES) {
    const directory = queue.shift()!
    visitedDirectories += 1
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      if (IGNORED_NAMES.has(entry.name) || entry.isSymbolicLink() || isGitignored(
        absolutePath,
        entry.isDirectory() ? 'directory' : 'file',
      )) continue
      if (entry.isDirectory()) queue.push(absolutePath)
      if (entry.isFile()) files.push(path.relative(root, absolutePath).replaceAll('\\', '/'))
      if (files.length >= limit) break
    }
  }
  return files.sort((a, b) => a.localeCompare(b))
}

export async function writeTextFile(projectRoot: string, filePath: string, content: string): Promise<void> {
  const resolved = await resolvePathWithinRoot(projectRoot, filePath, { allowMissingLeaf: true })
  await writeFile(resolved, content, 'utf8')
}

export async function deleteProjectFile(projectRoot: string, filePath: string): Promise<void> {
  const resolved = await resolvePathWithinRoot(projectRoot, filePath)
  const fileStats = await stat(resolved)
  if (!fileStats.isFile()) throw new Error('Only files can be deleted')
  await unlink(resolved)
}

export async function createProjectFile(projectRoot: string, filePath: string): Promise<FileTreeEntry> {
  const resolved = await resolvePathWithinRoot(projectRoot, filePath, { allowMissingLeaf: true })
  const handle = await open(resolved, 'wx')
  await handle.close()
  return { name: path.basename(resolved), path: resolved, type: 'file' }
}

export async function createProjectDirectory(projectRoot: string, directoryPath: string): Promise<FileTreeEntry> {
  const resolved = await resolvePathWithinRoot(projectRoot, directoryPath, { allowMissingLeaf: true })
  await mkdir(resolved)
  return { name: path.basename(resolved), path: resolved, type: 'directory' }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function matchesSearch(relativePath: string, normalizedQuery: string): boolean {
  return relativePath.replaceAll('\\', '/').toLowerCase().includes(normalizedQuery)
}

function scoreSearchResult(entry: FileSearchEntry, normalizedQuery: string): number {
  const normalizedName = entry.name.toLowerCase()
  const normalizedRelativePath = entry.relativePath.replaceAll('\\', '/').toLowerCase()

  if (normalizedName === normalizedQuery) {
    return 0
  }
  if (normalizedName.startsWith(normalizedQuery)) {
    return 1
  }
  if (normalizedName.includes(normalizedQuery)) {
    return 2
  }
  return 3 + normalizedRelativePath.length / 1_000
}
