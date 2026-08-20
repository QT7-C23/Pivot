# Axis Dynamic Pivot replan action foundation

Status: Main-only contract and adapter foundation; not production-composed, not exposed through IPC or Renderer  
Code baseline: Beta-0.1.50 (`0.1.50-beta` package SemVer)

## Scope

This slice connects one durable Dynamic Pivot decision outcome, `replan`, to the existing revision-bound Provider replay boundary. It does not connect self-repair, retry, dedicated Fixer, discard, stop, or escalation, and it does not make Dynamic Pivot user-reachable.

## Shared contract

`AxisPivotReplanActionRequest` is strict and accepts only:

1. `decisionId`;
2. `expectedRevision`;
3. `runId`;
4. `sessionId`.

Project root, project files, commands, Provider configuration, budgets, task bodies, authority and infrastructure are intentionally absent.

`AxisPivotReplanActionResult` binds the decided action and execution revision to one completed lineage. Its runtime schema cross-checks the lineage parent, Session, source revision and child Run before accepting either a newly created or already-completed outcome.

## Narrow Main capabilities

The handler depends only on:

- `AxisPivotDecisionReaderPort`;
- `AxisPivotRunStateReaderPort`;
- `AxisPivotPlanningContextPort`;
- `AxisPivotReplanPort`.

The planning-context adapter separately receives `AxisProjectBindingReaderPort` and `AxisPivotProjectFileListPort`. It resolves the canonical root in Main and returns a sorted, unique, frozen project manifest. No consumer receives a decision Registry, Run Registry, lineage Registry, plan store, database handle, filesystem adapter or Admin Port.

## Fail-closed action rules

Before Provider replay, the handler revalidates:

1. the record is durably `decided`, selects `replan`, and is not a forced stop;
2. decision, request and authoritative Run share the exact Run/Session ownership;
3. the Run remains `failed` or `paused` at exactly the expected post-decision revision;
4. source objective and budget snapshot match the decision evidence;
5. authoritative usage equals the source snapshot plus Pivot Provider usage;
6. the latest lifecycle event is the matching `pivot-decided` event;
7. positive token, cost, duration, retry, Gate-cycle and Pivot limits still have remaining capacity.

The child budget is derived only by subtracting authoritative usage from the original limits. Caller input cannot increase it.

## Idempotency and replay policy

A completed lineage for the exact parent Run, Session and source revision is returned without invoking the Provider or creating a duplicate child.

Any active, failed, stale or interrupted attempt for the same tuple blocks automatic replay. A new Reviewer trigger, Pivot decision and Run revision are required before another Provider call. This keeps repeated UI delivery or process retry from silently spending budget twice after an ambiguous failure.

## Verification

- strict shared malformed and cross-field contract tests;
- paused-parent success and real SQLite integration;
- wrong action, forced/stale/cross-session ownership and exhausted-budget rejection;
- completed-lineage idempotency without a second Provider call;
- failed same-revision attempt rejection without a second child;
- structural tests proving no IPC, Renderer, Worker, database or filesystem dependency enters the action boundary.

Beta-0.1.50 verification passes 144 test files / 584 tests, TypeScript strict no-emit, production build, performance budget, Electron native dependency validation and 3 existing Guarded production-build Electron paths.

## Explicit non-delivery

- No production composition constructs this handler.
- No IPC channel, preload API, Renderer store or UI invokes it.
- No Worker receives planning, database, project-root or filesystem authority.
- A child plan is planning evidence, not automatic execution.
- Remaining Pivot actions and the policy that exposes them to users require separate reviewed slices.
