import type { ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

export type MessageContentSegment =
  | Readonly<{ content: string; type: 'text' }>
  | Readonly<{ content: string; language: string | null; type: 'code' }>

const FENCE_PATTERN = /^```([^\r\n`]*)\r?\n?/gm

export function parseMessageContent(source: string): readonly MessageContentSegment[] {
  if (source.length === 0) {
    return []
  }

  const segments: MessageContentSegment[] = []
  let cursor = 0
  let openingFence: RegExpExecArray | null

  while ((openingFence = FENCE_PATTERN.exec(source)) !== null) {
    if (openingFence.index > cursor) {
      segments.push({ content: source.slice(cursor, openingFence.index), type: 'text' })
    }

    const codeStart = FENCE_PATTERN.lastIndex
    const closingFenceIndex = source.indexOf('\n```', codeStart)
    const language = openingFence[1]?.trim() || null

    if (closingFenceIndex === -1) {
      segments.push({ content: source.slice(codeStart), language, type: 'code' })
      cursor = source.length
      break
    }

    segments.push({
      content: source.slice(codeStart, closingFenceIndex),
      language,
      type: 'code',
    })
    cursor = closingFenceIndex + 4
    if (source[cursor] === '\r') cursor += 1
    if (source[cursor] === '\n') cursor += 1
    FENCE_PATTERN.lastIndex = cursor
  }

  if (cursor < source.length) {
    segments.push({ content: source.slice(cursor), type: 'text' })
  }

  return segments.filter((segment) => segment.content.length > 0)
}

export function MessageContent({ text }: { text: string }): ReactElement {
  return (
    <div className="message-content">
      <ReactMarkdown
        components={{
          a: ({ children, href }) => (
            <a href={href} rel="nofollow noopener noreferrer" target="_blank">{children}</a>
          ),
          pre: ({ children }) => <pre className="message-code">{children}</pre>,
        }}
        rehypePlugins={[rehypeHighlight]}
        remarkPlugins={[remarkGfm]}
        skipHtml
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
