# Axis Dynamic Pivot stop foundation

Status: Main-only foundation  
Baseline: `Beta-0.1.58` / `0.1.58-beta`

## Scope

This slice turns a committed Dynamic Pivot `stop` decision into one durable,
optimistic Run-state transition. It supports both model-selected stop decisions
and budget-forced stop decisions.

It does not choose a decision, cancel an external process, release execution
resources, compose other Pivot actions, expose IPC, or add Renderer behavior.

## Contract distinction

The existing `stopped` Run status previously represented only a planning result
that could not create runnable tasks and therefore required `tasks=[]`.

Executed failed or paused Runs already contain task history. A Pivot stop must
not erase that evidence. Beta-0.1.58 therefore adds `pivot-stopped` as a
decision-bound lifecycle event:

- planning-budget stopped Runs remain valid with no tasks and no Pivot event;
- Pivot-stopped Runs may retain task evidence only when `pivot-stopped` is the
  unique latest event;
- completed, failed and already-cancelled tasks are preserved;
- pending or running tasks become cancelled at the stop timestamp;
- no Pivot-stopped Run may contain unfinished tasks.

## Shared action contract

`AxisPivotStopActionRequestSchema` accepts only:

- `decisionId`
- `expectedRevision`
- `runId`
- `sessionId`

`AxisPivotStopActionResultSchema` binds:

- the stop decision and post-decision execution revision;
- the immediately following state revision;
- exact `pivot-stopped` event, task and decision reason;
- forced/non-forced state and optional hard-budget stop reason;
- Run and Session ownership.

The caller cannot choose task, reason, stop reason, forced state, event,
timestamp, authority, project root, command, or execution target.

## Capability boundary

`AxisPivotStopStatePort` exposes only:

- owned state lookup;
- one revision-bound `stopPivot` mutation.

`AxisPivotStopActionHandler` depends only on:

- `AxisPivotDecisionReaderPort`
- `AxisPivotStopStatePort`

The Handler receives no Registry, database, Worker, Renderer, IPC, command,
filesystem, Permission, Checkpoint, Lease, Fingerprint, Transaction, or
Execution Authority capability.

## Fail-closed rules

Before mutation, the Handler requires:

1. a strictly valid decided `stop`;
2. exact Run and Session ownership;
3. exact post-decision revision (`sourceRevision + 1`);
4. exact original failed or paused source status;
5. exact objective and budget snapshot;
6. the latest matching `pivot-decided` event;
7. an existing decision-bound task when `taskId` is non-null;
8. exact committed model cost, duration and token usage;
9. no Pivot usage increment for stop.

The Port result must preserve ownership, objective, budget and usage; advance
one revision; record the exact `pivot-stopped` event; and change only unfinished
task statuses to cancelled.

Repeated delivery, commit acknowledgement loss and database reopen reuse the
same terminal event without another revision.

## Verified behavior

- strict request/result runtime validation;
- pure failed and paused Run stop transitions;
- model-selected and budget-forced decisions;
- planning-budget stopped versus Pivot-stopped invariant separation;
- stale revision, wrong action, cross-Session ownership and stale-event
  rejection;
- malformed Port output rejection;
- sequential repeat and commit-then-error concurrency recovery;
- real SQLite close/reopen idempotency;
- structural exclusion of concrete infrastructure and execution capabilities.

## Deliberately absent

- production composition or automatic action consumption;
- external Worker/process interruption;
- Lease or lifecycle cleanup;
- Human Escalation notification/queue/resolution;
- IPC or Renderer reachability;
- Guarded Safe Write integration.

This is a durable Main-only stop-state foundation, not a delivered end-user
stop workflow.

## Next boundary

Production-compose reviewed Pivot actions behind one Main-owned dispatcher that
routes terminal evidence/state actions separately from guarded continuation
scheduling. The dispatcher must not receive Worker execution or filesystem
authority directly.
