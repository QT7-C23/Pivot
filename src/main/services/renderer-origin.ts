import path from 'node:path'
import { pathToFileURL } from 'node:url'

export function rendererEntryUrl(rendererUrl: string | undefined, mainDirectory: string): string {
  return rendererUrl ?? pathToFileURL(path.join(mainDirectory, '../renderer/index.html')).href
}

export function isTrustedRendererUrl(candidate: string, trustedEntry: string): boolean {
  try {
    const candidateUrl = new URL(candidate)
    const trustedUrl = new URL(trustedEntry)
    if (trustedUrl.protocol === 'file:') {
      return candidateUrl.protocol === 'file:' && candidateUrl.pathname === trustedUrl.pathname
    }
    return candidateUrl.origin === trustedUrl.origin
  } catch {
    return false
  }
}
