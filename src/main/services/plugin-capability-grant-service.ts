import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  CapabilityGrantSchema,
  PluginCapabilitySchema,
  PluginManifestSchema,
  RuntimeAdapterManifestSchema,
  type CapabilityGrant,
  type PluginCapability,
  type PluginManifest,
  type RuntimeAdapterManifest,
} from '../../shared/plugin-runtime-contracts'

export interface PluginCapabilityGrantBinding {
  pluginId: string
  runId: string
  runtimeAdapterId?: string | null
  sessionId: string
  taskId: string
}

export interface PluginCapabilityGrantIssueRequest {
  adapter: RuntimeAdapterManifest
  auditId: string
  capabilities: PluginCapability[]
  manifest: PluginManifest
  reason: string
  runId: string
  sessionId: string
  taskId: string
}

export interface PluginCapabilityGrantAuditPort {
  recordIssued(grant: CapabilityGrant): void
  recordRevoked(grantId: string, revokedAt: string): void
}

const DEFAULT_TTL_MS = 5 * 60_000
const MAX_TTL_MS = 24 * 60 * 60_000

export class PluginCapabilityGrantService {
  private readonly audit?: PluginCapabilityGrantAuditPort
  private readonly clock: () => Date
  private readonly revokedGrantIds = new Set<string>()
  private readonly secret: Buffer
  private readonly ttlMs: number

  constructor(options: {
    audit?: PluginCapabilityGrantAuditPort
    clock?: () => Date
    secret: string | Uint8Array
    ttlMs?: number
  }) {
    this.audit = options.audit
    this.clock = options.clock ?? (() => new Date())
    this.secret = Buffer.from(options.secret)
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS

    if (this.secret.byteLength < 32) {
      throw new Error('Plugin capability signing secret must contain at least 32 bytes')
    }
    if (!Number.isInteger(this.ttlMs) || this.ttlMs < 1 || this.ttlMs > MAX_TTL_MS) {
      throw new Error('Plugin capability grant TTL must be between 1 ms and 24 hours')
    }
  }

  issue(input: PluginCapabilityGrantIssueRequest): CapabilityGrant {
    const manifest = PluginManifestSchema.parse(input.manifest)
    const adapter = RuntimeAdapterManifestSchema.parse(input.adapter)
    const capabilities = input.capabilities.map((capability) => PluginCapabilitySchema.parse(capability))

    if (adapter.pluginId !== manifest.id) {
      throw new Error(`Runtime adapter ${adapter.id} is not owned by plugin ${manifest.id}`)
    }
    if (!manifest.runtimeAdapterIds.includes(adapter.id)) {
      throw new Error(`Runtime adapter ${adapter.id} is not declared by plugin ${manifest.id}`)
    }
    if (manifest.licenses.some((entry) => entry.transitiveStatus !== 'reviewed')) {
      throw new Error('Plugin capability grant requires a completed license review')
    }
    assertUniqueCapabilities(capabilities)
    assertCapabilitySubset(capabilities, manifest.declaredCapabilities, 'manifest declaration')
    assertCapabilitySubset(capabilities, adapter.requestedCapabilities, 'runtime adapter request')

    const issuedAt = this.clock()
    const unsigned = {
      auditId: input.auditId,
      capabilities,
      expiresAt: new Date(issuedAt.getTime() + this.ttlMs).toISOString(),
      grantId: `plugin-grant-${randomUUID()}`,
      issuedAt: issuedAt.toISOString(),
      issuedBy: 'pivot-main' as const,
      mode: 'runtime-grant' as const,
      pluginId: manifest.id,
      reason: input.reason,
      runId: input.runId,
      runtimeAdapterId: adapter.id,
      schemaVersion: 1 as const,
      sessionId: input.sessionId,
      taskId: input.taskId,
    }
    const grant = CapabilityGrantSchema.parse({
      ...unsigned,
      signature: this.sign(unsigned),
    })
    this.audit?.recordIssued(grant)
    return grant
  }

  verify(grantInput: CapabilityGrant, binding: PluginCapabilityGrantBinding): CapabilityGrant {
    const grant = CapabilityGrantSchema.parse(grantInput)
    if (this.revokedGrantIds.has(grant.grantId)) {
      throw new Error('Plugin capability grant has been revoked')
    }

    const { signature, ...unsigned } = grant
    if (!safeSignatureEqual(signature, this.sign(unsigned))) {
      throw new Error('Plugin capability grant signature is invalid')
    }

    const now = this.clock().getTime()
    if (now < Date.parse(grant.issuedAt)) {
      throw new Error('Plugin capability grant is not valid yet')
    }
    if (now >= Date.parse(grant.expiresAt)) {
      throw new Error('Plugin capability grant has expired')
    }
    if (
      grant.pluginId !== binding.pluginId
      || grant.runId !== binding.runId
      || grant.sessionId !== binding.sessionId
      || grant.taskId !== binding.taskId
      || (binding.runtimeAdapterId !== undefined && grant.runtimeAdapterId !== binding.runtimeAdapterId)
    ) {
      throw new Error('Plugin capability grant binding does not match the active plugin, runtime, run, session, and task')
    }
    return grant
  }

  revoke(grantId: string): void {
    if (this.revokedGrantIds.has(grantId)) return
    this.revokedGrantIds.add(grantId)
    this.audit?.recordRevoked(grantId, this.clock().toISOString())
  }

  private sign(value: object): string {
    return createHmac('sha256', this.secret).update(JSON.stringify(value)).digest('hex')
  }
}

function assertUniqueCapabilities(capabilities: PluginCapability[]): void {
  const keys = capabilities.map(capabilityKey)
  if (new Set(keys).size !== keys.length) {
    throw new Error('Plugin capability grant cannot contain duplicate capabilities')
  }
}

function assertCapabilitySubset(
  requested: PluginCapability[],
  declared: PluginCapability[],
  owner: string,
): void {
  const declaredKeys = new Set(declared.map(capabilityKey))
  if (requested.some((capability) => !declaredKeys.has(capabilityKey(capability)))) {
    throw new Error(`Requested capability is outside the ${owner}`)
  }
}

function capabilityKey(capability: PluginCapability): string {
  return JSON.stringify(PluginCapabilitySchema.parse(capability))
}

function safeSignatureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  return leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer)
}
