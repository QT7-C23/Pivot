import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { MarketplaceSignedPackageArtifactSchema } from '../../src/shared/marketplace-contracts'

const roots: string[] = []

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

describe('Marketplace publisher CLI', () => {
  it('creates an exclusive keyset outside Git without printing private material', () => {
    const root = tempRoot()
    const keysetDirectory = path.join(root, 'official-keyset')

    const first = runCli('keygen', '--out-dir', keysetDirectory, '--key-id', 'pivot-marketplace-2026-01')

    expect(first.status).toBe(0)
    expect(first.stdout).toContain('official-keyset')
    expect(`${first.stdout}\n${first.stderr}`).not.toContain('BEGIN PRIVATE KEY')
    const privatePath = path.join(keysetDirectory, 'marketplace-private.pem')
    const publicPath = path.join(keysetDirectory, 'marketplace-public.pem')
    const manifestPath = path.join(keysetDirectory, 'marketplace-keyset.json')
    expect(readFileSync(privatePath, 'utf8')).toContain('BEGIN PRIVATE KEY')
    expect(readFileSync(publicPath, 'utf8')).toContain('BEGIN PUBLIC KEY')
    expect(JSON.parse(readFileSync(manifestPath, 'utf8'))).not.toHaveProperty('privateKeyPem')

    const digestBefore = sha256(privatePath)
    const repeated = runCli('keygen', '--out-dir', keysetDirectory, '--key-id', 'pivot-marketplace-2026-01')
    expect(repeated.status).not.toBe(0)
    expect(sha256(privatePath)).toBe(digestBefore)
  })

  it('refuses to generate a private key anywhere inside a Git worktree', () => {
    const root = tempRoot()
    mkdirSync(path.join(root, '.git'))

    const result = runCli(
      'keygen',
      '--out-dir', path.join(root, 'unsafe-keyset'),
      '--key-id', 'pivot-marketplace-2026-01',
    )

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/Git worktree/i)
    expect(existsSync(path.join(root, 'unsafe-keyset'))).toBe(false)
  })

  it('resolves a Windows junction before enforcing the Git worktree boundary', () => {
    const root = tempRoot()
    const repository = path.join(root, 'repository')
    const alias = path.join(root, 'repository-alias')
    mkdirSync(path.join(repository, '.git'), { recursive: true })
    symlinkSync(repository, alias, process.platform === 'win32' ? 'junction' : 'dir')

    const result = runCli(
      'keygen',
      '--out-dir', path.join(alias, 'unsafe-keyset'),
      '--key-id', 'pivot-marketplace-2026-01',
    )

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/Git worktree/i)
    expect(existsSync(path.join(repository, 'unsafe-keyset'))).toBe(false)
  })

  it('rejects unknown flags instead of silently accepting a misspelled security option', () => {
    const root = tempRoot()
    const result = runCli(
      'keygen',
      '--out-dir', path.join(root, 'official-keyset'),
      '--key-id', 'pivot-marketplace-2026-01',
      '--allow-gti', 'true',
    )

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/unknown.*--allow-gti/i)
  })

  it('signs a strict draft to a new output file and refuses silent overwrite', () => {
    const root = tempRoot()
    const keysetDirectory = path.join(root, 'official-keyset')
    expect(runCli('keygen', '--out-dir', keysetDirectory, '--key-id', 'pivot-marketplace-2026-01').status).toBe(0)
    const draftPath = path.join(root, 'catalog-draft.json')
    const outputPath = path.join(root, 'catalog-signed.json')
    writeFileSync(draftPath, JSON.stringify(draft()), 'utf8')

    const signed = runCli(
      'sign-catalog',
      '--draft', draftPath,
      '--keyset-dir', keysetDirectory,
      '--out', outputPath,
      '--lifetime-hours', '24',
    )

    expect(signed.status).toBe(0)
    const snapshot = JSON.parse(readFileSync(outputPath, 'utf8'))
    expect(snapshot).toMatchObject({ revision: 0, schemaVersion: 1 })
    expect(snapshot.signature.value).toMatch(/^[A-Za-z0-9+/]{86}==$/)
    const digestBefore = sha256(outputPath)
    const repeated = runCli(
      'sign-catalog',
      '--draft', draftPath,
      '--keyset-dir', keysetDirectory,
      '--out', outputPath,
    )
    expect(repeated.status).not.toBe(0)
    expect(sha256(outputPath)).toBe(digestBefore)
  })

  it('inspects and signs real package bytes without logging private material or overwriting evidence', () => {
    const root = tempRoot()
    const keysetDirectory = path.join(root, 'official-keyset')
    expect(runCli('keygen', '--out-dir', keysetDirectory, '--key-id', 'pivot-marketplace-2026-01').status).toBe(0)
    const artifactPath = path.join(root, 'react-reviewer.pivot')
    const identityPath = path.join(root, 'package-identity.json')
    const outputPath = path.join(root, 'package-signature.json')
    const bytes = Buffer.from('real package bytes for signing')
    writeFileSync(artifactPath, bytes)
    writeFileSync(identityPath, JSON.stringify(packageIdentity()), 'utf8')

    const signed = runCli(
      'sign-package',
      '--artifact', artifactPath,
      '--identity', identityPath,
      '--keyset-dir', keysetDirectory,
      '--out', outputPath,
    )

    expect(signed.status).toBe(0)
    expect(`${signed.stdout}\n${signed.stderr}`).not.toContain('BEGIN PRIVATE KEY')
    const envelope = MarketplaceSignedPackageArtifactSchema.parse(
      JSON.parse(readFileSync(outputPath, 'utf8')),
    )
    expect(envelope.descriptor).toMatchObject({
      ...packageIdentity(),
      byteLength: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
    expect(envelope.signature.keyId).toBe('pivot-marketplace-2026-01')

    const digestBefore = sha256(outputPath)
    const repeated = runCli(
      'sign-package',
      '--artifact', artifactPath,
      '--identity', identityPath,
      '--keyset-dir', keysetDirectory,
      '--out', outputPath,
    )
    expect(repeated.status).not.toBe(0)
    expect(sha256(outputPath)).toBe(digestBefore)
  })

  it('rejects malformed package identity and non-regular package paths', () => {
    const root = tempRoot()
    const keysetDirectory = path.join(root, 'official-keyset')
    expect(runCli('keygen', '--out-dir', keysetDirectory, '--key-id', 'pivot-marketplace-2026-01').status).toBe(0)
    const identityPath = path.join(root, 'package-identity.json')
    writeFileSync(identityPath, JSON.stringify({ ...packageIdentity(), privateKeyPem: 'forbidden' }), 'utf8')

    const malformed = runCli(
      'sign-package',
      '--artifact', root,
      '--identity', identityPath,
      '--keyset-dir', keysetDirectory,
      '--out', path.join(root, 'signature.json'),
    )
    expect(malformed.status).not.toBe(0)

    writeFileSync(identityPath, JSON.stringify(packageIdentity()), 'utf8')
    const directory = runCli(
      'sign-package',
      '--artifact', root,
      '--identity', identityPath,
      '--keyset-dir', keysetDirectory,
      '--out', path.join(root, 'signature.json'),
    )
    expect(directory.status).not.toBe(0)
    expect(`${directory.stdout}\n${directory.stderr}`).toMatch(/regular file/i)
  })
})

function runCli(...args: string[]) {
  const viteNode = path.resolve('node_modules/vite-node/vite-node.mjs')
  const script = path.resolve('scripts/marketplace-publisher.ts')
  const result = spawnSync(process.execPath, [viteNode, script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
    shell: false,
  })
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  }
}

function tempRoot(): string {
  const root = path.join(tmpdir(), `pivot-marketplace-publisher-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(root, { recursive: true })
  roots.push(root)
  return root
}

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function draft() {
  return {
    entries: [],
    revision: 0,
    schemaVersion: 1,
    source: {
      catalogUrl: 'https://qt7-c23.github.io/Pivot-Marketplace/catalog.json',
      displayName: 'Pivot Marketplace',
      id: 'pivot-official',
      schemaVersion: 1,
      trust: { algorithm: 'ed25519', keyId: 'pivot-marketplace-2026-01' },
    },
  }
}

function packageIdentity() {
  return {
    kind: 'skill' as const,
    resourceId: 'dev.pivot.react-reviewer',
    schemaVersion: 1 as const,
    sourceId: 'pivot-official',
    version: '1.0.0',
  }
}
