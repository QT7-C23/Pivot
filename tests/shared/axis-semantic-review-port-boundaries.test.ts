import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Axis semantic Reviewer Port boundary', () => {
  it('keeps the model capability narrow and Main-only', () => {
    const port = readFileSync(path.resolve('src/main/services/axis-semantic-review-port.ts'), 'utf8')
    expect(port).toContain('AxisSemanticReviewerPort')
    expect(port).toContain('Promise<unknown>')
    expect(port).not.toContain('Database')
    expect(port).not.toContain('node:fs')
    expect(port).not.toContain('Admin')
  })

  it('keeps segmentation, fallback and finding validation inside Shared/Main boundaries', () => {
    const shared = readFileSync(path.resolve('src/shared/axis-semantic-review-segment-contracts.ts'), 'utf8')
    const mainFiles = [
      'axis-semantic-review-segmenter.ts',
      'axis-segmented-semantic-reviewer-adapter.ts',
      'axis-semantic-review-finding-policy.ts',
      'axis-fallback-semantic-reviewer-adapter.ts',
    ].map((file) => readFileSync(path.resolve('src/main/services', file), 'utf8')).join('\n')
    expect(shared).toContain("from 'zod'")
    expect(shared).not.toMatch(/from ['"]\.\.\/main\//)
    expect(shared).not.toMatch(/from ['"]\.\.\/renderer\//)
    expect(mainFiles).not.toMatch(/from ['"].*renderer/)
    expect(mainFiles).not.toContain('Database')
    expect(mainFiles).not.toContain('node:fs')
    expect(mainFiles).not.toContain('Admin')
  })

  it('exposes telemetry through a read-only projection without Renderer database capability', () => {
    const contract = readFileSync(path.resolve('src/shared/axis-semantic-review-telemetry-contracts.ts'), 'utf8')
    const service = readFileSync(path.resolve('src/main/services/axis-semantic-review-telemetry-service.ts'), 'utf8')
    const renderer = readFileSync(path.resolve('src/renderer/stores/axis-semantic-review-telemetry.store.ts'), 'utf8')
    expect(contract).not.toMatch(/from ['"]\.\.\/main\//)
    expect(service).toContain('AxisSemanticReviewTelemetryReaderPort')
    expect(service).not.toContain('better-sqlite3')
    expect(renderer).not.toMatch(/better-sqlite3|node:fs|Admin|Database/)
  })
})
