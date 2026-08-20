# Pivot Axis guarded safe-write submission foundation

Status: default-off model proposal, Main-issued review Receipt, read-only Diff Review, explicit approval and completion receipt path implemented  
Code baseline: Beta-0.1.49 (`0.1.49-beta` package SemVer)

## Contract

`AxisGuardedSafeWriteSubmissionSchema` accepts exactly:

- positive `expectedRevision`;
- strict `reviewedProposalReceipt`;
- `runId`;
- `sessionId`;
- `taskId`;
- 1–16 unique `{ filePath, content }` writes with at most 4 MiB aggregate content characters.

It rejects project roots, task bodies, tool grants, authority envelopes, proof material and unknown fields. The contract lives in `src/shared` and is parsed both at IPC validation and inside the Main submission service.

## Main authority resolution

`AxisGuardedSafeWriteSubmissionService` depends only on:

- `AxisGuardedSafeWriteExecutionPort`;
- `AxisGuardedRunStatePort`;
- `AxisGuardedTaskReaderPort`;
- `AxisProjectBindingReaderPort`;
- `AxisReviewedProposalReceiptVerifierPort`.

Main resolves the task from the persisted Shadow Run by exact run/session/task ownership, requires that it use exactly `fs.safeWrite`, requires that submitted paths exactly equal its assigned files, and derives the project root from the persistent Session Project Binding. It then verifies the Receipt signature, expiry, ownership, revision, exact content digests and current full Fingerprint baseline before atomically claiming the pending task. Unfinished dependencies, another running task, edited content and stale review all fail before execution.

The production runtime exposes a frozen execution-only Port. The Shadow Run Registry exposes a frozen task-reader Port. The Lease-aware state decorator exposes a frozen claim/finish Port that commits terminal state before Lease cleanup. None exposes close/delete, SQLite, Admin, filesystem or proof-secret capabilities.

## Production path

`Renderer store → trusted IPC → strict shared validation → authoritative task/root resolution → Receipt/current-baseline verification → optimistic task claim → frozen execution Port → Permission → Lease/Fingerprint capture → Receipt baseline recheck → Checkpoint/Guarded Safe Write → Gate/precommit → durable Transaction complete → strict completion receipt → authoritative task/run finish → terminal Lease cleanup`

The feature remains disabled unless `PIVOT_AXIS_REAL_EXECUTION=1`. Beta-0.1.46 adds a strict read-only feature-state query and a manual Renderer approval surface for pending tasks that use exactly `fs.safeWrite`. Beta-0.1.47 adds a separate strict proposal request that lets a Main-owned model adapter produce complete replacement content for every authoritative assigned file. Beta-0.1.48 locks that exact content to a short-lived Main Receipt; changing content requires regeneration. Beta-0.1.49 returns a separate Main completion receipt only after the Transaction journal commits. Renderer receives only review/receipt values and must still explicitly acknowledge the existing guarded approval.

Proposal generation does not claim the task or mutate files. Its measured token/cost/time usage is atomically recorded through a narrow Run-state Port; a hard budget violation durably fails the task and Run. The model receives bounded source review data only and cannot invoke tools or choose project roots, commands, authority, proof material or additional file paths.

Planner-assigned paths may be project-relative. Main resolves them against the authoritative Project Binding root at the permission, Checkpoint and execution-authority boundaries, then applies the existing canonical containment check. Traversal outside the bound root remains rejected.

## Real failure evidence

Production-adapter tests perform real filesystem changes after Lease/Fingerprint capture and Checkpoint, before mutation verification:

- modified content;
- deleted target;
- newly created target;
- same-content physical replacement.

All four return `external-change`, run no Worker or Gate, create no transaction, release Leases and preserve the external state. Production runtime tests also cover permission denial, permission timeout and a real compile-Gate failure that restores the Checkpoint and releases the Lease. Run-state tests cover stale approval, unexpected execution failure and durable terminal commit before cleanup failure.

The Main IPC system suite additionally proves:

- an untrusted frame and a forged `projectRoot` fail before Run-state mutation;
- a real permission request/deny roundtrip becomes durable failed state without writing;
- permission timeout creates no Checkpoint or write;
- a Gate failure physically rolls back the real file;
- an interrupted `worker-started` transaction is recovered before the handler proceeds;
- Lease cleanup failure rejects the IPC call after durable failed state is committed.
- a successful real write returns completion evidence that matches the reopened completed Transaction journal and completed Task/Run state.

The real Electron E2E launches the production build with an isolated project and local model endpoint. One path drives a valid proposal through read-only Diff Review, permission, real compile/test Gates and successful file completion, then verifies visible Transaction r3 evidence. A second path triggers a deterministic compile-Gate failure and verifies rollback. A third changes the reviewed file before approval and proves rejection before permission or Task claim while preserving the external content.

## Non-delivery

This slice provides a gated proposal/review/execution primitive, not a complete autonomous product flow. It does not yet provide:

- a packaged release-process Renderer-to-Main E2E;
- persistent/restart-time completion history and Blackboard precommit presentation;
- trusted project Gate profiles;
- Dynamic Pivot action handlers.
