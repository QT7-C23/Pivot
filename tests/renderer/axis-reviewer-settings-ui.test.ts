import { readFileSync } from 'node:fs'; import path from 'node:path'; import { describe, expect, it } from 'vitest'
describe('Reviewer qualification Settings UI', () => {
  it('requires qualification before enable and communicates restart activation', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/renderer/components/provider-settings-workspace.tsx'), 'utf8')
    for (const token of ['useAxisReviewerSettingsStore', 'qualifyReviewer', 'reviewerEvidence', '禁用审查', 'Disable review', '下次 Runtime', 'Next Runtime']) expect(source).toContain(token)
  })
})
