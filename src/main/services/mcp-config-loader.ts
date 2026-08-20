import { parse as parseToml } from 'smol-toml'
import type { McpServerConfig } from './mcp-client'
import { parseMcpServerConfig } from './mcp-client'

export function parseCodexMcpToml(content: string): McpServerConfig[] {
  const document = parseToml(content) as Record<string, unknown>
  return normalizeServerMap(document['mcp_servers'] ?? document['mcpServers'])
}

export function parseClaudeMcpJson(content: string): McpServerConfig[] {
  const document = JSON.parse(content) as Record<string, unknown>
  return normalizeServerMap(document['mcpServers'] ?? document['mcp_servers'])
}

function normalizeServerMap(value: unknown): McpServerConfig[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).map(([id, rawConfig]) => {
    try {
      return normalizeServer(id, rawConfig)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Invalid MCP server "${id}": ${message}`)
    }
  })
}

function normalizeServer(id: string, value: unknown): McpServerConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('configuration must be an object')
  const config = value as Record<string, unknown>
  if (typeof config['url'] === 'string') {
    return parseMcpServerConfig({
      headers: config['headers'],
      id,
      name: typeof config['name'] === 'string' ? config['name'] : id,
      transport: 'streamable-http',
      url: config['url'],
    })
  }
  return parseMcpServerConfig({
    args: config['args'],
    command: config['command'],
    cwd: config['cwd'],
    env: config['env'],
    id,
    name: typeof config['name'] === 'string' ? config['name'] : id,
    transport: 'stdio',
  })
}
