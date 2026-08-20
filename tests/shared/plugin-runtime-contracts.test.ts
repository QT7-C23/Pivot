import { describe, expect, it } from 'vitest'
import {
  CapabilityGrantSchema,
  ExternalRunEventSchema,
  LicenseEntrySchema,
  PluginManifestSchema,
  RuntimeAdapterManifestSchema,
} from '../../src/shared/plugin-runtime-contracts'

describe('plugin and external runtime hard contracts', () => {
  it('accepts a free plugin manifest with pinned license provenance', () => {
    const manifest = PluginManifestSchema.parse(validPluginManifest())

    expect(manifest.distribution.free).toBe(true)
    expect(manifest.declaredCapabilities[0]).toMatchObject({
      access: 'read',
      kind: 'filesystem',
      root: 'project',
    })
    expect(manifest.licenses[0]?.sourceCommit).toHaveLength(40)
  })

  it('rejects commerce fields and runtime grant data in a manifest declaration', () => {
    expect(() => PluginManifestSchema.parse({
      ...validPluginManifest(),
      distribution: { free: true, price: 9.99 },
    })).toThrow()

    expect(() => PluginManifestSchema.parse({
      ...validPluginManifest(),
      issuedAt: '2026-07-27T00:00:00.000Z',
      expiresAt: '2026-07-27T01:00:00.000Z',
    })).toThrow()
  })

  it('rejects path escapes and wildcard network declarations', () => {
    expect(() => PluginManifestSchema.parse({
      ...validPluginManifest(),
      declaredCapabilities: [
        { access: 'write', kind: 'filesystem', paths: ['../outside'], root: 'project' },
      ],
    })).toThrow(/relative|project/i)

    expect(() => PluginManifestSchema.parse({
      ...validPluginManifest(),
      declaredCapabilities: [
        { hosts: ['*.example.com'], kind: 'network' },
      ],
    })).toThrow(/exact host/i)
  })

  it('accepts HTTPS and loopback HTTP adapters without environment values', () => {
    expect(RuntimeAdapterManifestSchema.parse({
      ...validRuntimeAdapter(),
      transport: { endpoint: 'https://runtime.example.com/v1/events', kind: 'http' },
    }).transport.kind).toBe('http')

    expect(RuntimeAdapterManifestSchema.parse({
      ...validRuntimeAdapter(),
      transport: { endpoint: 'http://127.0.0.1:4318/events', kind: 'mcp-http' },
    }).transport.kind).toBe('mcp-http')
  })

  it('rejects insecure remote endpoints and environment secret values', () => {
    expect(() => RuntimeAdapterManifestSchema.parse({
      ...validRuntimeAdapter(),
      transport: { endpoint: 'http://runtime.example.com/events', kind: 'http' },
    })).toThrow(/HTTPS|loopback/i)

    expect(() => RuntimeAdapterManifestSchema.parse({
      ...validRuntimeAdapter(),
      environment: { API_KEY: 'secret-value' },
    })).toThrow()
  })

  it('requires short-lived grants issued by Pivot Main', () => {
    expect(CapabilityGrantSchema.parse(validGrant()).issuedBy).toBe('pivot-main')

    expect(() => CapabilityGrantSchema.parse({
      ...validGrant(),
      expiresAt: '2026-07-28T00:00:00.001Z',
    })).toThrow(/24 hours/i)

    expect(() => CapabilityGrantSchema.parse({
      ...validGrant(),
      expiresAt: '2026-07-26T23:59:59.999Z',
    })).toThrow(/after/i)
  })

  it('keeps external run events ordered, bounded, and secret-free', () => {
    expect(ExternalRunEventSchema.parse({
      artifactIds: ['artifact-1'],
      evidenceIds: ['evidence-1'],
      pluginId: 'dev.pivot.serena',
      runId: 'run-1',
      schemaVersion: 1,
      sequence: 4,
      sessionId: 'session-1',
      summary: 'Read-only code analysis finished',
      taskId: 'task-1',
      timestamp: '2026-07-27T00:00:04.000Z',
      type: 'completed',
    }).type).toBe('completed')

    expect(() => ExternalRunEventSchema.parse({
      apiKey: 'must-never-enter-events',
      message: 'Halfway',
      pluginId: 'dev.pivot.serena',
      progress: 0.5,
      runId: 'run-1',
      schemaVersion: 1,
      sequence: 2,
      sessionId: 'session-1',
      taskId: 'task-1',
      timestamp: '2026-07-27T00:00:02.000Z',
      type: 'progress',
    })).toThrow()
  })

  it('requires immutable source provenance and truthful modification notes', () => {
    expect(() => LicenseEntrySchema.parse({
      ...validLicense(),
      sourceCommit: 'main',
    })).toThrow(/commit/i)

    expect(() => LicenseEntrySchema.parse({
      ...validLicense(),
      modificationNotes: [],
      modified: true,
    })).toThrow(/modification/i)

    expect(() => LicenseEntrySchema.parse({
      ...validLicense(),
      modificationNotes: ['Changed the adapter'],
      modified: false,
    })).toThrow(/unmodified/i)
  })
})

function validPluginManifest() {
  return {
    artifactTypes: ['code-analysis'],
    compatibility: { minPivotVersion: '0.1.33' },
    declaredCapabilities: [
      { access: 'read', kind: 'filesystem', paths: ['src'], root: 'project' },
      { kind: 'mcp', serverIds: ['serena'], toolNames: ['find-symbol'] },
    ],
    description: 'Read-only semantic code intelligence.',
    distribution: { free: true as const },
    id: 'dev.pivot.serena',
    licenses: [validLicense()],
    name: 'Serena Connector',
    publisher: { name: 'Pivot Community', url: 'https://pivot.example.org' },
    runtimeAdapterIds: ['dev.pivot.serena.mcp'],
    schemaVersion: 1 as const,
    source: {
      repositoryUrl: 'https://github.com/oraios/serena',
      sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    },
    version: '0.1.0',
  }
}

function validRuntimeAdapter() {
  return {
    cancellation: 'cooperative' as const,
    displayName: 'Serena MCP',
    environmentVariableNames: ['SERENA_CONFIG_PATH'],
    healthCheck: { timeoutMs: 5_000 },
    id: 'dev.pivot.serena.mcp',
    installation: 'user-managed' as const,
    pluginId: 'dev.pivot.serena',
    requestedCapabilities: [
      { access: 'read', kind: 'filesystem' as const, paths: ['src'], root: 'project' as const },
    ],
    riskTier: 'standard' as const,
    schemaVersion: 1 as const,
    transport: {
      argsTemplate: ['--transport', 'stdio'],
      executableId: 'serena',
      kind: 'mcp-stdio' as const,
    },
    version: '0.1.0',
  }
}

function validGrant() {
  return {
    auditId: 'audit-1',
    capabilities: [
      { access: 'read', kind: 'filesystem' as const, paths: ['src'], root: 'project' as const },
    ],
    expiresAt: '2026-07-27T01:00:00.000Z',
    grantId: 'grant-1',
    issuedAt: '2026-07-27T00:00:00.000Z',
    issuedBy: 'pivot-main' as const,
    mode: 'runtime-grant' as const,
    pluginId: 'dev.pivot.serena',
    reason: 'Read project symbols for the active task',
    runId: 'run-1',
    runtimeAdapterId: 'dev.pivot.serena.mcp',
    schemaVersion: 1 as const,
    sessionId: 'session-1',
    signature: '0'.repeat(64),
    taskId: 'task-1',
  }
}

function validLicense() {
  return {
    licenseId: 'MIT',
    licenseTextPath: 'third-party/serena/LICENSE',
    modificationNotes: [] as string[],
    modified: false,
    packageName: 'serena',
    sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    sourceUrl: 'https://github.com/oraios/serena',
    transitiveStatus: 'reviewed' as const,
    version: '0.1.0',
  }
}
