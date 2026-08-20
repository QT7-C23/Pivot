import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('provider model probe settings surface', () => {
  it('exposes refresh and honest loading/error/empty/truncated evidence states', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/renderer/components/provider-settings-workspace.tsx'), 'utf8')
    expect(source).toContain('useProviderModelProbeStore')
    expect(source).toContain("probe(selected.id, true)")
    for (const evidence of ['loadingModels', 'modelProbeError', 'models.length === 0', 'modelProbe?.truncated']) {
      expect(source).toContain(evidence)
    }
  })
})
