import { describe, expect, it } from 'vitest'
import { extractFileMentionQuery, replaceFileMention } from '../../src/renderer/services/file-mentions'

describe('file mentions', () => {
  it('finds and replaces the active @file query without changing surrounding text', () => {
    const source = 'Review @app before release'
    const cursor = source.indexOf(' before')
    const mention = extractFileMentionQuery(source, cursor)

    expect(mention).toEqual({ end: cursor, query: 'app', start: 7 })
    expect(replaceFileMention(source, mention!, 'src/App.tsx')).toBe('Review @src/App.tsx before release')
  })
})
