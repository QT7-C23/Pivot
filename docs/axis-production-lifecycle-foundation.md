# Pivot Axis production identity and cleanup lifecycle

Status: production identity/lifecycle plus default-off Receipt-bound guarded proposal/review/approval workflow wired  
Code baseline: Beta-0.1.49

0.1.41 connects the persistent Project Binding and Lease cleanup foundations to production Main. Beta-0.1.42–0.1.47 add the default-off guarded runtime, narrow IPC, Run-state projection, system/Electron coverage and strict proposal review. Beta-0.1.48 binds that review to later execution with a Main-issued Receipt and rejects stale baselines twice. Beta-0.1.49 proves durable success and terminal cleanup while projecting only a read-only completion receipt. Worker and Renderer still receive no raw filesystem, database or Admin capabilities.

## Composition

`registerIpcHandlers` is the sole composition root for the new concrete adapters:

1. `SqliteAxisProjectBindingStore`;
2. a frozen `AxisProjectBindingReaderPort`;
3. `AxisMainProjectFileIdentityAdapter`;
4. `SqliteAxisFileLeaseStore`;
5. `AxisRunLeaseLifecycleCoordinator`;
6. `AxisMainLifecycleCoordinator`;
7. `AxisLeaseAwareRunStateStore`.

All SQLite adapters receive the same production database path. Consumers outside the composition root depend on Ports.

## Session lifecycle

- Startup binds and verifies every live Session before `IpcRuntimeResources.ready` resolves.
- Session create, open and fork bind the persisted Session before returning IPC success.
- Soft delete releases Session Leases before committing the close and keeps the binding for undo.
- Hard delete releases Session Leases, commits the existing deletion cascade, then removes the binding.
- Shutdown releases Leases for live Sessions before closing the Binding and Lease adapters.
- Binding or cleanup failures propagate and prevent a false success response.

## Run terminal lifecycle

`AxisLeaseAwareRunStateStore` decorates the narrow `AxisDryRunStateStore` Port plus cancel:

- the wrapped Registry first commits the optimistic durable state transition;
- only `completed`, `cancelled` or `failed` results trigger Run cleanup;
- non-terminal transitions do not release Leases;
- cleanup failure is propagated after the terminal state is durable;
- remaining Leases are recoverable through their bounded TTL and expire on the next Store decision.

Production `axis:cancel-run` and `AxisDryRunCoordinator` both receive the decorator. Direct Registry access remains limited to non-terminal list/restart/create and deletion responsibilities in the composition root.

Beta-0.1.44 also opens a frozen `AxisGuardedRunStatePort`. A positive caller revision claims one authoritative pending task atomically; unfinished dependencies, concurrent running tasks and stale revisions fail before execution. Guarded success completes the selected task and completes the Run only when all tasks are complete. Block, rollback and unexpected execution failure durably fail the task and Run before cleanup.

Beta-0.1.45 tests the production composition through the registered IPC handler. Startup recovery must finish before a guarded submission proceeds; terminal state survives injected cleanup failure; shutdown is idempotent and closes every composition-root-owned SQLite store. Test configuration enters through narrow Main-only Ports and cannot be supplied by Renderer IPC.

Beta-0.1.46 moves guarded concrete construction out of `ipc-handlers.ts` into the dedicated `axis-guarded-ipc-runtime.ts` Main composition module. IPC sees only the narrow guarded runtime surface. Project-relative planner paths are resolved against the authoritative binding root at Main authority boundaries and still pass canonical containment validation.

Beta-0.1.47 resolves proposal source snapshots through the same private Project Binding Reader, records model usage through a separate frozen Run-state Port and leaves task claim/Lease cleanup ordering unchanged.

Beta-0.1.48 adds a narrow Receipt issuer/verifier split. Submission verifies the signed review baseline before claim; the guarded harness compares the same baseline with the post-Lease Fingerprint capture before Checkpoint. Failure leaves Run/Task unclaimed and uses the existing common Lease release path.

## Tests

- `tests/main/axis-main-lifecycle.test.ts`
- `tests/main/axis-lease-aware-run-state.test.ts`
- `tests/main/axis-guarded-ipc-system.test.ts`
- `tests/shared/axis-production-lifecycle-boundaries.test.ts`
- existing Binding, Lease lifecycle, Run-state and Dry-run regression suites

Coverage includes startup/restart rebind, create/open/fork binding, soft/hard deletion order, shutdown interruption, terminal commit-before-cleanup, real closed-database cleanup failure and TTL fallback.

## Beta-0.1.42 guarded runtime addition

- `registerIpcHandlers` resolves the real-execution feature strictly as unset/`0`/`1`.
- Unset or `0` leaves the guarded runtime unconstructed.
- Explicit `1` composes Guarded Safe Write, Blackboard precommit evidence and interrupted-transaction recovery in Main.
- Runtime readiness now waits for both identity/lifecycle initialization and recovery.
- Hard Session deletion clears owned Blackboard, Gate evidence and transaction records.
- Beta-0.1.42 added no safe-write IPC; Beta-0.1.43–0.1.47 added the typed submission, Renderer action, registered-handler proof, approval surface and model Diff Review; Beta-0.1.48 adds Receipt-bound stale-review checks without changing terminal cleanup ownership.

## Explicit non-delivery

- `AxisGuardedSafeWriteHarness` is not constructed on the default production path.
- A trusted default-off Receipt-bound proposal/review/approval workflow exists, but no automatic Run flow or successful completion evidence UI exists.
- Typed Blackboard precommit evidence is wired only inside the guarded path and has no user-facing projection.
- Public Session data does not expose `projectId`.
- There is no background Lease heartbeat; expiry remains decision-driven.

## Next reviewed slice

After review, prove a successful guarded completion path and evidence projection. Keep packaged release-process E2E, trusted Gate profile discovery and Dynamic Pivot repair actions outside that contract until their own reviews.
