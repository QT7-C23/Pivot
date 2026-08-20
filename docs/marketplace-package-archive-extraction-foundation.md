# Marketplace package archive extraction foundation

Pivot treats an integrity-verified Marketplace package as untrusted archive
structure. A valid package signature proves which bytes were published; it
does not make entry paths, file types, compression metadata or extracted
contents safe. This foundation inventories and extracts ZIP packages inside a
private Main-owned directory without granting filesystem capability to
Renderer or Worker.

## Shared archive contract

`src/shared/marketplace-archive-contracts.ts` strictly validates immutable
inventory and extraction evidence. Unknown fields fail closed. The contract
limits an archive to 4,096 entries and 512 MiB of declared extracted bytes,
with paths no longer than 512 characters or 32 segments.

Every path must be NFC-normalized, relative, forward-slash separated and free
of empty, dot or dot-dot segments. Absolute, drive-qualified, UNC, control,
alternate-data-stream, Windows reserved-device, trailing-dot and trailing-
space paths are rejected. Case-insensitive duplicates and file/directory
ancestor collisions are rejected before extraction.

Extraction evidence binds each regular file to its exact relative path, byte
length and lower-case SHA-256. It must agree exactly with the previously
accepted inventory and totals.

## Capability boundary

```text
VerifiedMarketplacePackageArchiveAdapter
        depends on
MarketplaceArchiveInspectionPort + MarketplaceArchiveExtractionPort
        consumes
MarketplaceVerifiedStagedArtifactPort
        implemented by
NodeZipMarketplacePackageArchiveAdapter
```

The policy Adapter imports no Node filesystem or ZIP implementation. The Node
Adapter alone owns ZIP parsing and extraction. Renderer, Preload and Worker
receive no archive Port, staged path, file descriptor, extraction root or
filesystem capability.

## Stable source lease

The staged-artifact Port now provides a narrow read lease over the exact
verified file identity. The lease opens the staged file read-only, compares
device and inode identity, and exposes only a file descriptor plus `release`.
Artifact discard is refused while a lease is active, and same-name pathname
replacement is rejected.

Inspection and extraction each use a fresh stable lease. The extraction
operation inventories the same open descriptor again immediately before
creating output, so forged inventory input and verified-path replacement do
not become extraction authority.

## ZIP and extraction rules

The Node ZIP Adapter:

- reads the central directory lazily from the leased file descriptor;
- enables strict file-name and declared-size validation;
- accepts only stored and deflated, unencrypted regular files/directories;
- rejects symbolic links and unsupported Unix file types;
- enforces entry-count and total-uncompressed-byte limits before extraction;
- creates an exclusive random partial directory beneath an existing canonical
  Main-owned extraction root;
- creates directories segment by segment and rejects symbolic-link or
  non-directory ancestors;
- writes files exclusively with private permissions while hashing and checking
  exact extracted byte counts;
- verifies file-descriptor and pathname identity before accepting each file;
- removes partial output after malformed archives, policy failures, stream
  failures, cancellation or evidence mismatches;
- atomically renames accepted output to a ready directory and returns only a
  narrow identity-bound cleanup capability.

Cleanup refuses a replaced ready path. Cleanup failures are surfaced rather
than hidden behind the original error.

## Current boundary

This is a tested Main-only bottom-layer capability in `Beta-2.0.7`. It is not
connected to Renderer IPC, Marketplace buttons, package installation or
plugin execution, and therefore is not a delivered end-user install feature.

A separate Main-only foundation now strictly binds an embedded package manifest
to the signed Catalog identity and extracted evidence, reviews capabilities,
and supports transactional install/uninstall plus restart cleanup. Those
capabilities remain outside production composition. Pivot still needs resource
activation isolation, runtime capability enforcement, update policy, user-
reachable IPC/UI and packaged end-to-end tests. The official Catalog
publication hold remains in force.
