# Axis Dynamic Pivot task retry action foundation

Status: Main-only task-state contract and Port foundation; not production-composed and does not execute a Worker  
Code baseline: Beta-0.1.51 (`0.1.51-beta` package SemVer)

## Scope

This slice connects one durable Dynamic Pivot `retry` decision to one optimistic Run-state transition. It schedules the exact failed task back to `pending`; it does not invoke a Worker, acquire file authority, or connect to production IPC/UI.

## Shared request and receipt

`AxisPivotRetryActionRequest` contains only:

1. `decisionId`;
2. `expectedRevision`;
3. `runId`;
4. `sessionId`.

Task identity, action, budget, project context, execution target and authority cannot be caller-selected.

`AxisPivotRetryActionResult` records the decision-bound `pivot-retry-scheduled` lifecycle event, source execution revision, resulting state revision, task identity and whether this call scheduled or reused the action. Runtime validation requires the event, decision, task and adjacent revisions to match.

## State transition

`scheduleAxisPivotTaskRetry` is a pure shared transition. It requires:

- a failed Run;
- the latest event to be the matching `pivot-decided` event;
- one matching failed task;
- no running sibling task;
- remaining retry, token, cost, duration and Gate-cycle budget.

It preserves all accumulated usage and sibling task state, clears only the failed task error, returns that task to `pending`, increments `retriesForTask` once, changes the Run to `running`, and appends one optimistic lifecycle event.

The transition intentionally rejects a paused Run or completed task. Retrying completed work safely requires DAG-aware downstream invalidation and is not part of this contract.

## Narrow Main Port

`AxisPivotRetryStatePort` exposes only:

- Session-owned Run lookup;
- the exact decision/revision/task-bound retry transition.

`AxisRunStateRegistry.openPivotRetryStatePort()` returns a frozen Port. `AxisPivotRetryActionHandler` also receives the existing read-only decision Port. It receives no Registry type, database handle, filesystem, command, permission, checkpoint, Worker, IPC, Renderer or Admin capability.

## Idempotency

After scheduling, the durable `pivot-retry-scheduled` event is the idempotency receipt.

- A sequential repeated request returns `already-scheduled`.
- If an optimistic update loses a race, the handler re-reads state and returns success only when the same decision/task event is already present.
- Database close/reopen preserves the same receipt and does not consume another revision or retry.
- Any other concurrent state remains an error.

## Verification

- strict request/result and cross-field schema tests;
- pure failed-task success plus wrong-task/decision and exhausted-budget failures;
- wrong action, ownership, stale revision and malformed Port-result tests;
- sequential and concurrent-conflict idempotency;
- real SQLite close/reopen recovery;
- structural dependency-boundary enforcement.

Beta-0.1.51 verification passes 148 test files / 596 tests, TypeScript strict no-emit, production build, performance budget, Electron native dependency validation and 3 existing Guarded production-build Electron paths.

## Explicit non-delivery

- No production composition constructs the handler.
- No IPC, preload, Renderer store or UI calls it.
- No scheduler or Worker consumes the newly pending task.
- No file mutation, Checkpoint, Lease, Fingerprint or execution authority is issued.
- Self-repair, dedicated Fixer, discard, stop and escalation remain separate future action boundaries.
