# Pivot Axis Dynamic Pivot Worker discard foundation

Status: reviewed Main-only terminal disposition evidence; not production-composed and not executable  
Code baseline: Beta-0.1.54 (`0.1.54-beta` package SemVer)

## Scope

Beta-0.1.54 establishes immutable evidence that one failed Worker attempt was discarded by an ADR-006 `excessive` Dynamic Pivot decision.

This slice records terminal disposition only. It does not retry or rebuild the task, reopen or stop the Run, invoke a Worker, acquire a Lease, capture a Fingerprint, create a Checkpoint, mint execution authority or mutate a file.

## Shared contracts

`src/shared/axis-worker-discard-contracts.ts` defines strict runtime-validated values:

- `AxisWorkerDiscardCreateInput` binds the decision, execution revision, reason, Run, Session, task, failed source attempt and source Worker.
- `AxisWorkerDiscardReceipt` adds one immutable discard identity, timestamp, schema version and `discarded` status.
- Unknown fields, malformed identifiers, non-positive revisions/attempts and forged authority fields fail validation.

`AxisPivotDiscardActionRequest` remains limited to `decisionId`, `expectedRevision`, `runId` and `sessionId`. Caller input cannot choose the task, reason, Worker, attempt, project root, tool, command, authority or proof material.

## Main capability boundaries

`AxisWorkerDiscardPort` is a narrow frozen capability with only `discard` and `findByDecision`.

- The concrete Registry receives only `AxisWorkerAttemptReaderPort` and revalidates the latest source attempt before persistence.
- The Handler receives only decision-reader, Run-state-reader, Worker-attempt-reader and discard Ports.
- No Worker-attempt Lifecycle/Admin Port, Run-state mutation Port, Registry, database, filesystem, IPC or Renderer capability crosses into the Handler.

## Durable Registry behavior

`AxisWorkerDiscardRegistry` stores receipts in an independent WAL-mode SQLite database:

- `decisionId` is unique, allowing one discard receipt per Pivot decision;
- creation re-reads the latest task attempt through `AxisWorkerAttemptReaderPort`;
- the source attempt must be failed and exactly match Run, Session, task, attempt number, attempt identity and source Worker;
- malformed or mismatched Port output is rejected before persistence;
- close/reopen preserves the immutable receipt.

## Decision-bound Handler

`AxisPivotDiscardActionHandler` requires:

1. an unforced durable `decided` action of `discard`;
2. an `excessive` trigger whose task matches the decision task;
3. exact Run/Session ownership and post-decision optimistic revision;
4. the latest matching `pivot-decided` event and failed Run/task;
5. objective, budget and committed usage matching the decision snapshot;
6. the latest durable Worker attempt to be failed and equal the task attempt count.

Unlike a continuation action, discard remains valid when token, cost, duration or Gate-cycle capacity is exhausted because it records terminal evidence and starts no further work.

Task, reason, attempt and Worker identity come only from durable evidence. Sequential duplicate delivery, a matching concurrent unique conflict and database restart return the same receipt. The Handler never mutates Run state.

## Explicit non-delivery

- No production composition root constructs the Registry or Handler.
- No IPC, Preload, Renderer service/store or UI reaches this action.
- No scheduler or Worker runtime consumes the receipt.
- The receipt grants no permission, execution or filesystem authority.
- No Run/task state or budget is changed.
- Stop and human escalation remain separate action boundaries.

## Verification

- `tests/shared/axis-worker-discard-contracts.test.ts`
- `tests/main/axis-worker-discard-registry.test.ts`
- `tests/main/axis-pivot-discard-action-handler.test.ts`
- `tests/main/axis-pivot-discard-action-integration.test.ts`
- `tests/shared/axis-pivot-action-boundaries.test.ts`

Beta-0.1.54 verification passes 162 test files / 647 tests, TypeScript strict no-emit, production build, performance budget, Electron native dependency validation and the 3 existing Guarded production-build Electron paths. No installer or portable package was generated.
