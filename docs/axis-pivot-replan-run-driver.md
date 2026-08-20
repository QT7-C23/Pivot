# Axis Pivot replan child-Run driver

Status: default-off production Main orchestration  
Baseline: `Beta-0.1.66` / `0.1.66-beta`

## Scope

Beta-0.1.66 advances every dependency-ready `fs.safeWrite` Task in a replan
child Run. After each reviewed Guarded completion it asks the authoritative
scheduler for the next Task at the new Run-state revision; it never accepts a
Task, revision, write or authority field from its caller.

The driver is serial, stops immediately on a non-completed Guarded result,
rejects repeated schedules and ownership drift, and has a hard limit of 100
Tasks. A separate WAL Registry stores one immutable terminal result per
decision, including schedule/orchestration IDs, completed Tasks, final child
revision and completion/failure status. Matching results are reusable after
restart; conflicting rewrites fail closed.

## Boundaries

- Shared input/result schemas are strict and infrastructure-free.
- The driver depends only on scheduler, reviewed-task orchestrator and terminal
  result Ports.
- SQLite is constructed only by the Main runtime factory.
- Main owns readiness, Session deletion and shutdown order.
- Renderer and Worker receive no Registry, database, filesystem, Permission,
  Lease, Fingerprint, Authority or Admin capability.

## Real behavior evidence

The registered Main system test now creates a two-Task child DAG whose second
Task depends on the first. It proves two distinct schedule revisions, two model
proposals, two Guarded executions, two physical file updates, completed child
state and a restart-queryable terminal drive result. The initial parent retry
still fails a real Gate and is physically rolled back before direction/replan.

## Deliberately absent

- authoritative Task scheduling for self-repair and dedicated-Fixer actions;
- autonomous Pivot UI and attention/resolution lifecycle;
- packaged upgrade/rollback and signed release qualification.

This remains a default-off production path, not a general autonomous execution
claim.
