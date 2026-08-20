import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/renderer/components/CodeEditor', () => ({
  CodeEditor: () => createElement('div', { 'data-editor-boundary': 'monaco' }),
}))

import { EditorWorkspace } from '../../src/renderer/components/editor-workspace'

describe('EditorWorkspace', () => {
  it('presents ordinary files as read-only previews without direct save controls', () => {
    const markup = renderToStaticMarkup(createElement(EditorWorkspace, {
      activeFileContent: 'export const answer = 42',
      activeFilePath: 'C:\\project\\answer.ts',
    }))

    expect(markup).toContain('Read-only preview')
    expect(markup).not.toContain('>Save<')
    expect(markup).not.toContain('Discard changes')
  })
})
