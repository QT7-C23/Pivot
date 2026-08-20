import path from 'node:path'
import { assertAbsolutePath, resolvePathWithinRoot } from './file-system'

export class ProjectAccessRegistry {
  private readonly authorizedRoots = new Set<string>()

  constructor(persistedRoots: string[] = []) {
    for (const root of persistedRoots) {
      this.authorizedRoots.add(normalizeRoot(root))
    }
  }

  async authorize(rootPath: string): Promise<string> {
    const canonicalRoot = await resolvePathWithinRoot(rootPath, rootPath)
    this.authorizedRoots.add(normalizeRoot(rootPath))
    this.authorizedRoots.add(normalizeRoot(canonicalRoot))
    return canonicalRoot
  }

  async requireAuthorized(rootPath: string): Promise<string> {
    if (!this.authorizedRoots.has(normalizeRoot(rootPath))) {
      throw new Error('Project path has not been authorized; choose it with the project picker first')
    }
    return resolvePathWithinRoot(rootPath, rootPath)
  }
}

function normalizeRoot(rootPath: string): string {
  const resolved = assertAbsolutePath(rootPath)
  return process.platform === 'win32' ? resolved.toLocaleLowerCase() : path.normalize(resolved)
}
