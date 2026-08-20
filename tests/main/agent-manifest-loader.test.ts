import { describe, expect, it } from 'vitest'
import { parseAgentManifest } from '../../src/main/services/agent-manifest-loader'

describe('parseAgentManifest', () => {
  it('parses a minimal valid manifest', () => {
    const source = `---
name: test-agent
version: 0.1.0
description: A test agent
---
Hello world`

    const result = parseAgentManifest(source)
    expect(result).toEqual({
      name: 'test-agent',
      version: '0.1.0',
      description: 'A test agent',
    })
  })

  it('parses model and tools', () => {
    const source = `---
name: deep-research
version: 0.1.0
description: Multi-step research agent
model: claude-sonnet-4-5
tools:
  - fs.search
  - fs.readText
  - term.run
---

# Deep Research Agent
...`

    const result = parseAgentManifest(source)
    expect(result).toMatchObject({
      name: 'deep-research',
      model: 'claude-sonnet-4-5',
    })
    expect(result?.tools).toEqual(['fs.search', 'fs.readText', 'term.run'])
  })

  it('returns null for source without frontmatter', () => {
    expect(parseAgentManifest('Just text without frontmatter')).toBeNull()
  })

  it('returns null when name is missing', () => {
    const source = `---
version: 0.1.0
description: no name
---`

    expect(parseAgentManifest(source)).toBeNull()
  })

  it('ignores comments and empty lines in frontmatter', () => {
    const source = `---
name: commented
# this is a comment
version: 0.1.0

description: Has comments
---
body`

    const result = parseAgentManifest(source)
    expect(result).toMatchObject({
      name: 'commented',
      version: '0.1.0',
      description: 'Has comments',
    })
  })

  it('parses inline array syntax for tools', () => {
    const source = `---
name: agent-with-inline-tools
version: 1.0.0
description: Agent with inline tools
tools: [fs.readText, fs.search]
---`

    const result = parseAgentManifest(source)
    expect(result?.tools).toEqual(['fs.readText', 'fs.search'])
  })

  it('handles tools with dash list', () => {
    const source = `---
name: dash-list-agent
version: 1.0.0
description: Agent with dash list tools
tools:
  - fs.readText
  - fs.search
---`

    const result = parseAgentManifest(source)
    expect(result?.tools).toEqual(['fs.readText', 'fs.search'])
  })

  it('parses an example matching the real deep-research format', () => {
    const source = `---
name: deep-research
version: 0.1.0
description: 多步深度研究：探索→分析→综合，生成结构化报告
model: claude-sonnet-4-5
tools:
  - fs.search
  - fs.readText
  - term.run
triggers:
  - on_command: ["/research", "/deep-research"]
---

# Deep Research Agent

你是一个严谨的研究助手。`

    const result = parseAgentManifest(source)
    expect(result).toMatchObject({
      name: 'deep-research',
      version: '0.1.0',
      description: expect.stringContaining('深度研究'),
      model: 'claude-sonnet-4-5',
    })
    expect(result?.tools).toEqual(['fs.search', 'fs.readText', 'term.run'])
  })
})
