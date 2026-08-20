# Pivot Axis production guarded runtime foundation

Status: production Main composition plus Receipt-bound proposal review, explicit approval and successful completion evidence available behind a default-off feature gate  
Code baseline: Beta-0.1.54 (`0.1.54-beta` package SemVer)

Beta-0.1.44 binds the Beta-0.1.43 submission primitive to optimistic durable Run state and a typed Renderer service/store action. Beta-0.1.45 verifies that chain at the registered Main IPC-handler boundary. Beta-0.1.46 adds a manual full-content approval surface plus a real production-build Electron rollback E2E. Beta-0.1.47 adds a strict model proposal and read-only Diff Review. Beta-0.1.48 adds a Main-issued reviewed-proposal Receipt and two stale-baseline checks. Beta-0.1.49 proves the successful production path and projects a completed-Transaction receipt into the Work surface. Beta-0.1.50 through Beta-0.1.54 add separate Main-only Dynamic Pivot `replan`, task-scoped `retry`, same-Worker self-repair assignment, different-Worker security Fixer assignment and terminal failed-attempt discard evidence foundations; none changes this guarded runtime's production composition. Main still resolves authoritative project/task state; Renderer input cannot choose root, task body, tools, Worker/Fixer identity, authority, proof material or infrastructure. This remains a default-off bottom-layer workflow, not a complete autonomous end-user feature.

## Feature contract

- `PIVOT_AXIS_REAL_EXECUTION` accepts only unset, `0` or `1`.
- Unset and `0` mean disabled and return before guarded runtime resources are constructed.
- Any other value fails startup configuration validation.
- Explicit `1` permits Main to construct the internal runtime and accept narrow guarded submissions through `axis:execute-guarded-safe-write`.

## Main composition

`createAxisProductionGuardedRuntime` receives only explicit Ports and Main-owned infrastructure dependencies. It owns:

1. `SqliteAxisBlackboardStore`;
2. `AxisExecutionTransactionJournal`;
3. `AxisGateEvidenceRegistry`;
4. `AxisExternalFileFingerprintAdapter`;
5. `AxisExecutionAuthorityService`;
6. `AxisCheckpointReceiptIssuer`;
7. `AxisPhysicalRollbackExecutor`;
8. `AxisGateRunner` with fixed compile/test commands;
9. `AxisBlackboardSafeWriteEvidenceRecorder`;
10. `AxisSafeWriteWorker`;
11. `AxisGuardedSafeWriteHarness`;
12. `AxisExecutionRecoveryCoordinator`.

`createAxisGuardedIpcRuntime` additionally owns the shared `AxisExternalFileFingerprintAdapter` and `AxisReviewedProposalReceiptService` used by proposal issuance, submission verification and the production harness. Proposal and submission consumers receive only frozen issuer/verifier Ports.

The existing Main-owned `PermissionManager` is shared through `AxisPermissionManagerPort`. The Worker receives signed authority, audit and the narrow file writer only. Renderer and Worker receive no Admin Port, database handle, proof secret, transaction journal or raw adapter.

`createAxisGuardedIpcRuntime` is the dedicated Main composition module for the guarded feature. It constructs concrete adapters and exposes only a frozen runtime surface for read-only feature state, submission, readiness, close and Session deletion. `registerIpcHandlers` depends on that narrow surface instead of constructing guarded services itself.

The composition module accepts an optional Main-only `AxisGuardedIpcInfrastructure` seam for the Gate runner, permission timeout and Run lifecycle. Each injected object is a narrow Port, is never part of the shared IPC contract, and is used only by system tests. Production defaults remain the concrete Main-owned adapters.

On Windows, the production Gate runner is wrapped by `AxisWindowsNpmGateCommandAdapter`. It adapts only fixed `npm.cmd` Gate invocations through `cmd.exe`, rejects unsafe shell tokens and restores the logical command/arguments in Gate evidence. The general Agent command runner is not widened to shell execution.

The composition root opens a frozen `AxisGuardedSafeWriteExecutionPort` from the runtime, a read-only `AxisGuardedTaskReaderPort` from the Shadow Run Registry and an `AxisGuardedRunStatePort` from the Lease-aware state decorator. `AxisGuardedSafeWriteSubmissionService` receives only those Ports, `AxisProjectBindingReaderPort` and `AxisReviewedProposalReceiptVerifierPort`; it cannot access either concrete registry, Admin capability or filesystem adapter.

## Submission contract

- Accepted fields are exactly positive `expectedRevision`, strict `reviewedProposalReceipt`, `runId`, `sessionId`, `taskId` and `writes`.
- A submission contains 1–16 unique file paths and at most 4 MiB aggregate content characters.
- `projectRoot`, task objects, granted tools, authority envelopes, proof material and debug fields are rejected at shared IPC validation.
- Main loads the planned task by exact run/session/task ownership and requires exactly `fs.safeWrite`.
- Submitted write paths must exactly match the authoritative task `assignedFiles`.
- Main derives the project root from the persistent Session Project Binding before calling the execution Port.
- Main verifies the Receipt signature, time window, ownership, revision, exact content and current full Fingerprint baseline before Task claim.
- Main atomically claims the pending task only at the approved revision, rejects unfinished dependencies or another running task, then projects completion/block/rollback into durable task and Run state.

## Evidence and completion ordering

The guarded chain after pre-claim Receipt verification is:

`Permission → Lease acquire → Fingerprint capture → Receipt baseline compare → Checkpoint → signed Authority → Lease/Fingerprint verify → Transaction → Worker writes → Gate → Blackboard precommit evidence → Transaction complete → Main completion receipt`

Blackboard evidence is deliberately named `axis.safe-write.precommit`. If its strict validation or persistence fails, the transaction is still non-terminal and the existing physical rollback path runs. This avoids recording a false completion claim if the later transaction-completion journal write fails.

The strict completion receipt is derived only from the completed Transaction returned by `markCompleted`. It binds exact Checkpoints, Gate evidence identifiers and written file digests. Failed outcomes require `completionEvidence: null`. The Renderer receives only this read-only value and shows its Transaction revision/counts; it receives no Transaction reader or database access.

## Recovery and cleanup

- `ready` runs `AxisExecutionRecoveryCoordinator.recoverPending()` before the application runtime becomes ready.
- Recoverable `worker-started`, `rollback-pending`, `rolling-back` and `rollback-incomplete` transactions use durable Checkpoint receipts.
- Session hard deletion clears transaction, Gate evidence and Blackboard rows owned by that Session.
- Runtime close is idempotent and closes only resources owned by the guarded runtime factory.
- The enclosing IPC runtime close is also idempotent and closes every SQLite store it constructs after lifecycle shutdown and guarded-runtime close.
- Windows short-path and canonical-path spellings are normalized through the root-bound resolver before rollback mutation while outcome evidence preserves the exact receipt path.
- Terminal Guarded state is committed before Lease cleanup; cleanup failure propagates while the durable failed/completed state remains queryable.

## Explicit non-delivery

- The runtime remains disabled unless the process starts with `PIVOT_AXIS_REAL_EXECUTION=1`.
- Gate commands are fixed by Main; trusted per-project Gate profile discovery is not implemented.
- Blackboard precommit evidence has no user-facing history browser. The completion card is an immediate response projection and is not reconstructed after restart.
- Dynamic Pivot `replan`, task-scoped `retry`, same-Worker self-repair assignment, different-Worker security Fixer assignment and terminal Worker-discard evidence have reviewed Main-only handlers but are not production-composed, connected to guarded execution or user-reachable. Assignments and discard receipt remain evidence only; stop and human escalation handlers are absent.
- No packaged release-process Renderer-to-Main approval-flow E2E exists yet; Beta-0.1.46 covers the unpackaged production build.

## Verification

- `tests/main/axis-production-guarded-runtime.test.ts`
- `tests/main/axis-reviewed-proposal-receipt.test.ts`
- `tests/main/axis-guarded-ipc-system.test.ts`
- `tests/main/axis-guarded-safe-write-submission.test.ts`
- `tests/main/axis-run-state-registry.test.ts`
- `tests/main/axis-lease-aware-run-state.test.ts`
- `tests/renderer/axis-shadow-store.test.ts`
- `tests/renderer/axis-guarded-write-approval.test.ts`
- `tests/shared/axis-guarded-safe-write-submission-contracts.test.ts`
- `tests/shared/axis-production-guarded-runtime-boundaries.test.ts`
- `tests/main/axis-guarded-safe-write.test.ts`
- `tests/main/axis-physical-rollback.test.ts`
- `tests/main/axis-blackboard-store.test.ts`
- `tests/main/axis-windows-npm-gate-adapter.test.ts`
- `tests/e2e/pivot-core-flows.spec.ts`

Beta-0.1.54 verification: 162 test files / 647 tests, TypeScript, production build, performance budget and Electron native dependency check all pass. Real tests cover modified, deleted, created, same-content replaced, post-review stale targets, durable successful completion, decision-bound replan lineage, retry idempotency, same-Worker self-repair assignment, different-Worker security Fixer assignment and terminal failed-attempt discard evidence across conflict and database reopen. Registered-handler tests reopen the completed journal and match its identity/revision/time with the projected receipt. Electron covers Receipt-bound successful completion evidence, physical Gate rollback and stale-review rejection before permission/Task claim. No installer or portable package was generated.
