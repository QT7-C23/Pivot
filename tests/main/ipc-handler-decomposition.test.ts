import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const modules = [
  'src/main/ipc-handlers.ts',
  'src/main/ipc-handler-contracts.ts',
  'src/main/ipc-handler-support.ts',
  'src/main/ipc-registration.ts',
  'src/main/axis-semantic-review-telemetry-ipc.ts',
  'src/main/session-lifecycle-ipc.ts',
  'src/main/provider-model-probe-ipc.ts',
  'src/main/axis-reviewer-settings-ipc.ts',
  'src/main/axis-reviewer-settings-runtime.ts',
  'src/main/axis-dry-run-ipc-orchestrator.ts',
  'src/main/session-capability-revocation.ts',
  'src/main/session-permanent-deletion.ts',
  'src/main/ipc-runtime-shutdown.ts',
  'src/main/session-management-ipc.ts',
  'src/main/marketplace-ipc.ts',
]

describe('Main IPC handler decomposition', () => {
  it('keeps focused IPC modules within the repository line ceiling', () => {
    for (const modulePath of modules) {
      const source = readFileSync(path.join(root, modulePath), 'utf8')
      expect(source.split(/\r?\n/).length, modulePath).toBeLessThanOrEqual(800)
    }
  })

  it('keeps the Main composition root below the review threshold', () => {
    const source = readFileSync(path.join(root, 'src/main/ipc-handlers.ts'), 'utf8')
    expect(source.split(/\r?\n/).length).toBeLessThanOrEqual(740)
  })

  it('keeps registration and runtime contracts inside Main without Renderer imports', () => {
    for (const modulePath of modules) {
      const source = readFileSync(path.join(root, modulePath), 'utf8')
      expect(source, modulePath).not.toMatch(/from ['"]\.\.\/renderer\//)
      expect(source, modulePath).not.toMatch(/from ['"]\.\.\/preload\//)
    }
  })
})
