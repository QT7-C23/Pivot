# Axis Dynamic Pivot action dispatch foundation

Status: Main-only composition boundary  
Baseline: `Beta-0.1.59` / `0.1.59-beta`

## Scope

This slice gives all seven reviewed Dynamic Pivot action handlers one
decision-owned Main dispatch boundary.

It does not construct the seven handlers with their concrete durable
adapters in the application composition root, automatically consume a
decision, execute a Worker, interrupt an external process, expose IPC, or add
Renderer behavior.

## Shared contract

`AxisPivotDispatchRequestSchema` accepts only:

- `decisionId`
- `expectedRevision`
- `runId`
- `sessionId`

The caller cannot select an action or route. The dispatcher reads the
committed decision through `AxisPivotDecisionReaderPort`.

`AxisPivotDispatchResultSchema` strictly wraps one existing action result and
binds its decision, execution revision, Run and Session to the dispatch
request. It separates:

- `continuation`: `replan`, `retry`, `self-repair`, `dedicated-fixer`;
- `terminal`: `discard`, `escalate`, `stop`.

Terminal evidence can never validate as continuation output, and continuation
evidence can never validate as terminal output.

## Capability boundary

`AxisPivotActionDispatcher` depends only on:

- `AxisPivotDecisionReaderPort`;
- one narrow `AxisPivotActionExecutorPort` per action.

`composeAxisPivotActionDispatcher` returns one frozen
`AxisPivotActionDispatcherPort` containing only `dispatch`.

Neither the dispatcher nor its composition boundary imports a concrete action
Handler, Registry, SQLite, filesystem, Worker, command runner, Checkpoint,
Safe Write or Execution Authority implementation.

## Fail-closed rules

Before invoking an action Port, the dispatcher requires:

1. a strictly valid committed decision;
2. exact decision, Run and Session ownership;
3. exact post-decision execution revision;
4. the action selected by the committed decision.

After the action Port returns, the dispatcher strictly validates the existing
action result contract and then cross-validates its action category,
decision, execution revision, Run and Session. Malformed or cross-owned Port
output is rejected.

The dispatcher is stateless. Idempotency, optimistic concurrency and durable
restart recovery remain owned by each action Handler and its narrow Port.

## Verified behavior

- strict four-field request validation;
- all seven decision-selected routes and exclusion of every non-selected Port;
- terminal/continuation separation;
- missing, malformed, undecided, cross-Session and stale-revision rejection;
- malformed and cross-owned action result rejection;
- frozen composition Port with no executor exposure;
- real SQLite close/reopen stop delivery through the dispatcher reuses the
  existing `pivot-stopped` event;
- structural exclusion of infrastructure, Worker and execution capabilities.

## Deliberately absent

- production application-root construction of all concrete action handlers;
- automatic dispatch after a committed Pivot decision;
- guarded continuation execution or Worker scheduling;
- external process interruption or Lease cleanup for stop;
- Human Escalation notification, queue or resolution;
- IPC, Preload, Renderer or UI reachability.

This is a reviewed Main-only dispatch foundation, not a delivered Dynamic
Pivot workflow.

## Next boundary

Construct the durable action adapters and handlers in one production Main
runtime, then invoke the dispatcher only after a committed decision. Keep that
runtime internal and default-off until lifecycle cleanup and continuation
execution have separate behavior tests.
