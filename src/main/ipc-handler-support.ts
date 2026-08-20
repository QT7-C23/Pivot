import type { ApplicationUpdateState } from '../shared/application-update'
import type { UpdateRuntime } from './ipc-handler-contracts'
import type { ProviderStore } from './services/provider-store'
import type { SessionRegistry } from './services/session-registry'

export function unavailableUpdates(): UpdateRuntime {
  const state: ApplicationUpdateState = { currentVersion: 'unknown', message: 'Update runtime is unavailable.', status: 'unavailable' }
  return { state, check: async () => state, download: async () => state, install: () => state }
}

export function requireSessionProjectRoot(sessions: SessionRegistry, sessionId: string): string {
  const projectRoot = sessions.getActive(sessionId)?.projectPath
  if (!projectRoot) throw new Error(`Unknown session project root: ${sessionId}`)
  return projectRoot
}

export function requireActiveAxisProvider(providers: ProviderStore) {
  const provider = providers.list().find((candidate) => candidate.isActive)
  if (!provider) throw new Error('Axis Dynamic Pivot requires an active provider')
  if (!provider.hasApiKey) throw new Error('Axis Dynamic Pivot requires an active provider API key')
  return provider
}
