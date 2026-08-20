# Axis Pivot assignment Task scheduling

Status: implemented default-off Main foundation  
Baseline: `Beta-0.1.67` / `0.1.67-beta`

## Contract

Self-repair and dedicated-Fixer assignment evidence is not execution
authority. A continuation may enter reviewed proposal and Guarded Safe Write
only after Main commits an action-specific Run lifecycle transition:

- `pivot-self-repair-scheduled` reopens the exact failed Task for the same
  Worker assignment and consumes one retry-budget unit;
- `pivot-dedicated-fixer-scheduled` reopens the exact failed Task for the
  separately resolved security-Fixer assignment without relabeling it as a
  retry.

Both transitions require the committed decision-bound failed Run, latest
`pivot-decided` event, exact Task owner, unexhausted budgets and optimistic
Run revision. They clear only the selected Task error, preserve sibling state
and emit version-2 action evidence with the assignment, schedule event,
execution revision and resulting state revision.

Version-1 assignment-only results remain readable for persistence
compatibility but are rejected by reviewed and Guarded continuation paths.

## Capability boundary

Handlers depend on `AxisPivotAssignmentStatePort`, which exposes only
owner-bound `find` and `scheduleAssignment`. The application Run-state
Registry implements the Port; neither handler imports that Registry or gains
database, filesystem, Permission, Lease, Fingerprint, Authority, Worker Admin
or Renderer capability.

The existing reviewed orchestrator and Guarded consumer accept `self-repair`
and `dedicated-fixer` only when the committed dispatch contains strict
version-2 schedule evidence. Proposal ownership must advance exactly one
revision from the scheduled state and target the scheduled Task.

## Verified behavior

- same-Worker self-repair and different-identity security Fixer schedule only
  their decision-owned failed Task;
- replay and SQLite reopen reuse the assignment and schedule without another
  state revision;
- stale owner/revision, malformed Port output, missing assignment, exhausted
  budget and legacy assignment-only evidence fail closed;
- a registered Main system path performs real self-repair failure observation,
  assignment, schedule, proposal, permission, Guarded gates, physical write
  and authoritative Task completion;
- structural tests keep shared contracts infrastructure-free and handlers on
  narrow Ports.

Dedicated-Fixer scheduling and Guarded consumption are implemented at the
Main contract boundary, but the current registered Dry-run observation emits
authentic `minor` evidence rather than a forged `security` trigger. Therefore
this slice does not claim a user-reachable autonomous security-Fixer feature.

No Pivot IPC, Preload or Renderer capability was added.
