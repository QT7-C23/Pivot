export interface MarketplaceGeneratedKeyPair {
  readonly privateKeyPem: string
  readonly publicKeyFingerprint: string
  readonly publicKeyPem: string
}

export interface MarketplacePrivateKeyDescriptor {
  readonly publicKeyFingerprint: string
  readonly publicKeyPem: string
}

export interface MarketplacePublisherCryptoPort {
  describeEd25519PrivateKey(privateKeyPem: string): MarketplacePrivateKeyDescriptor
  generateEd25519KeyPair(): MarketplaceGeneratedKeyPair
  signUtf8(payload: string, privateKeyPem: string): string
  verifyUtf8(payload: string, signature: string, publicKeyPem: string): boolean
}
