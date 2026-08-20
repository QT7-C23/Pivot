import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { z } from 'zod'
import { APP_VERSION } from '../../shared/app-version'

const commonConfig = {
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
}

const mcpServerConfigSchema = z.discriminatedUnion('transport', [
  z.object({
    ...commonConfig,
    headers: z.record(z.string(), z.string()).optional(),
    transport: z.literal('streamable-http'),
    url: z.string().url(),
  }),
  z.object({
    ...commonConfig,
    args: z.array(z.string()).optional(),
    command: z.string().trim().min(1),
    cwd: z.string().trim().min(1).optional(),
    env: z.record(z.string(), z.string()).optional(),
    transport: z.literal('stdio'),
  }),
])

export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>

export interface McpToolInfo {
  description?: string
  inputSchema: unknown
  name: string
}

export interface McpResourceInfo {
  description?: string
  mimeType?: string
  name?: string
  uri: string
}

interface McpClientPort {
  callTool(request: { arguments?: Record<string, unknown>; name: string }): Promise<{ content: unknown[]; isError?: boolean }>
  close(): Promise<void>
  connect(transport: Transport): Promise<void>
  listResources(): Promise<{ resources: McpResourceInfo[] }>
  listTools(): Promise<{ tools: McpToolInfo[] }>
  readResource(request: { uri: string }): Promise<{ contents: unknown[] }>
}

type ClientFactory = () => McpClientPort
type TransportFactory = (config: McpServerConfig) => Transport

export class McpClientSession {
  private client: McpClientPort | null = null
  private readonly config: McpServerConfig

  constructor(
    config: unknown,
    private readonly clientFactory: ClientFactory = createClient,
    private readonly transportFactory: TransportFactory = createTransport,
  ) {
    this.config = parseMcpServerConfig(config)
  }

  async connect(): Promise<void> {
    if (this.client) return
    const client = this.clientFactory()
    await client.connect(this.transportFactory(this.config))
    this.client = client
  }

  async listTools(): Promise<McpToolInfo[]> {
    return (await this.requireClient().listTools()).tools.map(({ description, inputSchema, name }) => ({
      ...(description ? { description } : {}),
      inputSchema,
      name,
    }))
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<{ content: unknown[]; isError: boolean }> {
    const result = await this.requireClient().callTool({ arguments: arguments_, name })
    return { content: result.content, isError: result.isError ?? false }
  }

  async listResources(): Promise<McpResourceInfo[]> {
    return (await this.requireClient().listResources()).resources.map(({ description, mimeType, name, uri }) => ({
      ...(description ? { description } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(name ? { name } : {}),
      uri,
    }))
  }

  async readResource(uri: string): Promise<unknown[]> {
    return (await this.requireClient().readResource({ uri })).contents
  }

  async close(): Promise<void> {
    const client = this.client
    this.client = null
    await client?.close()
  }

  private requireClient(): McpClientPort {
    if (!this.client) throw new Error('MCP client is not connected')
    return this.client
  }
}

export function parseMcpServerConfig(input: unknown): McpServerConfig {
  const config = mcpServerConfigSchema.parse(input)
  if (config.transport === 'streamable-http') {
    const url = new URL(config.url)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      throw new Error('MCP URL must use HTTP or HTTPS and must not contain credentials')
    }
  }
  return config
}

function createClient(): McpClientPort {
  return new Client({ name: 'pivot', version: APP_VERSION }, { capabilities: {} }) as McpClientPort
}

function createTransport(config: McpServerConfig): Transport {
  if (config.transport === 'streamable-http') {
    return new StreamableHTTPClientTransport(new URL(config.url), {
      ...(config.headers ? { requestInit: { headers: config.headers } } : {}),
    })
  }
  return new StdioClientTransport({
    args: config.args,
    command: config.command,
    cwd: config.cwd,
    env: config.env,
    stderr: 'pipe',
  })
}
