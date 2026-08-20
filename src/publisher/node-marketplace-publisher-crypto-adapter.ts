import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto'
import type {
  MarketplaceGeneratedKeyPair,
  MarketplacePrivateKeyDescriptor,
  MarketplacePublisherCryptoPort,
} from './marketplace-publisher-ports'

const MAX_PEM_BYTES = 16_384

export class NodeMarketplacePublisherCryptoAdapter implements MarketplacePublisherCryptoPort {
  generateEd25519KeyPair(): MarketplaceGeneratedKeyPair {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const privateKeyPem = exportPrivatePem(privateKey)
    const publicKeyPem = exportPublicPem(publicKey)
    return Object.freeze({
      privateKeyPem,
      publicKeyFingerprint: fingerprint(publicKey),
      publicKeyPem,
    })
  }

  describeEd25519PrivateKey(privateKeyPem: string): MarketplacePrivateKeyDescriptor {
    const privateKey = parsePrivateKey(privateKeyPem)
    const publicKey = createPublicKey(privateKey)
    return Object.freeze({
      publicKeyFingerprint: fingerprint(publicKey),
      publicKeyPem: exportPublicPem(publicKey),
    })
  }

  signUtf8(payload: string, privateKeyPem: string): string {
    const privateKey = parsePrivateKey(privateKeyPem)
    return sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64')
  }

  verifyUtf8(payload: string, signature: string, publicKeyPem: string): boolean {
    if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) return false
    try {
      const publicKey = parsePublicKey(publicKeyPem)
      return verify(
        null,
        Buffer.from(payload, 'utf8'),
        publicKey,
        Buffer.from(signature, 'base64'),
      )
    } catch {
      return false
    }
  }
}

function parsePrivateKey(privateKeyPem: string): KeyObject {
  assertBoundedPem(privateKeyPem, 'private')
  let key: KeyObject
  try {
    key = createPrivateKey(privateKeyPem)
  } catch (error) {
    throw new Error('Marketplace publisher private key is invalid', { cause: error })
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('Marketplace publisher requires an Ed25519 private key')
  }
  return key
}

function parsePublicKey(publicKeyPem: string): KeyObject {
  assertBoundedPem(publicKeyPem, 'public')
  const key = createPublicKey(publicKeyPem)
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('Marketplace publisher requires an Ed25519 public key')
  }
  return key
}

function assertBoundedPem(value: string, label: string): void {
  if (typeof value !== 'string' || value.length < 1 || Buffer.byteLength(value, 'utf8') > MAX_PEM_BYTES) {
    throw new Error(`Marketplace publisher ${label} key is invalid`)
  }
}

function exportPrivatePem(key: KeyObject): string {
  return String(key.export({ format: 'pem', type: 'pkcs8' }))
}

function exportPublicPem(key: KeyObject): string {
  return String(key.export({ format: 'pem', type: 'spki' }))
}

function fingerprint(publicKey: KeyObject): string {
  const der = publicKey.export({ format: 'der', type: 'spki' })
  return createHash('sha256').update(der).digest('hex')
}
