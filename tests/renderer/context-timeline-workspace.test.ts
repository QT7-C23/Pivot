import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererRoot = path.resolve(process.cwd(), 'src/renderer')

describe('context timeline workspace contract', () => {
  it('keeps filtering, diff inspection, confirmed restore, and undo visible in the UI', () => {
    const source = readFileSync(path.join(rendererRoot, 'components/context-timeline-workspace.tsx'), 'utf8')
    expect(source).toContain("['all', 'conversation', 'files']")
    expect(source).toContain("window.confirm(t('timeline.restoreConfirm'))")
    expect(source).toContain('onOpenReview(entry.reviewId)')
    expect(source).toContain('onRestore(reviewId)')
    expect(source).toContain('onUndo()')
  })

  it('wires the activity into session-scoped loading and the main IDE workspace', () => {
    const app = readFileSync(path.join(rendererRoot, 'pivot-app.tsx'), 'utf8')
    const rail = readFileSync(path.join(rendererRoot, 'components/activity-rail.tsx'), 'utf8')
    expect(rail).toContain("activity: 'timeline'")
    expect(app).toContain('loadTimeline(activeSessionId)')
    expect(app).toContain("workView === 'timeline'")
    expect(app).toContain('<ContextTimelineWorkspace')
  })
})
