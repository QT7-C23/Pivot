import type {
  AgentAdapterInfo,
  SessionGroupRecord,
  SessionMetadataPatch,
  SessionRecord,
} from '../shared/types/domain'
import { handle } from './ipc-registration'

interface SessionProjectAccessPort {
  requireAuthorized(projectPath: string): Promise<string>
}

interface SessionCreationLifecyclePort {
  bindSession(session: SessionRecord): Promise<SessionRecord>
}

interface SessionPermanentDeletionPort {
  deleteSession(sessionId: string): Promise<void>
}

interface SessionManagementRegistryPort {
  create(projectPath: string, title?: string): SessionRecord
  createGroup(name: string, parentId?: string | null): SessionGroupRecord
  deleteGroup(id: string): void
  export(id: string, format: 'markdown' | 'json', context: { adapterInfo?: AgentAdapterInfo }): string
  list(): SessionRecord[]
  listGroups(): SessionGroupRecord[]
  openProject(projectPath: string, title?: string): SessionRecord
  renameGroup(id: string, name: string): SessionGroupRecord
  search(query: string): SessionRecord[]
  setPinned(id: string, isPinned: boolean): SessionRecord
  updateMetadata(id: string, patch: SessionMetadataPatch): SessionRecord
}

export function registerSessionManagementIpc(options: {
  adapterInfo: () => AgentAdapterInfo
  deletion: SessionPermanentDeletionPort
  lifecycle: SessionCreationLifecyclePort
  lifecycleReady: Promise<void>
  projectAccess: SessionProjectAccessPort
  sessions: SessionManagementRegistryPort
}): void {
  handle('session:list', async () => options.sessions.list())
  handle('session:create', async ({ projectPath, title }) => {
    await options.lifecycleReady
    const authorized = await options.projectAccess.requireAuthorized(projectPath)
    return options.lifecycle.bindSession(options.sessions.create(authorized, title))
  })
  handle('session:open-project', async ({ projectPath, title }) => {
    await options.lifecycleReady
    const authorized = await options.projectAccess.requireAuthorized(projectPath)
    return options.lifecycle.bindSession(options.sessions.openProject(authorized, title))
  })
  handle('session:delete', async ({ id }) => {
    await options.lifecycleReady
    await options.deletion.deleteSession(id)
  })
  handle('session:set-pinned', async ({ id, isPinned }) => options.sessions.setPinned(id, isPinned))
  handle('session:update', async ({ id, patch }) => options.sessions.updateMetadata(id, patch))
  handle('session:search', async ({ query }) => options.sessions.search(query))
  handle('session:list-groups', async () => options.sessions.listGroups())
  handle('session:create-group', async ({ name, parentId }) => options.sessions.createGroup(name, parentId))
  handle('session:rename-group', async ({ id, name }) => options.sessions.renameGroup(id, name))
  handle('session:delete-group', async ({ id }) => options.sessions.deleteGroup(id))
  handle('session:export', async ({ id, format }) => options.sessions.export(id, format, {
    adapterInfo: options.adapterInfo(),
  }))
}
