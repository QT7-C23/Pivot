# Pivot Axis Dynamic Pivot self-repair assignment foundation

Status: reviewed Main-only identity and assignment foundation; not production-composed and not executable  
Code baseline: Beta-0.1.52 (`0.1.52-beta` package SemVer)

## Scope

Beta-0.1.52 establishes the durable identity evidence required before ADR-006 `self-repair` can truthfully mean “the current Worker repairs its own minor omission.”

This slice does not run a Worker, reopen a task, issue permission, acquire a Lease, capture a Fingerprint, create a Checkpoint, mint execution authority, write a file, or mutate Run state.

## Shared contracts

`src/shared/axis-worker-attempt-contracts.ts` defines strict runtime-validated values:

- `AxisWorkerAttemptBinding` binds one positive attempt number and immutable `workerId` to exact Run, Session and task ownership.
- Attempt lifecycle is `running` revision 1 followed by one terminal revision carrying consistent completion/error evidence.
- `AxisSelfRepairAssignment` binds one decided Pivot, execution revision, issue, source attempt and the exact same Worker.
- Begin, finish, lookup and assignment-create inputs reject unknown fields and malformed identifiers.

The self-repair action request contains only `decisionId`, `expectedRevision`, `runId` and `sessionId`. Caller input cannot choose a task, Worker, issue, project root, tool, command, authority or proof material.

## Main capability boundaries

`AxisWorkerAttemptReaderPort`, `AxisWorkerAttemptLifecyclePort` and `AxisSelfRepairAssignmentPort` are separate narrow capabilities.

- Readers can only locate the latest attempt for one owned task.
- Lifecycle callers can only begin or terminally finish an attempt through optimistic revision checks.
- Assignment callers can only create/find immutable decision-bound assignment evidence.
- The concrete SQLite Registry exposes frozen Ports. No Admin Port is passed to the Handler, Worker or Renderer.

## Durable Registry behavior

`AxisWorkerAttemptRegistry` stores attempts and assignments in WAL-mode SQLite:

- unique `(runId, sessionId, taskId, attempt)` prevents duplicate attempt identity;
- exact ownership and revision are rechecked before a running attempt becomes terminal;
- one unique assignment per Pivot decision provides durable idempotency;
- assignment creation re-reads the source attempt and requires it to be failed with matching Run, Session, task, attempt number and Worker;
- close/reopen preserves both failed-attempt and assignment evidence.

## Decision-bound Handler

`AxisPivotSelfRepairActionHandler` depends only on four narrow Ports: decision reader, Run-state reader, attempt reader and assignment Port.

It requires:

1. an unforced, durable `decided` action of `self-repair`;
2. a `minor` trigger whose task matches the decision task;
3. exact Run/Session ownership and post-decision optimistic revision;
4. the latest matching `pivot-decided` event and failed task;
5. objective, budget and committed usage matching the decision snapshot;
6. remaining retry, token, cost, duration and Gate-cycle capacity;
7. the latest durable Worker attempt to be failed and to equal the task attempt count.

The assignment issue comes only from the decided reason. Sequential duplicate delivery, a matching concurrent unique conflict, and database restart return the same assignment. Any mismatched evidence remains an error.

## Explicit non-delivery

- No production composition root constructs the Registry or Handler.
- No IPC, Preload, Renderer service/store or UI reaches this action.
- No scheduler consumes the assignment.
- The assignment does not grant execution or filesystem authority.
- No Run or task state is reopened by this slice.
- Same-Worker guarded execution, dedicated Fixer, discard, stop and escalation remain separate reviewed slices.

## Verification

- `tests/shared/axis-worker-attempt-contracts.test.ts`
- `tests/shared/axis-pivot-self-repair-action-contracts.test.ts`
- `tests/main/axis-worker-attempt-registry.test.ts`
- `tests/main/axis-pivot-self-repair-action-handler.test.ts`
- `tests/main/axis-pivot-self-repair-action-integration.test.ts`
- `tests/shared/axis-pivot-action-boundaries.test.ts`

Beta-0.1.52 verification passes 153 test files / 613 tests, TypeScript strict no-emit, production build, performance budget, Electron native dependency validation and the 3 existing Guarded production-build Electron paths. No installer or portable package was generated.
