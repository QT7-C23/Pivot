import {
  AGENT_CONTEXT_MAX_FILES,
  AGENT_CONTEXT_MAX_TOTAL_BYTES,
} from '../../shared/constants'
import type { AgentClientContext, AgentReferencedFile, AgentRequestContext } from '../../shared/types/domain'
import { readTextFile, resolvePathWithinRoot } from './file-system'
import { utf8ByteLength, utf8Prefix } from './utils/buffer-capped'

/** Resolve renderer-supplied paths into bounded, authoritative Agent context. */
export async function resolveAgentContext(
  projectRoot: string,
  clientContext: AgentClientContext | undefined,
): Promise<AgentRequestContext> {
  const canonicalProjectRoot = await resolvePathWithinRoot(projectRoot, projectRoot)
  const activeFilePath = clientContext?.activeFilePath
    ? await resolvePathWithinRoot(canonicalProjectRoot, clientContext.activeFilePath)
    : undefined
  const referencedFilePaths = [...new Set(clientContext?.referencedFilePaths ?? [])]

  if (referencedFilePaths.length > AGENT_CONTEXT_MAX_FILES) {
    throw new Error(`Agent context supports at most ${AGENT_CONTEXT_MAX_FILES} referenced files`)
  }

  let remainingBytes = AGENT_CONTEXT_MAX_TOTAL_BYTES
  const referencedFiles: AgentReferencedFile[] = []
  for (const requestedPath of referencedFilePaths) {
    const filePath = await resolvePathWithinRoot(canonicalProjectRoot, requestedPath)
    const source = await readTextFile(canonicalProjectRoot, filePath)
    const content = utf8Prefix(source, remainingBytes)
    remainingBytes = Math.max(0, remainingBytes - utf8ByteLength(content))
    referencedFiles.push({ content, filePath })
  }

  const { referencedFilePaths: _referencedFilePaths, ...safeClientContext } = clientContext ?? {}
  return {
    ...safeClientContext,
    activeFilePath,
    projectPath: canonicalProjectRoot,
    referencedFiles: referencedFiles.length > 0 ? referencedFiles : undefined,
  }
}
