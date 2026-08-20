# ADR 0001: Pin the official Marketplace Catalog trust root in Main

- Status: Accepted
- Date: 2026-08-17

## Context

The initial production Catalog composition accepted a complete source and
public key through an environment JSON value. That supported foundation tests,
but it did not define an official identity: any process able to set the value
could replace the Catalog URL, Key ID and verification key together.

The official Ed25519 keyset now exists outside Git. Only its public identity is
appropriate for application source and public distribution.

## Decision

Pivot pins the official Catalog URL, source ID, Key ID and Ed25519 SPKI public
key in a Main-only module. Module initialization recomputes the SHA-256
fingerprint and fails closed if it differs from the reviewed value.

`PIVOT_MARKETPLACE_CATALOG_ENABLED` is only a default-off `0`/`1` engineering
gate. It cannot provide or replace trust material. Renderer, Preload, Shared and
Worker code receive no trust registry, public-key configuration, transport,
cache or database capability.

Private signing material remains outside every Git worktree and is used only
by the developer publisher composition root.

## Consequences

- Substituting an environment-provided key can no longer redefine the official
  Marketplace identity.
- Catalog key rotation requires a reviewed application release and an explicit
  overlap/revocation policy; changing a remote file alone is insufficient.
- The Catalog remains disabled and unpublished until package verification,
  safe extraction, installation, rollback and recovery are complete.
- Tests may retain signed public qualification evidence, but never private-key
  bytes.
