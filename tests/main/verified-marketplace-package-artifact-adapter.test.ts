import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MarketplacePackageArtifactDescriptorSchema,
  serializeMarketplacePackageArtifactDescriptor,
  type MarketplacePackageArtifactDescriptor,
} from '../../src/shared/marketplace-contracts'
import { MarketplaceCatalogTrustRegistry } from '../../src/main/services/marketplace-catalog-trust-registry'
import { NodeMarketplacePackageArtifactInspectionAdapter } from '../../src/main/services/node-marketplace-package-artifact-inspection-adapter'
import { VerifiedMarketplacePackageArtifactAdapter } from '../../src/main/services/verified-marketplace-package-artifact-adapter'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('verified Marketplace package artifact adapter', () => {
  it('streams a real file and verifies its signed identity, byte length and SHA-256', async () => {
    const fixture = createFixture(Buffer.from('signed marketplace package bytes'))

    const evidence = await fixture.verifier.verify({
      artifactPath: fixture.artifactPath,
      descriptor: fixture.descriptor,
      signature: fixture.signature,
    })

    expect(evidence.status).toBe('verified')
    expect(evidence.descriptor).toEqual(fixture.descriptor)
    expect(evidence.artifactPath).toBe(fixture.artifactPath)
    expect(evidence.verifiedAt).toBe('2026-08-18T00:00:00.000Z')
    expect(Object.isFrozen(evidence)).toBe(true)
  })

  it('rejects tampering, truncation and replacement with different bytes', async () => {
    const tampered = createFixture(Buffer.from('original package'))
    writeFileSync(tampered.artifactPath, Buffer.from('tampered package'))
    await expect(tampered.verifier.verify(tampered.request())).rejects.toThrow(/SHA-256|digest/i)

    const truncated = createFixture(Buffer.from('complete package'))
    writeFileSync(truncated.artifactPath, Buffer.from('short'))
    await expect(truncated.verifier.verify(truncated.request())).rejects.toThrow(/byte length|size/i)

    const replaced = createFixture(Buffer.from('trusted package'))
    rmSync(replaced.artifactPath)
    writeFileSync(replaced.artifactPath, Buffer.from('replaced bytes!'))
    await expect(replaced.verifier.verify(replaced.request())).rejects.toThrow(/SHA-256|digest/i)
  })

  it('rejects a wrong signature and an unknown signing key before accepting bytes', async () => {
    const fixture = createFixture(Buffer.from('trusted bytes'))
    const other = generateKeyPairSync('ed25519')
    const wrongValue = sign(
      null,
      Buffer.from(serializeMarketplacePackageArtifactDescriptor(fixture.descriptor), 'utf8'),
      other.privateKey,
    ).toString('base64')

    await expect(fixture.verifier.verify({
      ...fixture.request(),
      signature: { ...fixture.signature, value: wrongValue },
    })).rejects.toThrow(/signature/i)
    await expect(fixture.verifier.verify({
      ...fixture.request(),
      signature: { ...fixture.signature, keyId: 'unknown-key' },
    })).rejects.toThrow(/trusted|key/i)
  })

  it('rejects missing, non-regular and symbolic-link paths', async () => {
    const missing = createFixture(Buffer.from('bytes'))
    rmSync(missing.artifactPath)
    await expect(missing.verifier.verify(missing.request())).rejects.toThrow(/open|missing|ENOENT/i)

    const directory = createFixture(Buffer.from('bytes'))
    await expect(directory.verifier.verify({
      ...directory.request(),
      artifactPath: directory.root,
    })).rejects.toThrow(/regular file/i)

    const linked = createFixture(Buffer.from('bytes'))
    const linkPath = path.join(linked.root, 'linked-package')
    symlinkSync(linked.root, linkPath, 'junction')
    await expect(linked.verifier.verify({
      ...linked.request(),
      artifactPath: linkPath,
    })).rejects.toThrow(/symbolic link/i)
  })

  it('enforces the signed and configured byte ceilings without loading the artifact', async () => {
    const fixture = createFixture(Buffer.alloc(32, 1), 16)
    await expect(fixture.verifier.verify(fixture.request())).rejects.toThrow(/maximum|limit/i)
  })
})

function createFixture(bytes: Buffer, maxByteLength = 512 * 1024 * 1024) {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-marketplace-package-'))
  roots.push(root)
  const artifactPath = path.join(root, 'package.pivot')
  writeFileSync(artifactPath, bytes)
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const descriptor = MarketplacePackageArtifactDescriptorSchema.parse({
    byteLength: bytes.byteLength,
    kind: 'skill',
    resourceId: 'dev.pivot.react-reviewer',
    schemaVersion: 1,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sourceId: 'official',
    version: '1.0.0',
  })
  const signature = {
    algorithm: 'ed25519' as const,
    keyId: 'pivot-official-2026',
    value: sign(
      null,
      Buffer.from(serializeMarketplacePackageArtifactDescriptor(descriptor), 'utf8'),
      privateKey,
    ).toString('base64'),
  }
  const trust = new MarketplaceCatalogTrustRegistry([{
    publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    source: {
      catalogUrl: 'https://catalog.pivot.invalid/catalog.json',
      displayName: 'Pivot Official',
      id: 'official',
      schemaVersion: 1,
      trust: { algorithm: 'ed25519', keyId: signature.keyId },
    },
  }])
  const inspection = new NodeMarketplacePackageArtifactInspectionAdapter().openInspectionPort()
  const verifier = new VerifiedMarketplacePackageArtifactAdapter({
    clock: () => new Date('2026-08-18T00:00:00.000Z'),
    inspection,
    maxByteLength,
    trust: trust.openReaderPort(),
  }).openVerificationPort()
  return {
    artifactPath,
    descriptor,
    request: () => ({ artifactPath, descriptor, signature }),
    root,
    signature,
    verifier,
  }
}
