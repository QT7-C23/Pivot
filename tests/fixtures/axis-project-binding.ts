import type { AxisProjectBindingReaderPort } from '../../src/main/services/axis-project-binding-ports'

export function projectBindingReader(
  projectRoot: string,
  options: {
    projectId?: string
    sessionIds?: string[]
  } = {},
): AxisProjectBindingReaderPort {
  const projectId = options.projectId ?? 'project-1'
  const sessionIds = new Set(options.sessionIds ?? ['session-1'])
  return {
    findBySession(sessionId) {
      if (!sessionIds.has(sessionId)) return null
      return {
        boundAt: '2026-07-26T00:00:00.000Z',
        projectId,
        projectRoot,
        schemaVersion: 1,
        sessionId,
      }
    },
  }
}
