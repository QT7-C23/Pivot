import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('semantic review telemetry user surface', () => {
  it('wires the session-scoped read-only surface into Runtime Hub with resilient states', () => {
    const app = readFileSync(path.resolve('src/renderer/pivot-app.tsx'), 'utf8')
    const hub = readFileSync(path.resolve('src/renderer/components/runtime-hub-workspace.tsx'), 'utf8')
    expect(app).toContain('loadSemanticReviewTelemetry(activeSessionId)')
    expect(app).toContain('semanticReviewTelemetryPage=')
    expect(hub).toContain('semanticReviewTelemetryPage')
    expect(hub).toContain('pv-review-telemetry-empty')
    expect(hub).toContain('textOverflow')
    expect(hub).toContain('aria-live="polite"')
    expect(hub).not.toContain('changedFiles')
    expect(hub).not.toContain('diffSha256')
  })
})
