# Axis production Dynamic Pivot runtime

Status: default-off internal Main failure-observation composition  
Baseline: `Beta-1.0.0` / `1.0.0-beta`

## Scope

This runtime constructs the reviewed Dynamic Pivot coordinator, dispatcher,
seven concrete action handlers and their durable evidence registries inside
the production Main composition root. Beta-0.1.61 additionally observes an
authoritative failed Dry-run task, records its Worker attempt and immutable
failure evidence, dispatches the resulting decision, and records continuation
results as durable `pending-guarded-review` handoffs.

Beta-0.1.62 adds a separate Main-owned consumer that can accept an explicit
reviewed Guarded submission for a committed `retry` or child-Run `replan`
handoff. It persists idempotent attempt evidence and fails interrupted
submissions into manual reconciliation instead of replaying them. The
consumer is composed only when both default-off production runtimes are
enabled.

Beta-0.1.63 adds a durable Main-owned proposal/orchestration layer and calls
it from the registered Dry-run failure path only for a committed `retry`.
It derives the scheduled Task and revision from dispatch evidence, uses the
existing proposal and consumer Ports, and never replays interrupted work.
`replan`, self-repair and dedicated-Fixer remain unscheduled because their
current evidence does not identify an authoritative next Guarded Task.

Beta-0.1.64 adds a separate production-composed replan scheduling runtime.
Given only a committed replan decision ID, it reads the exact child plan and
Run state through narrow Ports, derives the first dependency-ready pending
`fs.safeWrite` Task and persists immutable schedule evidence keyed by the
child state revision. This supports multi-Task child DAGs without allowing a
caller to select a Task. It is not called by the registered Dry-run path:
that path currently produces only authentic `minor` failure evidence and
therefore cannot honestly trigger `replan`.

Beta-0.1.65 adds strict post-retry `direction` evidence and a separate
per-schedule reviewed-task orchestration. A real failed Guarded retry can now
create a child Run, schedule its first dependency-ready `fs.safeWrite` Task,
obtain an exact reviewed proposal and submit it through the existing Guarded
consumer. Interrupted proposal/submission work becomes `recovery-required`
and is not replayed.

Beta-0.1.66 adds a bounded serial child-Run Driver. It schedules again only
after the previous Guarded result has authoritatively completed its Task, and
persists one immutable completion/failure projection per replan decision for
restart queries.

Beta-0.1.67 adds action-specific executable scheduling for self-repair and
dedicated-Fixer assignments. Main commits a strict lifecycle transition and
version-2 dispatch result before either action may enter the shared reviewed
proposal and Guarded consumer. Legacy assignment-only results remain readable
but fail closed at execution. The registered failure path now proves a real
self-repair Guarded completion; no security failure observer is fabricated to
claim dedicated-Fixer user reachability.

It does not expose a Pivot IPC, Preload API, Renderer surface, continuation
Worker scheduler or external-process interruption path. The observation is
called only from the existing Main-owned `axis:execute-dry-run` handler when
the authoritative latest Run event is `task-failed`. The default Dry-run
simulator normally completes, so this remains a default-off foundation rather
than a delivered autonomous Dynamic Pivot workflow.

## Feature gate

`PIVOT_AXIS_DYNAMIC_PIVOT` is strict:

- unset or `0`: disabled, and the runtime factory returns before constructing
  registries or invoking Provider/model/planner factories;
- `1`: enabled;
- any other value: startup configuration error.

The application root owns the feature resolution. Renderer and Worker input
cannot enable the runtime.

## Owned capabilities

The runtime composes:

- `AxisPivotCoordinator`;
- the decision-owned dispatcher from Beta-0.1.59;
- all seven reviewed action handlers;
- durable decision, dispatch-result, Worker-attempt, self-repair,
  dedicated-Fixer, discard, escalation and plan-lineage evidence;
- durable, source-revision-bound failure evidence and continuation handoffs;
- Main Provider-backed Pivot and planning models;
- the existing persistent Project Binding, Shadow Plan and Run-state Ports.

Concrete registries remain private. The public internal surface contains only
readiness, decision/observation operations, evidence lookup, Session cleanup,
narrow Worker-attempt tracking/lifecycle capabilities and idempotent close.
The Main IPC composition accepts only an optional `AxisTaskExecutor` test
Port; that seam is not part of the shared IPC contract.

## Recovery and fail-closed behavior

At readiness the runtime:

1. recovers interrupted replan and Pivot decisions;
2. lists strictly validated committed decisions;
3. dispatches only decisions without a durable dispatch result;
4. reconstructs observed failure evidence when its source event is still
   present;
5. persists continuation handoffs only for `replan`, `retry`, `self-repair`
   and `dedicated-fixer`.

An existing result is accepted only when its action, decision, execution
revision, Run and Session still match the committed decision. The dispatcher
also rejects a valid same-route result returned for a different committed
action. Duplicate same-revision observations reuse the committed decision,
dispatch and handoff without replaying the model. Stale revisions and
non-`task-failed` events fail closed.

Session hard deletion clears all runtime-owned action evidence before the
shared Shadow Plan and Run-state stores are removed. Shutdown closes every
runtime-owned SQLite connection.

## Deliberately absent

- non-Dry-run production failure triggers;
- a registered authoritative security-failure observer for dedicated-Fixer;
- a cross-action unified history projection and Renderer surface;
- stop-driven external process interruption or Lease cleanup;
- Human Escalation notification, queue or resolution;
- IPC, Preload, Renderer or UI reachability.

These absences are release gaps, not implicit capabilities.
