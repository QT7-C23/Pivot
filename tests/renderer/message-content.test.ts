import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageContent, parseMessageContent } from '../../src/renderer/components/message-content'

describe('parseMessageContent', () => {
  it('renders GFM blocks without executing raw HTML', () => {
    const markup = renderToStaticMarkup(
      createElement(MessageContent, { text: '# Heading\n\n- first\n- second\n\n<script>alert(1)</script>' }),
    )

    expect(markup).toContain('<h1>Heading</h1>')
    expect(markup).toContain('<li>first</li>')
    expect(markup).not.toContain('<script>')
    expect(markup).not.toContain('alert(1)')
  })

  it('renders GFM tables, safe links, and language-aware highlighted code', () => {
    const markup = renderToStaticMarkup(createElement(MessageContent, {
      text: [
        '| Name | Value |',
        '| --- | --- |',
        '| Pivot | 1 |',
        '',
        '[Docs](https://example.com)',
        '',
        '```ts',
        'const answer = 42',
        '```',
      ].join('\n'),
    }))

    expect(markup).toContain('<table>')
    expect(markup).toContain('rel="nofollow noopener noreferrer"')
    expect(markup).toContain('target="_blank"')
    expect(markup).toMatch(/class="[^\"]*language-ts[^\"]*"/)
    expect(markup).toContain('hljs-keyword')
  })

  it('preserves line breaks in plain text', () => {
    expect(parseMessageContent('First line\nSecond line')).toEqual([
      { type: 'text', content: 'First line\nSecond line' },
    ])
  })

  it('parses fenced code with its language', () => {
    expect(parseMessageContent('Before\n```ts\nconst answer = 42\n```\nAfter')).toEqual([
      { type: 'text', content: 'Before\n' },
      { type: 'code', language: 'ts', content: 'const answer = 42' },
      { type: 'text', content: 'After' },
    ])
  })

  it('keeps multiple text and code segments in order', () => {
    expect(parseMessageContent('A\n```\none\n```\nB\n```json\n{}\n```')).toEqual([
      { type: 'text', content: 'A\n' },
      { type: 'code', language: null, content: 'one' },
      { type: 'text', content: 'B\n' },
      { type: 'code', language: 'json', content: '{}' },
    ])
  })

  it('treats an unclosed fence as code through the end of the message', () => {
    expect(parseMessageContent('```sh\nnpm test')).toEqual([
      { type: 'code', language: 'sh', content: 'npm test' },
    ])
  })

  it('returns no segments for an empty message', () => {
    expect(parseMessageContent('')).toEqual([])
  })
})
