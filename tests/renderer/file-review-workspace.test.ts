import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { FileReviewRecord } from '../../src/shared/types/domain'

vi.mock('../../src/renderer/components/CodeDiffEditor', () => ({
  CodeDiffEditor: () => createElement('div', { 'data-editor-boundary': 'monaco-diff' }),
}))

import { FileReviewWorkspace } from '../../src/renderer/components/file-review-workspace'
import { ArtifactReviewInspector } from '../../src/renderer/components/artifact-review-chrome'
import { LocaleProvider } from '../../src/renderer/i18n/locale-context'

describe('FileReviewWorkspace', () => {
  it('keeps the diff surface separate from review decisions', () => {
    const review = {
      checkpointId: 'checkpoint-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      currentContent: 'after',
      filePath: 'C:\\project\\source.ts',
      hunks: [{
        decision: 'pending',
        id: 'review-1:hunk-0',
        index: 0,
        modifiedContent: 'after',
        modifiedStart: 1,
        originalContent: 'before',
        originalStart: 1,
      }],
      id: 'review-1',
      modifiedContent: 'after',
      originalContent: 'before',
      sessionId: 'session-1',
      status: 'pending',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } satisfies FileReviewRecord

    const markup = renderToStaticMarkup(createElement(FileReviewWorkspace, {
      resolveReview: vi.fn(),
      review,
    }))
    const inspector = renderToStaticMarkup(createElement(LocaleProvider, null,
      createElement(ArtifactReviewInspector, { resolveReview: vi.fn(), review }),
    ))

    expect(markup).toContain('data-figma-screen="64:822"')
    expect(markup).toContain('monaco-diff')
    expect(markup).not.toContain('Accept hunk 1')
    expect(inspector).toContain('<footer><button')
    expect(inspector).toContain('class="primary"')
    expect(inspector).toContain('Accept hunk 1')
    expect(inspector).toContain('Reject hunk 1')
  })
})
