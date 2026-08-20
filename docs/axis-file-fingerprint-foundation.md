# Pivot Axis external file fingerprint evidence foundation

Status: composed behind a default-off proposal/review/Receipt/approval workflow  
Code baseline: Beta-0.1.49

The external file fingerprint layer proves whether a project file still has the state captured after ownership acquisition. It detects content changes without trusting `mtime` and distinguishes files that were deleted, created or replaced. This is evidence for a future Guarded Safe Write coordinator; it is not filesystem mutation authority.

## Module contract

| Layer | File | Responsibility |
|---|---|---|
| Shared contracts | `src/shared/axis-file-fingerprint-contracts.ts` | Existing/missing state, evidence binding, proof, bounded requests and verification results |
| Port interfaces | `src/main/services/axis-file-fingerprint-ports.ts` | Task-scoped capture/verify capability and factory boundary |
| Main adapter | `src/main/services/axis-external-file-fingerprint-adapter.ts` | Authoritative path resolution, streaming SHA-256 capture, file-instance evidence and HMAC proof |

Consumers depend on `AxisTaskFileFingerprintPort`. The composition root may construct the adapter and factory, but a Worker receives only the task-scoped Port. Renderer, IPC and external processes do not receive filesystem access, proof secrets or an Admin capability.

## Evidence model

- Every evidence record is bound to `projectId`, `runId`, `sessionId` and `taskId`.
- Every target is bound to the stable project `fileKey` and normalized project-relative path.
- Existing files carry content SHA-256, byte length and a file-instance SHA-256 derived from filesystem identity.
- Missing targets carry an explicit `missing` state and no invented content digest.
- Evidence has a bounded lifetime and a Main-owned HMAC-SHA-256 proof.
- Unknown fields, malformed digests, mixed state fields, invalid timestamps, duplicate evidence and oversized batches fail strict runtime validation.
- Capture and verification batches are limited to 128 targets.

## Failure behavior

Verification returns `matched` only when every signed record remains current. Rejections distinguish:

- `modified`: the same file instance has different bytes;
- `deleted`: a previously existing file is missing;
- `created`: a previously missing target now exists;
- `replaced`: the path resolves to a different file identity or file instance, even when content is unchanged;
- `stale`: the evidence lifetime has expired.

Cross-task evidence and modified proof fields throw before filesystem verification. A file that changes while its content is being streamed fails closed as an unstable read.

## Current guarded integration

The internal `AxisGuardedSafeWriteHarness` captures evidence after atomic Lease acquisition and before Checkpoint creation. Signed execution authority carries the exact Lease and fingerprint sets. Immediately before transaction start, the harness verifies both current Lease versions and every fingerprint. A rejected fingerprint produces `external-change` and no Worker write or rollback.

Authority expiry is capped by the earliest Lease or fingerprint expiry. The Worker still receives only authority plus a narrow writer; it does not receive the fingerprint factory, Lease factory, Admin Port, database or raw filesystem capability.

Since 0.1.40, the adapter resolves Session root and project ownership through the persistent `AxisProjectBindingReaderPort`, shared with File Identity, Authority and the internal guarded coordinator.

Beta-0.1.42 constructs the adapter and guarded harness only inside a production Main factory guarded by strict `PIVOT_AXIS_REAL_EXECUTION=0|1` resolution. The enabled runtime recovers interrupted transactions before readiness. The default path constructs none of these runtime resources.

## Current limitations

- The adapter and harness are constructed only when the production real-execution feature gate is explicitly enabled.
- A strict model proposal now carries a short-lived Main-issued Receipt binding the full review-time Fingerprint state and exact proposed content to later submission. This is still a default-off explicit approval workflow, not autonomous execution.
- Evidence proof keys are process-owned and intentionally not persisted in this foundation.

## Next integration

Beta-0.1.43 adds the narrow IPC contract and production-adapter E2E for modification, deletion, creation and same-content replacement. Beta-0.1.44–0.1.47 add Run-state projection, registered-handler coverage, approval and model Diff Review. Beta-0.1.48 adds the Main-issued reviewed-proposal Receipt and two stale-baseline checks. Beta-0.1.49 proves successful completion and projects a read-only completed-Transaction receipt. Do not pass the Fingerprint Port, proof secret or filesystem adapter through IPC.

## Verification

- `tests/shared/axis-file-fingerprint-contracts.test.ts`
- `tests/shared/axis-file-fingerprint-boundaries.test.ts`
- `tests/main/axis-external-file-fingerprint-adapter.test.ts`
- `tests/main/axis-reviewed-proposal-receipt.test.ts`
- `tests/main/axis-guarded-safe-write.test.ts`
- `tests/main/axis-guarded-ipc-system.test.ts`

These tests cover strict contracts, capability narrowing, content changes with preserved size/mtime, deletion, creation, same-content replacement, stale evidence, ownership forgery, proof tampering, path escapes, directories, unknown session roots and the real pre-mutation failure path.
