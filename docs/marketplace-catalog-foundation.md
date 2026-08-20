# Marketplace Catalog trust and cache foundation

Pivot treats every remote or locally supplied Catalog snapshot as untrusted
input. A Catalog becomes readable only after strict parsing, trusted-source
binding and Ed25519 verification in Main.

## Dependency direction

```text
MarketplaceCatalogReaderPort
        implemented by
VerifiedMarketplaceCatalogAdapter
        depends on
Transport Port + Trust Reader Port + Cache Port + clock
```

- `src/shared/marketplace-contracts.ts` owns immutable data schemas and the
  canonical signing payload serializer. It imports no Main, Renderer, Node
  crypto, network or database implementation.
- `MarketplaceCatalogTrustRegistry` owns public-key objects and exposes only
  source lookup plus signature verification.
- `SqliteMarketplaceCatalogCacheAdapter` owns persistence and exposes separate
  Reader and Writer Ports plus a combined Port for the verified Adapter.
- Renderer and Worker receive none of these infrastructure capabilities.

## Catalog signature protocol v1

1. Construct the strict `MarketplaceCatalogPayload` containing `entries`,
   `expiresAt`, `generatedAt`, `revision`, `schemaVersion` and `source`.
2. Parse it with `MarketplaceCatalogPayloadSchema`. Unknown or malformed fields
   fail before signing.
3. Serialize the parsed value with
   `serializeMarketplaceCatalogPayload`. The output is the exact UTF-8
   `JSON.stringify` representation in schema field order.
4. Sign those UTF-8 bytes with Ed25519.
5. Encode the exact 64-byte signature as standard padded Base64 and attach it
   as the outer `signature` value. The outer signature is not part of the
   signed payload.

Changing entry order, tag order, field content, revision, time or source data
changes the signed bytes. Package entries also carry an exact byte length. A
separate Main-only package artifact verifier can now validate staged bytes
against the scoped package signature, but this Catalog Reader does not invoke
it or claim to install anything.

## Read and fallback policy

1. Resolve the configured source from the Main-only Trust Reader.
2. Read cached evidence to preserve the last accepted revision.
3. Ask the Transport Port for the exact trusted HTTPS Catalog URL.
4. Strictly parse and verify source ID, URL, key ID, Ed25519 signature,
   generation time and expiry.
5. Reject a lower revision or different payload using an existing revision.
6. Persist only the verified snapshot.

Offline fallback is allowed only when the Transport Port fails. The cached
snapshot is re-parsed, re-bound, re-verified and required to remain unexpired.
Malformed, tampered or expired remote content never falls back to cache because
that would hide an active integrity failure.

## HTTPS transport policy

`BoundedHttpsJsonTransportAdapter` is the only concrete network implementation
in this foundation. It:

- accepts HTTPS URLs without credentials or fragments;
- sends a credential-free GET and requires manual redirect handling;
- rejects every redirect and non-200 response;
- accepts only `application/json` or `application/*+json` media types;
- enforces `Content-Length` before reading and repeats the byte limit while
  consuming the response stream;
- keeps one `AbortController` timeout active through connection and body read;
- strictly decodes UTF-8 and rejects malformed JSON.

The default response limit is 2 MiB and cannot be configured above 5 MiB. The
default timeout is 10 seconds and cannot be configured above 60 seconds.

## Current boundary

The concrete HTTP Adapter and a default-off composition factory now exist. Main
pins the official Catalog URL, source ID, Key ID and Ed25519 public key. The
public key fingerprint is recomputed during module initialization and must
match the reviewed SHA-256 identity. `PIVOT_MARKETPLACE_CATALOG_ENABLED` accepts
only `0` or `1`; it can enable the official source but cannot replace any trust
material. The old JSON trust-root injection is no longer accepted.

The application remains honestly unavailable by default and constructs no
Catalog database or Transport while the feature is disabled. The public trust
anchor is production-wired, but no official `catalog.json` is published. The
independent staged-byte verifier, bounded download-staging foundation and safe
ZIP archive foundation are documented in
`docs/marketplace-package-artifact-verification-foundation.md`,
`docs/marketplace-package-download-staging-foundation.md` and
`docs/marketplace-package-archive-extraction-foundation.md`. None is wired to
the production Marketplace or install chain. Manifest cross-binding,
transactional install/uninstall and restart cleanup are now separate reviewed
foundations documented in
`docs/marketplace-package-installation-foundation.md`. Resource activation,
runtime capability enforcement, update policy and production wiring remain
separate reviewed slices.

## Publisher boundary

The developer-only Marketplace publisher is documented in
`docs/marketplace-publisher-foundation.md`. It reuses the exact Shared payload
Schema and serializer, generates an Ed25519 keyset only outside Git worktrees,
and creates new signed output files without overwriting existing evidence.
It is not imported by Main, Renderer or Worker and is not included in the
Electron production bundle.

The publisher can create and self-verify a signed Catalog and domain-separated
package artifact signatures from real inspected bytes. This does not remove the
current production publication hold: the public Marketplace repository rejects
`catalog.json` until the reviewed staging foundation and future safe extraction,
installation, rollback and recovery are production-wired.
