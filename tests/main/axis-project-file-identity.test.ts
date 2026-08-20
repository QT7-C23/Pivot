import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AxisMainProjectFileIdentityAdapter } from '../../src/main/services/axis-project-file-identity'
import { projectBindingReader } from '../fixtures/axis-project-binding'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('AxisMainProjectFileIdentityAdapter', () => {
  it('maps relative and absolute forms to one project-relative identity', async () => {
    const root = createProject()
    const adapter = new AxisMainProjectFileIdentityAdapter({
      projectBindings: projectBindingReader(root),
    })
    const binding = {
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    }

    const relative = await adapter.resolve(binding, 'src/app.ts')
    const absolute = await adapter.resolve(binding, path.join(root, 'src', 'app.ts'))

    expect(relative).toEqual(absolute)
    expect(relative.projectRelativePath).toBe('src/app.ts')
    expect(relative.fileKey).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects path escapes, project roots, and unknown session bindings', async () => {
    const root = createProject()
    const adapter = new AxisMainProjectFileIdentityAdapter({
      projectBindings: projectBindingReader(root),
    })
    const binding = {
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    }

    await expect(adapter.resolve(binding, path.join(root, '..', 'outside.ts'))).rejects.toThrow(/outside/i)
    await expect(adapter.resolve(binding, root)).rejects.toThrow(/file path/i)
    await expect(adapter.resolve({ ...binding, projectId: 'project-other' }, 'src/app.ts'))
      .rejects.toThrow(/project identity/i)
    await expect(adapter.resolve({ ...binding, sessionId: 'session-other' }, 'src/app.ts')).rejects.toThrow(/session/i)
  })
})

function createProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-file-identity-'))
  tempDirectories.push(root)
  mkdirSync(path.join(root, 'src'))
  writeFileSync(path.join(root, 'src', 'app.ts'), 'export {}\n')
  return root
}
