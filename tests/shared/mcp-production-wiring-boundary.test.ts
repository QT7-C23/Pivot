import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('MCP production wiring security boundary', () => {
  it('keeps configuration-driven process launch unreachable until an audited grant and allowlist exist', () => {
    const ipc = readFileSync('src/main/ipc-handlers.ts', 'utf8')
    const preload = readFileSync('src/main/preload.ts', 'utf8')
    const contract = readFileSync('src/shared/types/ipc.ts', 'utf8')
    const client = readFileSync('src/main/services/mcp-client.ts', 'utf8')

    expect(client).toContain('StdioClientTransport')
    for (const productionEntry of [ipc, preload, contract]) {
      expect(productionEntry).not.toMatch(/McpClientSession|parseMcpServerConfig|mcp-client|mcp-config-loader|mcp:(connect|start|launch)/i)
    }
    expect(client).not.toMatch(/renderer\//)
  })
})
