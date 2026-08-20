# Axis Pivot child-Run replan task scheduling foundation

Status: production-composed internal scheduling evidence; no production trigger  
Baseline: `Beta-0.1.64` / `0.1.64-beta`

## Contract

The public internal request contains only `decisionId`. Main revalidates the
committed replan dispatch and handoff, then reads the child plan and child Run
state through narrow Ports. Callers cannot provide a Task, dependency list,
Run revision, budget, project root, write, Receipt, command or Authority.

The immutable result binds the selected Task to the decision, handoff,
lineage attempt, parent/child Run, Session, execution revision and exact child
state revision. The Registry uniquely owns `(decisionId, childStateRevision)`;
after a Task completes and advances the child state revision, the same replan
decision may legitimately schedule the next Task in a multi-Task DAG.

## Fail-closed selection

Scheduling requires:

- an exact committed continuation-route replan dispatch and handoff;
- child plan/Run/Session/objective/budget ownership matching lineage;
- a planned child plan and planned or running child state;
- no currently running child Task;
- plan/state Task identity equality;
- the first pending Task in authoritative plan order whose dependencies are
  completed;
- exactly the `fs.safeWrite` required tool.

Any mismatch is rejected before durable evidence is created. The scheduler
depends only on authorization, plan reader, state reader and schedule Ports.
Concrete SQLite resources exist only in Main composition; Worker and Renderer
receive no Port, database handle or filesystem capability.

## Lifecycle and verified behavior

The Main runtime is constructed only when all required narrow Ports exist.
It participates in readiness, Session hard-delete cleanup and idempotent
shutdown. Tests prove first/second Task derivation across real Run-state
revisions, duplicate reuse, restart persistence, ownership drift, unsafe-tool
rejection, missing-Port no-resource behavior and structural dependency
boundaries.

The Beta-0.1.64 baseline passes 198 test files and 747 tests, TypeScript
strict checking, the formal Electron build, performance budget and Electron
native dependency verification.

## Deliberately absent

- no registered production failure source currently produces authentic
  replan evidence;
- no automatic call from failure observation to this scheduler;
- no reviewed proposal or Guarded Safe Write submission for a scheduled child
  Task;
- no IPC, Preload, Renderer or user-facing surface;
- no self-repair or dedicated-Fixer Task scheduling.

This is a bottom-layer scheduling capability, not a delivered autonomous
repair feature.
