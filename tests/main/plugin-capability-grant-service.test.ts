import { describe, expect, it } from 'vitest'
import type {
  PluginCapability,
  PluginManifest,
  RuntimeAdapterManifest,
} from '../../src/shared/plugin-runtime-contracts'
import { PluginCapabilityGrantService } from '../../src/main/services/plugin-capability-grant-service'

const NOW = new Date('2026-07-27T00:00:00.000Z')
const SECRET = '0123456789abcdef0123456789abcdef'

describe('PluginCapabilityGrantService', () => {
  it('issues and verifies a signed short-lived grant bound to one run', () => {
    const service = createService()
    const grant = service.issue({
      adapter: validAdapter(),
      auditId: 'audit-1',
      capabilities: [readSourceCapability()],
      manifest: validManifest(),
      reason: 'Read source for the active analysis task',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })

    expect(grant.issuedBy).toBe('pivot-main')
    expect(grant.signature).toMatch(/^[a-f0-9]{64}$/)
    expect(grant.expiresAt).toBe('2026-07-27T00:05:00.000Z')
    expect(service.verify(grant, {
      pluginId: 'dev.pivot.serena',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })).toEqual(grant)
  })

  it('rejects capabilities outside both declarations and adapter requests', () => {
    const service = createService()

    expect(() => service.issue({
      adapter: validAdapter(),
      auditId: 'audit-1',
      capabilities: [{ hosts: ['api.example.com'], kind: 'network' }],
      manifest: validManifest(),
      reason: 'Unexpected network access',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })).toThrow(/outside.*manifest/i)
  })

  it('rejects mismatched adapters and blocked dependency reviews', () => {
    const service = createService()

    expect(() => service.issue({
      adapter: { ...validAdapter(), pluginId: 'dev.pivot.other' },
      auditId: 'audit-1',
      capabilities: [readSourceCapability()],
      manifest: validManifest(),
      reason: 'Mismatched ownership',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })).toThrow(/owned by/i)

    const manifest = validManifest()
    manifest.licenses[0]!.transitiveStatus = 'blocked'
    expect(() => service.issue({
      adapter: validAdapter(),
      auditId: 'audit-1',
      capabilities: [readSourceCapability()],
      manifest,
      reason: 'Blocked provenance',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })).toThrow(/license review/i)
  })

  it('rejects tampering, binding changes, expiry, and revoked grants', () => {
    let now = new Date(NOW)
    const service = createService(() => now)
    const grant = service.issue({
      adapter: validAdapter(),
      auditId: 'audit-1',
      capabilities: [readSourceCapability()],
      manifest: validManifest(),
      reason: 'Read source',
      runId: 'run-1',
      sessionId: 'session-1',
      taskId: 'task-1',
    })

    expect(() => service.verify({ ...grant, reason: 'Tampered' }, {
      pluginId: grant.pluginId,
      runId: grant.runId,
      sessionId: grant.sessionId,
      taskId: grant.taskId,
    })).toThrow(/signature/i)

    expect(() => service.verify(grant, {
      pluginId: grant.pluginId,
      runId: 'run-2',
      sessionId: grant.sessionId,
      taskId: grant.taskId,
    })).toThrow(/binding/i)

    now = new Date(grant.expiresAt)
    expect(() => service.verify(grant, {
      pluginId: grant.pluginId,
      runId: grant.runId,
      sessionId: grant.sessionId,
      taskId: grant.taskId,
    })).toThrow(/expired/i)

    now = new Date(NOW)
    service.revoke(grant.grantId)
    expect(() => service.verify(grant, {
      pluginId: grant.pluginId,
      runId: grant.runId,
      sessionId: grant.sessionId,
      taskId: grant.taskId,
    })).toThrow(/revoked/i)
  })
})

function createService(clock: () => Date = () => new Date(NOW)) {
  return new PluginCapabilityGrantService({ clock, secret: SECRET, ttlMs: 5 * 60_000 })
}

function readSourceCapability(): PluginCapability {
  return { access: 'read', kind: 'filesystem', paths: ['src'], root: 'project' }
}

function validManifest(): PluginManifest {
  return {
    artifactTypes: ['code-analysis'],
    compatibility: { minPivotVersion: '0.1.33' },
    declaredCapabilities: [readSourceCapability()],
    description: 'Read-only semantic code intelligence.',
    distribution: { free: true },
    id: 'dev.pivot.serena',
    licenses: [{
      licenseId: 'MIT',
      licenseTextPath: 'third-party/serena/LICENSE',
      modificationNotes: [],
      modified: false,
      packageName: 'serena',
      sourceCommit: '0123456789abcdef0123456789abcdef01234567',
      sourceUrl: 'https://github.com/oraios/serena',
      transitiveStatus: 'reviewed',
      version: '0.1.0',
    }],
    name: 'Serena Connector',
    publisher: { name: 'Pivot Community' },
    runtimeAdapterIds: ['dev.pivot.serena.mcp'],
    schemaVersion: 1,
    source: {
      repositoryUrl: 'https://github.com/oraios/serena',
      sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    },
    version: '0.1.0',
  }
}

function validAdapter(): RuntimeAdapterManifest {
  return {
    cancellation: 'cooperative',
    displayName: 'Serena MCP',
    environmentVariableNames: [],
    healthCheck: { timeoutMs: 5_000 },
    id: 'dev.pivot.serena.mcp',
    installation: 'user-managed',
    pluginId: 'dev.pivot.serena',
    requestedCapabilities: [readSourceCapability()],
    riskTier: 'standard',
    schemaVersion: 1,
    transport: {
      argsTemplate: ['--transport', 'stdio'],
      executableId: 'serena',
      kind: 'mcp-stdio',
    },
    version: '0.1.0',
  }
}
