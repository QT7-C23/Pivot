import { describe, expect, it } from 'vitest'
import { CliEventParser } from '../../src/main/services/agent-events'

describe('CliEventParser', () => {
  it('parses structured NDJSON events', () => {
    const parser = new CliEventParser()

    expect(parser.push('{"type":"text","text":"hello"}\n')).toEqual([
      { text: 'hello', type: 'text' },
    ])
    expect(parser.push('{"type":"phase","phase":"writing"}\n')).toEqual([
      { phase: 'writing', type: 'phase' },
    ])
    expect(parser.push('{"type":"tool","toolName":"fs.safeWrite","id":"tool-1","input":{"filePath":"C:/tmp/a.txt","content":"hi"}}\n')).toEqual([
      {
        id: 'tool-1',
        input: { content: 'hi', filePath: 'C:/tmp/a.txt' },
        toolName: 'fs.safeWrite',
        type: 'tool',
      },
    ])
  })

  it('buffers partial structured lines until complete', () => {
    const parser = new CliEventParser()

    expect(parser.push('{"type":"operation","status":"running",')).toEqual([])
    expect(parser.push('"description":"Build"}\n')).toEqual([
      { description: 'Build', id: undefined, status: 'running', type: 'operation' },
    ])
  })

  it('falls back invalid JSON and plain lines to text', () => {
    const parser = new CliEventParser()

    expect(parser.push('not json\n')).toEqual([{ text: 'not json\n', type: 'text' }])
    expect(parser.push('{"type":"unknown"}\n')).toEqual([{ text: '{"type":"unknown"}\n', type: 'text' }])
  })

  it('flushes trailing plain text without adding a newline', () => {
    const parser = new CliEventParser()

    expect(parser.push('partial plain text')).toEqual([])
    expect(parser.flush()).toEqual([{ text: 'partial plain text', type: 'text' }])
  })
})
