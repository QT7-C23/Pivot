import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MAX_MARKETPLACE_PACKAGE_BYTES,
  MarketplacePackageArtifactDescriptorSchema,
  MarketplacePackageArtifactIdentitySchema,
} from '../src/shared/marketplace-contracts'
import { NodeMarketplacePackageArtifactInspectionAdapter } from '../src/main/services/node-marketplace-package-artifact-inspection-adapter'
import { MarketplaceKeysetManifestSchema } from '../src/publisher/marketplace-publisher-contracts'
import { NodeMarketplacePublisherCryptoAdapter } from '../src/publisher/node-marketplace-publisher-crypto-adapter'
import { MarketplacePublisher } from '../src/publisher/marketplace-publisher'

const MAX_JSON_BYTES = 5 * 1024 * 1024
const MAX_KEY_BYTES = 16_384
const PRIVATE_FILE = 'marketplace-private.pem'
const PUBLIC_FILE = 'marketplace-public.pem'
const MANIFEST_FILE = 'marketplace-keyset.json'

const publisher = new MarketplacePublisher({
  crypto: new NodeMarketplacePublisherCryptoAdapter(),
})
const artifactInspection = new NodeMarketplacePackageArtifactInspectionAdapter().openInspectionPort()

void main()

async function main(): Promise<void> {
  try {
    await run(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function run(argv: string[]): Promise<void> {
  const command = argv[0]
  const flags = parseFlags(argv.slice(1))
  if (command === 'keygen') {
    assertAllowedFlags(flags, ['--out-dir', '--key-id'])
    generateKeyset(requireFlag(flags, '--out-dir'), requireFlag(flags, '--key-id'))
    return
  }
  if (command === 'sign-catalog') {
    assertAllowedFlags(flags, ['--draft', '--keyset-dir', '--out', '--lifetime-hours'])
    signCatalog({
      draftPath: requireFlag(flags, '--draft'),
      keysetDirectory: requireFlag(flags, '--keyset-dir'),
      lifetimeHours: optionalPositiveInteger(flags, '--lifetime-hours'),
      outputPath: requireFlag(flags, '--out'),
    })
    return
  }
  if (command === 'sign-package') {
    assertAllowedFlags(flags, ['--artifact', '--identity', '--keyset-dir', '--out'])
    await signPackage({
      artifactPath: requireFlag(flags, '--artifact'),
      identityPath: requireFlag(flags, '--identity'),
      keysetDirectory: requireFlag(flags, '--keyset-dir'),
      outputPath: requireFlag(flags, '--out'),
    })
    return
  }
  throw new Error(
    'Usage: marketplace-publisher <keygen|sign-catalog|sign-package> with the required command flags',
  )
}

function generateKeyset(outputInput: string, keyId: string): void {
  const outputDirectory = path.resolve(outputInput)
  assertOutsideGitWorktree(outputDirectory)
  if (existsSync(outputDirectory)) {
    throw new Error(`Marketplace keyset output already exists: ${outputDirectory}`)
  }
  const parent = path.dirname(outputDirectory)
  if (!existsSync(parent) || !statSync(parent).isDirectory()) {
    throw new Error(`Marketplace keyset parent directory does not exist: ${parent}`)
  }

  const keyset = publisher.createKeyset({ keyId })
  let created = false
  try {
    mkdirSync(outputDirectory, { mode: 0o700 })
    created = true
    writeFileSync(path.join(outputDirectory, PRIVATE_FILE), keyset.privateKeyPem, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    writeFileSync(path.join(outputDirectory, PUBLIC_FILE), keyset.manifest.publicKeyPem, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o644,
    })
    writeFileSync(
      path.join(outputDirectory, MANIFEST_FILE),
      `${JSON.stringify(keyset.manifest, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o644 },
    )
  } catch (error) {
    if (created) rmSync(outputDirectory, { force: true, recursive: true })
    throw new Error('Marketplace keyset could not be written safely', { cause: error })
  }

  console.log(`Marketplace keyset created: ${outputDirectory}`)
  console.log(`Key ID: ${keyset.manifest.keyId}`)
  console.log(`Public fingerprint: ${keyset.manifest.publicKeyFingerprint}`)
  console.log('Keep marketplace-private.pem offline and never commit or share it.')
}

function signCatalog(options: {
  readonly draftPath: string
  readonly keysetDirectory: string
  readonly lifetimeHours?: number
  readonly outputPath: string
}): void {
  const keyset = readKeyset(options.keysetDirectory)
  const snapshot = publisher.signCatalog({
    draft: readBoundedJson(path.resolve(options.draftPath), MAX_JSON_BYTES),
    keyset,
    lifetimeHours: options.lifetimeHours,
  })
  const outputPath = path.resolve(options.outputPath)
  const parent = path.dirname(outputPath)
  if (!existsSync(parent) || !statSync(parent).isDirectory()) {
    throw new Error(`Marketplace Catalog output directory does not exist: ${parent}`)
  }
  writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o644,
  })
  console.log(`Signed Marketplace Catalog created: ${outputPath}`)
  console.log(`Revision: ${snapshot.revision}; expires: ${snapshot.expiresAt}`)
}

async function signPackage(options: {
  readonly artifactPath: string
  readonly identityPath: string
  readonly keysetDirectory: string
  readonly outputPath: string
}): Promise<void> {
  const identity = MarketplacePackageArtifactIdentitySchema.parse(
    readBoundedJson(path.resolve(options.identityPath), MAX_JSON_BYTES),
  )
  const artifactPath = path.resolve(options.artifactPath)
  const inspection = await artifactInspection.inspect({
    artifactPath,
    maxByteLength: MAX_MARKETPLACE_PACKAGE_BYTES,
  })
  const descriptor = MarketplacePackageArtifactDescriptorSchema.parse({
    byteLength: inspection.byteLength,
    ...identity,
    sha256: inspection.sha256,
  })
  const signed = publisher.signPackageArtifact({
    descriptor,
    keyset: readKeyset(options.keysetDirectory),
  })
  const outputPath = path.resolve(options.outputPath)
  assertOutputParent(outputPath, 'package signature')
  writeFileSync(outputPath, `${JSON.stringify(signed, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o644,
  })
  console.log(`Signed Marketplace package artifact created: ${outputPath}`)
  console.log(`Resource: ${signed.descriptor.kind}:${signed.descriptor.resourceId}@${signed.descriptor.version}`)
  console.log(`Bytes: ${signed.descriptor.byteLength}; SHA-256: ${signed.descriptor.sha256}`)
}

function readKeyset(keysetDirectoryInput: string) {
  const keysetDirectory = path.resolve(keysetDirectoryInput)
  assertOutsideGitWorktree(keysetDirectory)
  const privateKeyPem = readBoundedText(path.join(keysetDirectory, PRIVATE_FILE), MAX_KEY_BYTES)
  const publicKeyPem = readBoundedText(path.join(keysetDirectory, PUBLIC_FILE), MAX_KEY_BYTES)
  const manifest = MarketplaceKeysetManifestSchema.parse(
    readBoundedJson(path.join(keysetDirectory, MANIFEST_FILE), MAX_KEY_BYTES),
  )
  if (manifest.publicKeyPem !== publicKeyPem) {
    throw new Error('Marketplace keyset public file does not match its manifest')
  }
  return { manifest, privateKeyPem }
}

function assertOutputParent(outputPath: string, label: string): void {
  const parent = path.dirname(outputPath)
  if (!existsSync(parent) || !statSync(parent).isDirectory()) {
    throw new Error(`Marketplace ${label} output directory does not exist: ${parent}`)
  }
}

function readBoundedJson(filePath: string, maxBytes: number): unknown {
  const text = readBoundedText(filePath, maxBytes)
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new Error(`Marketplace publisher JSON is malformed: ${filePath}`, { cause: error })
  }
}

function readBoundedText(filePath: string, maxBytes: number): string {
  const stats = lstatSync(filePath)
  if (stats.isSymbolicLink()) {
    throw new Error(`Marketplace publisher input cannot be a symbolic link: ${filePath}`)
  }
  if (!stats.isFile() || stats.size < 1 || stats.size > maxBytes) {
    throw new Error(`Marketplace publisher input has an invalid size: ${filePath}`)
  }
  return readFileSync(filePath, 'utf8')
}

function assertOutsideGitWorktree(targetPath: string): void {
  let cursor = nearestExistingAncestor(path.resolve(targetPath))
  while (true) {
    if (existsSync(path.join(cursor, '.git'))) {
      throw new Error(`Marketplace private key material cannot be stored inside a Git worktree: ${targetPath}`)
    }
    const parent = path.dirname(cursor)
    if (parent === cursor) return
    cursor = parent
  }
}

function nearestExistingAncestor(targetPath: string): string {
  let cursor = targetPath
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor)
    if (parent === cursor) throw new Error(`Marketplace publisher path has no existing ancestor: ${targetPath}`)
    cursor = parent
  }
  return realpathSync.native(cursor)
}

function parseFlags(args: string[]): ReadonlyMap<string, string> {
  if (args.length % 2 !== 0) throw new Error('Marketplace publisher flags require values')
  const flags = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]
    const value = args[index + 1]
    if (!name.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`Invalid Marketplace publisher flag near: ${name}`)
    }
    if (flags.has(name)) throw new Error(`Duplicate Marketplace publisher flag: ${name}`)
    flags.set(name, value)
  }
  return flags
}

function requireFlag(flags: ReadonlyMap<string, string>, name: string): string {
  const value = flags.get(name)
  if (!value) throw new Error(`Missing required Marketplace publisher flag: ${name}`)
  return value
}

function assertAllowedFlags(flags: ReadonlyMap<string, string>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed)
  for (const name of flags.keys()) {
    if (!allowedSet.has(name)) throw new Error(`Unknown Marketplace publisher flag: ${name}`)
  }
}

function optionalPositiveInteger(
  flags: ReadonlyMap<string, string>,
  name: string,
): number | undefined {
  const value = flags.get(name)
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Marketplace publisher flag must be a positive integer: ${name}`)
  }
  return parsed
}

export const MARKETPLACE_PUBLISHER_SCRIPT = fileURLToPath(import.meta.url)
