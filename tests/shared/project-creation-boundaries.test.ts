import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('project creation dependency boundaries', () => {
  it('keeps contracts shared, infrastructure Main-owned, and Renderer narrow', () => {
    const root = process.cwd()
    const contract = readFileSync(path.join(root, 'src/shared/project-creation.ts'), 'utf8')
    const port = readFileSync(path.join(root, 'src/main/services/project-creation-port.ts'), 'utf8')
    const adapter = readFileSync(path.join(root, 'src/main/services/node-project-creation-adapter.ts'), 'utf8')
    const service = readFileSync(path.join(root, 'src/renderer/services/project.service.ts'), 'utf8')
    const component = readFileSync(path.join(root, 'src/renderer/components/new-project-dialog.tsx'), 'utf8')
    const handlers = readFileSync(path.join(root, 'src/main/ipc-handlers.ts'), 'utf8')

    expect(contract).not.toMatch(/node:|electron|src\/main|src\/renderer/)
    expect(port).toContain('ProjectCreationPort')
    expect(adapter).toContain('implements ProjectCreationPort')
    expect(adapter).toMatch(/node:fs\/promises/)
    expect(service).toContain("window.pivot.invoke('project:create'")
    expect(service).toContain('ProjectCreationResultSchema.parse')
    expect(service).not.toMatch(/node:fs|better-sqlite3|NodeProjectCreationAdapter/)
    expect(component).not.toMatch(/window\.pivot|ipcRenderer|node:fs|src\/main/)
    expect(handlers).toContain('new NodeProjectCreationAdapter')
    expect(handlers).toContain("handle('project:create'")
    expect(handlers).toContain('projectAccess.authorize(result.projectPath)')
  })
})
