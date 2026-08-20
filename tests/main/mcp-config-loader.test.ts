import { describe, expect, it } from 'vitest'
import { parseClaudeMcpJson, parseCodexMcpToml } from '../../src/main/services/mcp-config-loader'

describe('MCP configuration discovery', () => {
  it('normalizes Codex TOML servers into Pivot transport contracts', () => {
    const servers = parseCodexMcpToml(`
[mcp_servers.files]
command = "node"
args = ["server.js"]

[mcp_servers.remote]
url = "https://mcp.example.com/api"
`)

    expect(servers).toEqual([
      { args: ['server.js'], command: 'node', id: 'files', name: 'files', transport: 'stdio' },
      { id: 'remote', name: 'remote', transport: 'streamable-http', url: 'https://mcp.example.com/api' },
    ])
  })

  it('normalizes Claude JSON servers and rejects malformed entries', () => {
    expect(parseClaudeMcpJson(JSON.stringify({ mcpServers: {
      browser: { command: 'npx', args: ['playwright-mcp'] },
    } }))).toEqual([
      { args: ['playwright-mcp'], command: 'npx', id: 'browser', name: 'browser', transport: 'stdio' },
    ])
    expect(() => parseClaudeMcpJson('{"mcpServers":{"broken":{}}}')).toThrow('broken')
  })
})
