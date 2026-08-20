import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MarketplaceCatalogTrustRegistry } from '../../src/main/services/marketplace-catalog-trust-registry'
import { NodeMarketplacePackageArtifactInspectionAdapter } from '../../src/main/services/node-marketplace-package-artifact-inspection-adapter'
import { VerifiedMarketplacePackageArtifactAdapter } from '../../src/main/services/verified-marketplace-package-artifact-adapter'
import { NodeMarketplacePublisherCryptoAdapter } from '../../src/publisher/node-marketplace-publisher-crypto-adapter'
import { MarketplacePublisher } from '../../src/publisher/marketplace-publisher'
import {
  MarketplacePackageArtifactDescriptorSchema,
  serializeMarketplacePackageArtifactDescriptor,
} from '../../src/shared/marketplace-contracts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
})

describe('Marketplace package publisher', () => {
  it('produces a real Ed25519 envelope accepted by the production Main verifier', async () => {
    const fixture = createFixture(Buffer.from('signed package bytes'))

    const signed = fixture.publisher.signPackageArtifact({
      descriptor: fixture.descriptor,
      keyset: fixture.keyset,
    })
    const evidence = await fixture.verifier.verify({
      artifactPath: fixture.artifactPath,
      descriptor: signed.descriptor,
      signature: signed.signature,
    })

    expect(evidence.status).toBe('verified')
    expect(signed.signature.keyId).toBe(fixture.keyset.manifest.keyId)
    expect(fixture.crypto.verifyUtf8(
      serializeMarketplacePackageArtifactDescriptor(signed.descriptor),
      signed.signature.value,
      fixture.keyset.manifest.publicKeyPem,
    )).toBe(true)
    expect(fixture.crypto.verifyUtf8(
      JSON.stringify(signed.descriptor),
      signed.signature.value,
      fixture.keyset.manifest.publicKeyPem,
    )).toBe(false)
  })

  it('fails production verification after byte or signed identity tampering', async () => {
    const fixture = createFixture(Buffer.from('original package'))
    const signed = fixture.publisher.signPackageArtifact({
      descriptor: fixture.descriptor,
      keyset: fixture.keyset,
    })

    writeFileSync(fixture.artifactPath, Buffer.from('tampered package'))
    await expect(fixture.verifier.verify({
      artifactPath: fixture.artifactPath,
      descriptor: signed.descriptor,
      signature: signed.signature,
    })).rejects.toThrow(/SHA-256|digest/i)

    await expect(fixture.verifier.verify({
      artifactPath: fixture.artifactPath,
      descriptor: { ...signed.descriptor, resourceId: 'dev.pivot.other' },
      signature: signed.signature,
    })).rejects.toThrow(/signature/i)
  })

  it('rejects unknown descriptor fields and a private key mismatched to its manifest', () => {
    const fixture = createFixture(Buffer.from('package'))
    const other = fixture.publisher.createKeyset({ keyId: fixture.keyset.manifest.keyId })

    expect(() => fixture.publisher.signPackageArtifact({
      descriptor: { ...fixture.descriptor, command: 'install.exe' },
      keyset: fixture.keyset,
    })).toThrow()
    expect(() => fixture.publisher.signPackageArtifact({
      descriptor: fixture.descriptor,
      keyset: { ...fixture.keyset, privateKeyPem: other.privateKeyPem },
    })).toThrow(/keyset/i)
  })
})

function createFixture(bytes: Buffer) {
  const root = mkdtempSync(path.join(tmpdir(), 'pivot-package-publisher-'))
  roots.push(root)
  const artifactPath = path.join(root, 'package.pivot')
  writeFileSync(artifactPath, bytes)
  const crypto = new NodeMarketplacePublisherCryptoAdapter()
  const publisher = new MarketplacePublisher({
    clock: () => new Date('2026-08-20T00:00:00.000Z'),
    crypto,
  })
  const keyset = publisher.createKeyset({ keyId: 'pivot-marketplace-2026-01' })
  const descriptor = MarketplacePackageArtifactDescriptorSchema.parse({
    byteLength: bytes.byteLength,
    kind: 'skill',
    resourceId: 'dev.pivot.react-reviewer',
    schemaVersion: 1,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sourceId: 'pivot-official',
    version: '1.0.0',
  })
  const source = {
    catalogUrl: 'https://qt7-c23.github.io/Pivot-Marketplace/catalog.json',
    displayName: 'Pivot Marketplace',
    id: 'pivot-official',
    schemaVersion: 1 as const,
    trust: { algorithm: 'ed25519' as const, keyId: keyset.manifest.keyId },
  }
  const trust = new MarketplaceCatalogTrustRegistry([{
    publicKeyPem: keyset.manifest.publicKeyPem,
    source,
  }]).openReaderPort()
  const verifier = new VerifiedMarketplacePackageArtifactAdapter({
    inspection: new NodeMarketplacePackageArtifactInspectionAdapter().openInspectionPort(),
    trust,
  }).openVerificationPort()
  return { artifactPath, crypto, descriptor, keyset, publisher, verifier }
}
