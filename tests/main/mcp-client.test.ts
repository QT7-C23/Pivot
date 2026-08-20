import { describe, expect, it, vi } from 'vitest'
import { McpClientSession, parseMcpServerConfig } from '../../src/main/services/mcp-client'

describe('McpClientSession', () => {
  it('validates Streamable HTTP and stdio transport contracts', () => {
    expect(parseMcpServerConfig({ id: 'remote', name: 'Remote', transport: 'streamable-http', url: 'https://mcp.example.com' }))
      .toMatchObject({ id: 'remote', transport: 'streamable-http' })
    expect(parseMcpServerConfig({ args: ['server.js'], command: 'node', id: 'local', name: 'Local', transport: 'stdio' }))
      .toMatchObject({ command: 'node', transport: 'stdio' })
    expect(() => parseMcpServerConfig({ id: 'bad', name: 'Bad', transport: 'streamable-http', url: 'file:///secret' }))
      .toThrow('MCP URL must use HTTP or HTTPS')
    expect(() => parseMcpServerConfig({ command: '  ', id: 'bad', name: 'Bad', transport: 'stdio' }))
      .toThrow()
  })

  it('keeps SDK responses behind a stable Pivot interface', async () => {
    const client = {
      callTool: vi.fn().mockResolvedValue({ content: [{ text: 'done', type: 'text' }], isError: false }),
      close: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      listResources: vi.fn().mockResolvedValue({ resources: [{ mimeType: 'text/plain', name: 'Readme', uri: 'file:///README.md' }] }),
      listTools: vi.fn().mockResolvedValue({ tools: [{ description: 'Search files', inputSchema: { type: 'object' }, name: 'search' }] }),
      readResource: vi.fn().mockResolvedValue({ contents: [{ text: 'Pivot', uri: 'file:///README.md' }] }),
    }
    const transport = { close: vi.fn(), send: vi.fn(), start: vi.fn() }
    const session = new McpClientSession(
      { id: 'remote', name: 'Remote', transport: 'streamable-http', url: 'https://mcp.example.com' },
      () => client,
      () => transport as never,
    )

    await session.connect()

    await expect(session.listTools()).resolves.toEqual([{ description: 'Search files', inputSchema: { type: 'object' }, name: 'search' }])
    await expect(session.callTool('search', { query: 'Pivot' })).resolves.toEqual({ content: [{ text: 'done', type: 'text' }], isError: false })
    await expect(session.listResources()).resolves.toEqual([{ mimeType: 'text/plain', name: 'Readme', uri: 'file:///README.md' }])
    await expect(session.readResource('file:///README.md')).resolves.toEqual([{ text: 'Pivot', uri: 'file:///README.md' }])
    await session.close()

    expect(client.connect).toHaveBeenCalledWith(transport)
    expect(client.callTool).toHaveBeenCalledWith({ arguments: { query: 'Pivot' }, name: 'search' })
    expect(client.close).toHaveBeenCalledOnce()
  })
})
