# Marketplace publisher foundation

Pivot's Marketplace publisher is a developer-only trust-root and Catalog
signing tool. It is deliberately outside Main, Renderer and Worker production
composition.

## Dependency direction

```text
scripts/marketplace-publisher.ts (developer composition root)
        constructs
NodeMarketplacePublisherCryptoAdapter
        injected through
MarketplacePublisherCryptoPort
        consumed by
MarketplacePublisher
        reusing
Shared Marketplace Catalog schemas + canonical serializer
```

`MarketplacePublisher` contains no Node filesystem, process, Electron, Main,
Renderer, Worker or database dependency. The Node crypto implementation is a
separate Adapter. Only the CLI composition root owns filesystem paths.

## Key generation

Run from the Pivot project with a new output directory outside every Git
worktree:

```powershell
npm.cmd run marketplace:keygen -- --out-dir "%USERPROFILE%\Documents\Pivot Secrets\official-2026-01" --key-id pivot-marketplace-2026-01
```

The command creates the directory exclusively and refuses to overwrite it:

```text
marketplace-private.pem       Ed25519 PKCS#8 private key; never share or commit
marketplace-public.pem        Ed25519 SPKI public key; safe to distribute
marketplace-keyset.json       public key ID, fingerprint and public key only
```

The CLI resolves filesystem aliases before enforcing the Git-worktree boundary,
uses exclusive file creation and prints only public metadata. A partial write is
removed only from the exact newly created keyset directory.

## Catalog signing

Prepare a strict draft containing only `entries`, `revision`, `schemaVersion`
and `source`. The publisher supplies `generatedAt`, a bounded expiry and the
outer Catalog signature:

```powershell
npm.cmd run marketplace:sign-catalog -- --draft "catalog-draft.json" --keyset-dir "%USERPROFILE%\Documents\Pivot Secrets\official-2026-01" --out ".tmp\catalog-signed.json" --lifetime-hours 24
```

The output path must not already exist. The tool validates the keyset manifest,
derives the public key from the private key, checks its SHA-256 fingerprint,
strictly parses the draft, signs the exact Shared canonical UTF-8 payload and
self-verifies before writing.

Catalog lifetime defaults to 144 hours and cannot exceed the Shared seven-day
contract. Unknown fields and command flags fail closed.

## Package signing

Prepare a strict package identity file containing only `kind`, `resourceId`,
`schemaVersion`, `sourceId` and `version`, then sign a real artifact:

```powershell
npm.cmd run marketplace:sign-package -- --artifact ".tmp\react-reviewer.pivot" --identity ".tmp\package-identity.json" --keyset-dir "%USERPROFILE%\Documents\Pivot Secrets\official-2026-01" --out ".tmp\package-signature.json"
```

The CLI reuses the bounded Node package inspection Adapter: it rejects symbolic
links and non-regular files, enforces the 512 MiB ceiling, streams SHA-256 and
fails if the pathname or file identity changes during inspection. The
Publisher strictly parses the resulting descriptor, binds the private key to
the public keyset manifest, signs the domain-separated canonical payload and
self-verifies before the CLI exclusively creates the public signature file.

The output contains only the descriptor and Ed25519 signature. It contains no
private key and is suitable for review before its byte length, SHA-256 and
signature are copied into a Catalog entry.

## Current publication hold

This tool signs Catalog metadata and scoped package artifact descriptors.
Separate Main-only foundations can stage bounded HTTPS bytes, verify the staged
package against that signature, safely inventory/extract bounded ZIP content,
cross-bind the embedded Manifest and transactionally install/uninstall storage.
Those capabilities are not production-wired and do not activate resources,
enforce runtime capabilities, update packages or provide a user installation
flow. The official public Marketplace repository therefore continues to
reject a production `catalog.json` during initialization.

No private key is needed for ordinary Pivot development or tests. Tests create
ephemeral Ed25519 keys in the operating-system temporary directory and delete
them after use.

## Official public trust anchor

The generated `pivot-marketplace-2026-01` public identity is pinned in Main as
of Beta-2.0.3. Only the public SPKI key and its reviewed SHA-256 fingerprint are
present in application source. A fixed offline qualification Catalog signed by
the external private key proves the production Trust Registry accepts the
official identity and rejects payload or Key ID changes.

The private key remains outside every Git worktree. Pinning the public identity
does not lift the publication hold or enable installation.
