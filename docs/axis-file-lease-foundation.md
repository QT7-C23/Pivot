# Pivot Axis file ownership lease foundation

Status: default-off Guarded Safe Write proposal/review/Receipt/approval workflow composed  
Code baseline: Beta-0.1.49

The file lease layer prevents two Axis tasks or runs from receiving simultaneous write ownership of the same project file. It is a coordination contract, not filesystem authority: a Lease does not replace Main permission, Checkpoint, signed execution authority or rollback.

## Module contract

| Layer | File | Responsibility |
|---|---|---|
| Shared contracts | `src/shared/axis-file-lease-contracts.ts` | Binding, file identity, single/batch acquire-renew-release requests, TTL, version and lifecycle state |
| Port interfaces | `src/main/services/axis-file-lease-ports.ts` | File identity, task Reader/Writer, atomic acquire/renew/release/verify Coordinator, factory, Admin cleanup and typed conflict |
| Path identity adapter | `src/main/services/axis-project-file-identity.ts` | Authoritative session root, project boundary validation and stable SHA-256 file identity |
| SQLite adapter | `src/main/services/sqlite-axis-file-lease-store.ts` | Cross-task/run exclusion, atomic file-set mutation, partial unique index, expiry, optimistic version and restart recovery |

Consumers depend on Ports. The SQLite store does not resolve paths or access files; the path adapter does not know SQLite.

## Invariants

- A task Port is bound to one project, run, session and task.
- Worker requests contain a file path and TTL only; they cannot choose ownership fields.
- Relative and absolute spellings of one file resolve to one stable key.
- Paths outside the authoritative session project root are rejected.
- Plain HTTP, Renderer IPC or global state are not involved.
- One `(projectId, fileKey)` may have only one active Lease across all tasks and runs.
- Active Lease exclusivity is enforced by both a transaction check and a SQLite partial unique index.
- Acquisition is explicit; the same owner must renew rather than silently reacquire.
- Batch requests are bounded to 128 paths or Lease mutations.
- Equivalent path spellings are resolved, de-duplicated by stable file key and sorted before acquisition.
- Batch acquire, renew and release are all-or-nothing SQLite transactions.
- Batch verification checks ownership, active state and optimistic versions without mutating the Lease set.
- A conflict, stale version or ownership failure leaves the whole requested set unchanged.
- Batch mutation requests reject duplicate Lease IDs.
- Renew/release require the current optimistic version.
- Expired Leases are transitioned before list, acquire, renew or release decisions.
- A task Port can list only its own active Leases.
- Admin list and run cleanup are not present on task Ports.
- Run and Session cleanup are exposed only through the Lease Admin Port and a narrow lifecycle coordinator.

## TTL and lifecycle

- TTL must be between 1 second and 5 minutes.
- Initial version is 1.
- Renew, release and automatic expiry increment the version.
- Status is `active`, `released` or `expired`.
- `releaseForRun` provides a composition-root cleanup seam for cancellation, failure and shutdown.

## Current guarded integration

The internal `AxisGuardedSafeWriteHarness` now:

1. resolves a Main-owned project binding and acquires the complete Lease set;
2. captures fingerprints and then creates Checkpoints;
3. binds Lease IDs/versions, fingerprint evidence and project identity into signed execution authority;
4. verifies current Lease versions and fingerprints before opening the execution transaction;
5. releases every Lease from a common `finally` path after completion, block, cancellation, rollback or failure.

External modification, deletion, creation or replacement after Checkpoint blocks before any transaction or Worker write. This avoids restoring an older Checkpoint over an external change.

0.1.40 adds a persistent project-binding Reader shared by File Identity, Fingerprint, Authority and the internal coordinator. Equivalent canonical roots now recover one stable `projectId` across Sessions and process restarts. The separate lifecycle coordinator can release active Leases for one Run or one Session and emits a strict cleanup receipt only after the adapter succeeds.

0.1.41 constructs the Binding, File Identity, Lease and lifecycle services in production Main. Existing/new/opened/forked Sessions are bound before runtime/IPC success; soft close, hard delete and shutdown run Session cleanup. Cancel and Dry-run terminal transitions use a Port decorator that commits durable Run state before cleanup. Interrupted cleanup is visible and leaves TTL as the recovery fallback.

Beta-0.1.42 adds a production-only Guarded Safe Write runtime factory behind strict `PIVOT_AXIS_REAL_EXECUTION=0|1` resolution. Unset and `0` return before any guarded runtime resource is constructed. When explicitly enabled, the factory composes Lease, Fingerprint, Checkpoint, Authority, Transaction, Rollback, Gate, Blackboard evidence and the narrow Worker, and completes interrupted transaction recovery before runtime readiness.

Beta-0.1.43 adds `axis:execute-guarded-safe-write` with a strict shared submission containing only run/session/task identifiers and bounded writes. Main resolves the authoritative persisted task and Project Binding through narrow Reader Ports. Production-adapter tests prove modified, deleted, created and same-content replaced targets block before Worker, Gate or transaction start and release their Leases.

Beta-0.1.44 requires an explicit optimistic Run-state revision, atomically claims the authoritative task before execution and commits Guarded completion/failure before terminal Lease cleanup. A frozen `AxisGuardedRunStatePort` keeps the submission service away from the Registry and Lease Admin surface. Real tests cover permission denial/timeout, compile-Gate rollback, Lease release and cleanup failure after durable terminal state.

Beta-0.1.45 verifies these guarantees through the registered Main handler. Startup recovery completes before submission, Gate rollback restores the physical file, and injected Lease cleanup failure remains visible after durable failed state. The test seam accepts only `AxisLeaseLifecyclePort`; Renderer requests cannot provide it.

Beta-0.1.46 exercises the same guarantees through a real production-build Electron process. The manual Renderer approval reaches Main-owned permission approval, a deterministic compile-Gate failure restores the physical file and the Lease is released. Renderer still receives no Lease Port or Admin capability.

Beta-0.1.47 adds a strict model-produced full-content proposal and read-only Diff Review before explicit approval. Proposal generation performs no Lease operation and cannot claim execution authority. Lease acquisition remains inside the guarded Main chain only after approval.

Beta-0.1.48 adds a short-lived Main-issued reviewed-proposal Receipt. Submission checks the signed baseline before Task claim. After approval and Lease acquisition, the guarded harness compares the post-Lease Fingerprint capture with the same Receipt baseline before creating Checkpoints; a mismatch releases Leases and runs no Worker.

Beta-0.1.49 proves the successful terminal path. Leases are released after the Transaction journal reaches `completed`, the Main completion receipt is derived, and authoritative Task/Run completion commits. Renderer receives the receipt value only, never the Lease Port or Admin capability.

## Current limitations

- The Guarded Safe Write harness is constructed only when the production feature gate is explicitly enabled; the proposal/review UI remains an explicit user-approved workflow rather than an automatic Run flow.
- Receipt-bound stale-review checks are wired, but the workflow remains default-off, explicit and non-autonomous.
- There is no heartbeat scheduler; expiry is evaluated when the store is used.
- Blackboard records precommit evidence inside the guarded path, but no completion evidence or user-facing evidence surface exists.
- The public Session contract still does not expose `projectId`; production Main resolves it through the private Reader Port.

## Next integration

After separate review, add a successful guarded completion E2E and evidence projection. Worker and Renderer must continue to receive neither Admin capabilities nor filesystem adapters. Packaged release-process E2E, trusted Gate profile discovery and Lease heartbeat remain separate work.

The fingerprint contract and Main adapter are documented in `docs/axis-file-fingerprint-foundation.md`. Internal coordination does not make the production feature complete.
