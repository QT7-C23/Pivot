# Marketplace package download staging foundation

Pivot treats every Marketplace package URL, response header and response byte
as untrusted input. This foundation downloads a package into an isolated
Main-owned staging directory, verifies the signed declaration against the
trusted Catalog source, and exposes only a narrow verified staged-artifact
capability to a future installer.

## Shared intent contract

`MarketplacePackageDownloadIntent` is a strict Shared contract containing only:

- the domain-separated signed package descriptor;
- the Catalog-provided HTTPS download URL;
- schema version `1`;
- the Ed25519 package signature.

`marketplacePackageDownloadIntentFromCatalogEntry` is the supported projection
from a strictly validated Catalog entry. Callers cannot inject request headers,
cookies, credentials, an output path or a staging directory through this
contract.

## Capability boundary

```text
VerifiedMarketplacePackageDownloadAdapter
        depends on
MarketplacePackageStagingPort
MarketplaceCatalogTrustReaderPort
MarketplacePackageArtifactVerificationPort
        with transport and filesystem work owned by
NodeHttpsMarketplacePackageStagingAdapter
```

The policy Adapter receives only Ports. Before network access it requires the
signed source and key to match the configured trust source, requires the
download origin to equal that source's Catalog origin, and verifies the scoped
package signature. The existing production artifact verifier then independently
checks the staged file's exact length, SHA-256, file identity and signature.

Renderer and Worker receive no Download Port, Staging Port, trust registry,
absolute path, network transport, database handle or filesystem capability.

## Transport and staging rules

The Node Adapter:

- accepts HTTPS only and rejects credentials, query strings and fragments;
- uses manual redirects and rejects redirect responses;
- sends no credentials and accepts only approved binary content types;
- requires HTTP 200 and an exact, valid `Content-Length` matching the signed
  descriptor;
- applies a bounded timeout and caller cancellation;
- streams directly into an exclusively created `0600` `.partial` file while
  enforcing the signed byte ceiling again on actual bytes;
- syncs and closes the file before atomically renaming it to `.staged`;
- removes partial or staged residue on header, stream, timeout, cancellation,
  network or verification failure;
- records file identity and refuses cleanup if the staged pathname has been
  replaced by another file or a symbolic link;
- provides a read-only, identity-checked file-descriptor lease to the narrow
  archive consumer and refuses discard while that lease is active.

The staging directory must be an existing absolute real directory. Its
canonical path is fixed by Main, and symbolic-link directory aliases fail
closed.

## Current boundary

This is a tested bottom-layer capability in `Beta-2.0.7`. A separate safe ZIP
inventory/extraction foundation now consumes its stable read lease. Neither is
connected to Renderer IPC, Marketplace buttons or the installation composition
root. They do not make Marketplace installation a delivered user feature.

Separate reviewed foundations now provide Manifest/package cross-binding,
capability review, transactional install/uninstall and restart cleanup. They
remain outside production composition. Pivot still needs resource activation,
runtime capability enforcement, update policy and end-to-end user-reachable
tests. The official Catalog publication hold remains in force.
