import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis Pivot failure trigger boundaries', () => {
  it('keeps evidence, attempt tracking, and production wiring Main-owned and narrow', async () => {
    const [contracts, ports, tracking, runtime, root, orchestration] = await Promise.all([
      read('src/shared/axis-pivot-failure-contracts.ts'),
      read('src/main/services/axis-pivot-failure-ports.ts'),
      read('src/main/services/axis-worker-attempt-tracking-executor.ts'),
      read('src/main/services/axis-production-pivot-runtime.ts'),
      read('src/main/ipc-handlers.ts'),
      read('src/main/axis-dry-run-ipc-orchestrator.ts'),
    ])

    expect(contracts).not.toMatch(/src\/main|electron|better-sqlite3/i)
    expect(contracts).not.toMatch(/writes|projectRoot|authority|proof|receipt/i)
    expect(ports).not.toMatch(/Registry|better-sqlite3|file-system|Renderer/i)
    expect(tracking).not.toMatch(/Registry|better-sqlite3|ipc|Renderer/i)
    expect(runtime).not.toMatch(/axis-guarded|safe-write|checkpoint|command-runner/i)

    expect(root).toContain('axisPivot?.trackDryRunExecutor')
    expect(root).toContain('failureObserver: axisPivot')
    expect(orchestration).toContain('failureObserver?.observeFailure')
    expect(root).not.toMatch(/handle\(['"]axis:[^'"]*pivot/i)
  })
})

function read(filePath: string): Promise<string> {
  return readFile(path.resolve(filePath), 'utf8')
}
