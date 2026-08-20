# Pivot Axis persistent project binding foundation

Status: wired into production Main identity/lifecycle and default-off guarded proposal/review/approval workflow  
Code baseline: Beta-0.1.49

The project binding layer gives every canonical project root one stable Axis `projectId` and binds Sessions to that identity. It replaces temporary per-service root callbacks in File Identity, Fingerprint, Execution Authority and the internal Guarded Safe Write harness. It does not authorize a file mutation.

## Module contract

| Layer | File | Responsibility |
|---|---|---|
| Shared contracts | `src/shared/axis-project-binding-contracts.ts` | Strict project binding, bind request, Lease cleanup request and cleanup receipt |
| Port interfaces | `src/main/services/axis-project-binding-ports.ts` | Narrow Reader, composition-root factory and Admin mutation boundary |
| SQLite adapter | `src/main/services/sqlite-axis-project-binding-store.ts` | Canonical root identity, immutable Session binding, restart recovery and Reader narrowing |
| Lease lifecycle coordinator | `src/main/services/axis-run-lease-lifecycle.ts` | Run/session terminal cleanup through the narrow Lease Admin method set |
| Main lifecycle coordinator | `src/main/services/axis-main-lifecycle.ts` | Startup/session bind, close/delete ordering and shutdown cleanup through Ports |
| Run-state decorator | `src/main/services/axis-lease-aware-run-state.ts` | Durable terminal transition first, Run Lease cleanup second |

## Invariants

- Bind requests accept no caller-selected `projectId`.
- Project roots must be absolute, exist and be directories.
- Equivalent normalized roots map to one persisted project record.
- Multiple Sessions for one canonical root receive the same `projectId`.
- A Session binding is immutable while it exists; a failed rebind preserves the original record.
- The Reader Port exposes only `findBySession`.
- File Identity rejects a task binding whose `projectId` differs from the persisted Session binding.
- Fingerprint and Authority use the same Reader Port and fail closed on missing or mismatched ownership.
- Guarded Safe Write derives `projectId` from the persisted binding rather than request or Worker input.
- Worker and Renderer receive neither binding Writer/Admin capabilities nor SQLite handles.

## Lease lifecycle cleanup

The lifecycle contract distinguishes:

- Run cleanup for `completed`, `cancelled`, `aborted` or `failed`;
- Session cleanup for `session-closed`, `session-deleted` or `shutdown`.

`AxisRunLeaseLifecycleCoordinator` receives only `releaseForRun` and `releaseForSession`. Cleanup is idempotent: a repeated terminal cleanup returns a zero release count. Adapter failure propagates and cannot produce a false cleanup receipt.

## Current limitations

- The Guarded Safe Write harness is constructed only when the strict production feature gate is explicitly `1`; the default path constructs no guarded runtime.
- Guarded Safe Write has a strict default-off Receipt-bound proposal/review/approval flow, but no automatic Run flow or successful completion evidence UI.
- Binding records use their own bottom-layer tables; the public Session record does not expose `projectId`.
- Cleanup interruption preserves the committed Run state and surfaces the error; remaining active Leases rely on TTL fallback before a later store operation expires them.

## Production lifecycle wiring

0.1.41 constructs the Binding Store, File Identity Adapter, Lease Store and lifecycle services in `registerIpcHandlers` using the same production database path.

- startup binds and verifies every live Session before the runtime is declared ready;
- create/open/fork bind the returned Session before IPC success;
- soft delete performs Session cleanup but preserves the binding for undo;
- hard delete performs cleanup, commits deletion, then unbinds;
- cancel and every Dry-run terminal transition commit durable Run state before cleanup;
- shutdown cleans live Sessions and closes the new SQLite adapters;
- initialization and cleanup failures propagate; no success response or cleanup receipt is invented.

## Verification

- `tests/shared/axis-project-binding-contracts.test.ts`
- `tests/shared/axis-project-binding-boundaries.test.ts`
- `tests/main/axis-project-binding-store.test.ts`
- `tests/main/axis-run-lease-lifecycle.test.ts`
- `tests/main/axis-main-lifecycle.test.ts`
- `tests/main/axis-lease-aware-run-state.test.ts`
- `tests/shared/axis-production-lifecycle-boundaries.test.ts`
- updated File Identity, Lease, Fingerprint, Authority and Guarded Safe Write regressions

These tests cover strict runtime validation, canonical identity sharing, immutable rebind, restart recovery, invalid roots, project ownership mismatch, run/session isolation, ordered lifecycle commits, idempotent cleanup, real closed-database cleanup failure and TTL fallback.

## Next integration

Beta-0.1.45–0.1.47 keep the Project Binding Reader private while system/Electron paths derive the authoritative root and proposal snapshots from it. Beta-0.1.48 binds the Receipt to its Main-resolved `projectId` and verifies it against the same Reader before claim and execution. Beta-0.1.49 proves successful completion without adding caller-selected `projectId` or exposing Binding Admin through IPC.
