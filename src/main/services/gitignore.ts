import { readFile } from 'node:fs/promises'
import path from 'node:path'
import ignore from 'ignore'

const REQUIRED_IGNORES = ['.git/', 'node_modules/', 'out/', 'dist/']

export type ProjectIgnoreMatcher = (absolutePath: string, kind?: 'file' | 'directory') => boolean

export async function loadGitignore(rootPath: string): Promise<ProjectIgnoreMatcher> {
  let content = ''
  try {
    content = await readFile(path.join(rootPath, '.gitignore'), 'utf8')
  } catch (error) {
    if (!isNotFoundError(error)) throw error
  }
  return createGitignoreMatcher(rootPath, content)
}

export function createGitignoreMatcher(rootPath: string, content: string): ProjectIgnoreMatcher {
  const normalizedRoot = path.resolve(rootPath)
  const rules = ignore().add(content).add(REQUIRED_IGNORES)

  return (absolutePath, kind = 'file') => {
    const relativePath = path.relative(normalizedRoot, path.resolve(absolutePath)).replaceAll('\\', '/')
    if (!relativePath || relativePath === '..' || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
      return false
    }
    return rules.ignores(kind === 'directory' ? `${relativePath}/` : relativePath)
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
