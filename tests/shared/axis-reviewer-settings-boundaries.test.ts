import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Axis Reviewer settings boundaries', () => {
  it('keeps Shared contracts infrastructure-free and Renderer on narrow IPC only', () => {
    const shared = readFileSync('src/shared/axis-reviewer-qualification-contracts.ts', 'utf8')
    const renderer = readFileSync('src/renderer/stores/axis-reviewer-settings.store.ts', 'utf8')
    expect(shared).not.toMatch(/src\/main|better-sqlite3|ProviderStore|readSecret/)
    expect(renderer).not.toMatch(/src\/main|better-sqlite3|ProviderStore|readSecret|Adapter/)
    expect(renderer).toContain("window.pivot.invoke('axis:qualify-reviewer'")
  })

  it('activates production review only through a revalidated qualified routing snapshot', () => {
    const runtime = readFileSync('src/main/axis-reviewer-settings-runtime.ts', 'utf8')
    expect(runtime).toContain('routing.readQualified()')
    expect(runtime).not.toMatch(/process\.env|PIVOT_AXIS_SEMANTIC_REVIEW/)
  })
})
