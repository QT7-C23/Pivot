import { z } from 'zod'

const IdentifierSchema = z.string().trim().min(1).max(160)
const SafeTokenSchema = z.string().trim().min(1).max(160).regex(
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  'Expected a stable identifier without paths or whitespace',
)
const TimestampSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Invalid ISO timestamp',
)
const SemanticVersionSchema = z.string().trim().regex(
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
  'Expected a semantic version',
)
const ImmutableCommitSchema = z.string().trim().regex(
  /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i,
  'Expected an immutable 40 or 64 character source commit',
)
const RelativeProjectPathSchema = z.string().trim().min(1).max(1_024).refine(
  isProjectRelativePath,
  'Path must stay relative to the project root',
)
const ExactNetworkHostSchema = z.string().trim().min(1).max(253).refine(
  isExactNetworkHost,
  'Network access requires an exact host with an optional port',
)
const EnvironmentVariableNameSchema = z.string().trim().regex(
  /^[A-Za-z_][A-Za-z0-9_]{0,127}$/,
  'Expected an environment variable name, not a value',
)
const HttpsUrlSchema = z.url().refine(
  (value) => value.startsWith('https://'),
  'Expected an HTTPS URL',
)

export const FilesystemCapabilitySchema = z.object({
  access: z.enum(['read', 'write', 'watch']),
  kind: z.literal('filesystem'),
  paths: z.array(RelativeProjectPathSchema).min(1).max(128),
  root: z.literal('project'),
}).strict().superRefine((capability, context) => {
  addDuplicateIssue(capability.paths, context, ['paths'], 'Filesystem paths must be unique')
})

export const NetworkCapabilitySchema = z.object({
  hosts: z.array(ExactNetworkHostSchema).min(1).max(64),
  kind: z.literal('network'),
}).strict().superRefine((capability, context) => {
  addDuplicateIssue(capability.hosts, context, ['hosts'], 'Network hosts must be unique')
})

export const ProcessCapabilitySchema = z.object({
  executableIds: z.array(SafeTokenSchema).min(1).max(32),
  kind: z.literal('process'),
}).strict().superRefine((capability, context) => {
  addDuplicateIssue(capability.executableIds, context, ['executableIds'], 'Executable identifiers must be unique')
})

export const McpCapabilitySchema = z.object({
  kind: z.literal('mcp'),
  serverIds: z.array(SafeTokenSchema).min(1).max(32),
  toolNames: z.array(SafeTokenSchema).min(1).max(128),
}).strict().superRefine((capability, context) => {
  addDuplicateIssue(capability.serverIds, context, ['serverIds'], 'MCP server identifiers must be unique')
  addDuplicateIssue(capability.toolNames, context, ['toolNames'], 'MCP tool names must be unique')
})

export const PluginCapabilitySchema = z.discriminatedUnion('kind', [
  FilesystemCapabilitySchema,
  NetworkCapabilitySchema,
  ProcessCapabilitySchema,
  McpCapabilitySchema,
])

export const LicenseEntrySchema = z.object({
  licenseId: z.string().trim().min(1).max(160),
  licenseTextPath: RelativeProjectPathSchema,
  modificationNotes: z.array(z.string().trim().min(1).max(2_000)).max(64),
  modified: z.boolean(),
  noticePath: RelativeProjectPathSchema.optional(),
  packageName: z.string().trim().min(1).max(240),
  sourceCommit: ImmutableCommitSchema,
  sourceUrl: HttpsUrlSchema,
  transitiveStatus: z.enum(['pending', 'reviewed', 'blocked']),
  version: z.string().trim().min(1).max(160),
}).strict().superRefine((entry, context) => {
  if (entry.modified && entry.modificationNotes.length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'Modified components require at least one modification note',
      path: ['modificationNotes'],
    })
  }
  if (!entry.modified && entry.modificationNotes.length > 0) {
    context.addIssue({
      code: 'custom',
      message: 'Unmodified components cannot contain modification notes',
      path: ['modificationNotes'],
    })
  }
})

export const PluginManifestSchema = z.object({
  artifactTypes: z.array(SafeTokenSchema).max(64),
  compatibility: z.object({
    maxPivotVersion: SemanticVersionSchema.optional(),
    minPivotVersion: SemanticVersionSchema,
  }).strict(),
  declaredCapabilities: z.array(PluginCapabilitySchema).max(64),
  description: z.string().trim().min(1).max(4_000),
  distribution: z.object({
    free: z.literal(true),
    sponsorshipUrl: HttpsUrlSchema.optional(),
  }).strict(),
  id: SafeTokenSchema,
  licenses: z.array(LicenseEntrySchema).min(1).max(256),
  name: z.string().trim().min(1).max(160),
  publisher: z.object({
    name: z.string().trim().min(1).max(160),
    url: HttpsUrlSchema.optional(),
  }).strict(),
  runtimeAdapterIds: z.array(SafeTokenSchema).max(32),
  schemaVersion: z.literal(1),
  source: z.object({
    repositoryUrl: HttpsUrlSchema,
    sourceCommit: ImmutableCommitSchema,
  }).strict(),
  version: SemanticVersionSchema,
}).strict().superRefine((manifest, context) => {
  addDuplicateIssue(manifest.artifactTypes, context, ['artifactTypes'], 'Artifact types must be unique')
  addDuplicateIssue(manifest.runtimeAdapterIds, context, ['runtimeAdapterIds'], 'Runtime adapter identifiers must be unique')
  addDuplicateIssue(
    manifest.licenses.map((entry) => `${entry.packageName}@${entry.version}`),
    context,
    ['licenses'],
    'License package entries must be unique',
  )
  addDuplicateIssue(
    manifest.declaredCapabilities.map((capability) => JSON.stringify(capability)),
    context,
    ['declaredCapabilities'],
    'Declared capabilities must be unique',
  )
})

const StdioTransportSchema = z.object({
  argsTemplate: z.array(z.string().max(2_000)).max(64),
  executableId: SafeTokenSchema,
  kind: z.enum(['stdio', 'mcp-stdio']),
}).strict()

const HttpTransportSchema = z.object({
  endpoint: z.url().refine(
    isSecureRuntimeEndpoint,
    'Remote runtime endpoints require HTTPS; HTTP is limited to loopback',
  ),
  kind: z.enum(['http', 'mcp-http']),
}).strict()

export const RuntimeAdapterTransportSchema = z.discriminatedUnion('kind', [
  StdioTransportSchema,
  HttpTransportSchema,
])

export const RuntimeAdapterManifestSchema = z.object({
  cancellation: z.enum(['cooperative', 'terminate-process', 'remote-request']),
  displayName: z.string().trim().min(1).max(160),
  environmentVariableNames: z.array(EnvironmentVariableNameSchema).max(64),
  healthCheck: z.object({
    timeoutMs: z.number().int().min(100).max(120_000),
  }).strict(),
  id: SafeTokenSchema,
  installation: z.enum(['user-managed', 'optional-plugin']),
  pluginId: SafeTokenSchema,
  requestedCapabilities: z.array(PluginCapabilitySchema).max(64),
  riskTier: z.enum(['low', 'standard', 'high']),
  schemaVersion: z.literal(1),
  transport: RuntimeAdapterTransportSchema,
  version: SemanticVersionSchema,
}).strict().superRefine((adapter, context) => {
  addDuplicateIssue(
    adapter.environmentVariableNames,
    context,
    ['environmentVariableNames'],
    'Environment variable names must be unique',
  )
  addDuplicateIssue(
    adapter.requestedCapabilities.map((capability) => JSON.stringify(capability)),
    context,
    ['requestedCapabilities'],
    'Requested capabilities must be unique',
  )
})

export const CapabilityGrantSchema = z.object({
  auditId: IdentifierSchema,
  capabilities: z.array(PluginCapabilitySchema).min(1).max(64),
  expiresAt: TimestampSchema,
  grantId: IdentifierSchema,
  issuedAt: TimestampSchema,
  issuedBy: z.literal('pivot-main'),
  mode: z.literal('runtime-grant'),
  pluginId: SafeTokenSchema,
  reason: z.string().trim().min(1).max(2_000),
  runId: IdentifierSchema,
  runtimeAdapterId: SafeTokenSchema.nullable(),
  schemaVersion: z.literal(1),
  sessionId: IdentifierSchema,
  signature: z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 capability grant signature'),
  taskId: IdentifierSchema,
}).strict().superRefine((grant, context) => {
  const issuedAt = Date.parse(grant.issuedAt)
  const expiresAt = Date.parse(grant.expiresAt)
  if (expiresAt <= issuedAt) {
    context.addIssue({
      code: 'custom',
      message: 'Capability grant expiry must be after its issue time',
      path: ['expiresAt'],
    })
  }
  if (expiresAt - issuedAt > 24 * 60 * 60 * 1_000) {
    context.addIssue({
      code: 'custom',
      message: 'Capability grants cannot last longer than 24 hours',
      path: ['expiresAt'],
    })
  }
  addDuplicateIssue(
    grant.capabilities.map((capability) => JSON.stringify(capability)),
    context,
    ['capabilities'],
    'Granted capabilities must be unique',
  )
})

const ExternalRunEventBaseSchema = z.object({
  pluginId: SafeTokenSchema,
  runId: IdentifierSchema,
  schemaVersion: z.literal(1),
  sequence: z.number().int().positive(),
  sessionId: IdentifierSchema,
  taskId: IdentifierSchema,
  timestamp: TimestampSchema,
}).strict()

export const ExternalRunEventSchema = z.discriminatedUnion('type', [
  ExternalRunEventBaseSchema.extend({
    detail: z.string().max(4_000),
    type: z.literal('started'),
  }).strict(),
  ExternalRunEventBaseSchema.extend({
    message: z.string().trim().min(1).max(4_000),
    progress: z.number().finite().min(0).max(1),
    type: z.literal('progress'),
  }).strict(),
  ExternalRunEventBaseSchema.extend({
    evidenceId: IdentifierSchema,
    evidenceType: SafeTokenSchema,
    locator: z.string().trim().min(1).max(2_000),
    summary: z.string().trim().min(1).max(4_000),
    type: z.literal('evidence'),
  }).strict(),
  ExternalRunEventBaseSchema.extend({
    artifactId: IdentifierSchema,
    artifactType: SafeTokenSchema,
    locator: z.string().trim().min(1).max(2_000),
    mimeType: z.string().trim().min(1).max(160),
    type: z.literal('artifact'),
  }).strict(),
  ExternalRunEventBaseSchema.extend({
    actionRequired: z.boolean(),
    code: SafeTokenSchema,
    message: z.string().trim().min(1).max(4_000),
    type: z.literal('attention'),
  }).strict(),
  ExternalRunEventBaseSchema.extend({
    artifactIds: z.array(IdentifierSchema).max(256),
    evidenceIds: z.array(IdentifierSchema).max(256),
    summary: z.string().trim().min(1).max(8_000),
    type: z.literal('completed'),
  }).strict(),
  ExternalRunEventBaseSchema.extend({
    code: SafeTokenSchema,
    message: z.string().trim().min(1).max(8_000),
    retryable: z.boolean(),
    type: z.literal('failed'),
  }).strict(),
  ExternalRunEventBaseSchema.extend({
    reason: z.string().trim().min(1).max(4_000),
    type: z.literal('cancelled'),
  }).strict(),
  ExternalRunEventBaseSchema.extend({
    costUsd: z.number().finite().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
    type: z.literal('usage'),
  }).strict(),
])

export type PluginCapability = z.infer<typeof PluginCapabilitySchema>
export type LicenseEntry = z.infer<typeof LicenseEntrySchema>
export type PluginManifest = z.infer<typeof PluginManifestSchema>
export type RuntimeAdapterTransport = z.infer<typeof RuntimeAdapterTransportSchema>
export type RuntimeAdapterManifest = z.infer<typeof RuntimeAdapterManifestSchema>
export type CapabilityGrant = z.infer<typeof CapabilityGrantSchema>
export type ExternalRunEvent = z.infer<typeof ExternalRunEventSchema>

function isProjectRelativePath(value: string): boolean {
  if (value.includes('\0') || /^[A-Za-z]:/.test(value) || value.startsWith('/') || value.startsWith('\\')) {
    return false
  }
  return !value.split(/[\\/]+/).some((segment) => segment === '..')
}

function isExactNetworkHost(value: string): boolean {
  if (value.includes('*') || value.includes('/') || value.includes('://') || /\s/.test(value)) {
    return false
  }
  const match = value.match(/^(.+?)(?::(\d{1,5}))?$/)
  if (!match) return false
  const host = match[1] ?? ''
  const port = match[2] ? Number(match[2]) : null
  if (port !== null && (port < 1 || port > 65_535)) return false
  if (host === 'localhost') return true
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    return host.split('.').every((octet) => Number(octet) <= 255)
  }
  return /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(host)
}

function isSecureRuntimeEndpoint(value: string): boolean {
  try {
    const endpoint = new URL(value)
    if (endpoint.protocol === 'https:') return true
    if (endpoint.protocol !== 'http:') return false
    return endpoint.hostname === 'localhost'
      || endpoint.hostname === '127.0.0.1'
      || endpoint.hostname === '[::1]'
  } catch {
    return false
  }
}

function addDuplicateIssue(
  values: string[],
  context: z.RefinementCtx,
  path: PropertyKey[],
  message: string,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: 'custom', message, path })
  }
}
