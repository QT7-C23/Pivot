# Marketplace package artifact verification foundation

Pivot treats every downloaded Marketplace package as untrusted bytes. This
foundation verifies a staged regular file in Main before any future extractor
or installer may consume it.

## Signed descriptor v1

The package Ed25519 signature covers the fixed
`pivot-marketplace-package:v1` domain line followed by the canonical UTF-8
serialization of a strict `MarketplacePackageArtifactDescriptor`:

```text
byteLength, kind, resourceId, schemaVersion, sha256, sourceId, version
```

`serializeMarketplacePackageArtifactDescriptor` parses before serialization,
adds the domain separator and uses the Shared schema field order. SHA-256 must
be lower-case hexadecimal, the byte length must be positive and no greater
than 512 MiB, and unknown fields fail closed.
`marketplacePackageArtifactDescriptorFromCatalogEntry` is the only supported
projection from a verified Catalog entry to this signing payload.

The signature binds the package bytes through both exact length and SHA-256,
and also binds those bytes to the source, resource kind, resource ID and
version. A signature over an unscoped digest is not accepted.

## Capability boundary

```text
VerifiedMarketplacePackageArtifactAdapter
        depends on
MarketplacePackageArtifactInspectionPort + MarketplaceCatalogTrustReaderPort
        with concrete filesystem work owned by
NodeMarketplacePackageArtifactInspectionAdapter
```

The verifier contains policy and receives interfaces rather than filesystem or
crypto implementations. The Node inspection Adapter opens a Main-owned
absolute path, rejects symbolic links and non-regular files, enforces the byte
ceiling before and during streaming, hashes through the open handle, and
compares the handle and pathname identity before and after the read. Mutation,
deletion or replacement during inspection fails closed.

The Trust Reader first binds source ID and key ID to the configured public key,
then verifies the canonical descriptor with Ed25519. Only after both the signed
declaration and streamed bytes agree does the narrow Verification Port return
immutable evidence.

Renderer and Worker receive no Verification Port, Inspection Port, absolute
path, trust registry, public-key object, database handle or filesystem
capability.

## Current boundary

This tested bottom-layer capability is now composed by the separate bounded
download-staging foundation, but neither capability is wired into the
production Marketplace or installation composition root. Verification evidence
is a point-in-time result. The download staging foundation now preserves the
verified identity through a narrow read-only file-descriptor lease, and the
separate archive foundation uses that lease for inventory and extraction.

A companion developer-only Publisher command creates the scoped package
signature from a stable inspection of real bytes. The download and archive
foundations can stage, verify, inventory and safely extract bounded ZIP bytes.
Additional reviewed foundations now validate/bind the embedded Manifest and
transactionally install/uninstall storage, but none is production-wired or
activates resources, enforces runtime capabilities or updates packages. The
official Catalog publication hold remains in force.
