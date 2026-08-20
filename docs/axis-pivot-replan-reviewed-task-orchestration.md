# Axis Pivot replan reviewed-task orchestration

Status: default-off production Main orchestration  
Baseline: `Beta-0.1.65` / `0.1.65-beta`

## Scope

Beta-0.1.65 closes the registered post-retry replan path without allowing a
caller to choose a child Task or fabricate review evidence. A failed Guarded
retry now becomes strict version-2 `direction` failure evidence only when the
same authoritative Task has a committed retry decision, at least two attempts
and consumed retry budget. The resulting committed replan creates a child Run,
persists the next dependency-ready `fs.safeWrite` Task schedule and invokes a
separate per-schedule reviewed proposal/Guarded orchestration.

## Boundaries

- Shared request and orchestration contracts are strict and infrastructure-free.
- The scheduler exposes a frozen schedule reader Port; it does not expose its
  Registry or database.
- The orchestrator receives only authorization, schedule-reader, proposal,
  continuation-consumer and attempt Ports.
- Concrete SQLite registries are constructed only in the Main composition root.
- Renderer and Worker receive no database, filesystem, Permission, Lease,
  Fingerprint, Execution Authority or Admin capability.

## Durability and recovery

Each orchestration is uniquely bound to one persisted `scheduleId`. It commits
`preparing`, then `submitting` with the exact proposal result, and finally the
strict Guarded continuation attempt. An interrupted `preparing` or `submitting`
record becomes `recovery-required` at startup and is never replayed
automatically. Session hard deletion and runtime shutdown respect dependency
order and are idempotent.

## Verified production path

The Main IPC system test exercises a real registered chain:

1. authoritative Dry-run Task failure;
2. committed retry and reviewed proposal;
3. permission approval, physical write, failed compile Gate and rollback;
4. version-2 direction evidence and committed replan;
5. child Run planning and immutable Task schedule;
6. child proposal, Guarded write, compile/test Gate success and durable child
   Run completion.

The parent Run remains failed with both Pivot decisions, preserving the reason
for the child lineage instead of rewriting history.

## Deliberately absent

- automatic continuation through every Task of a multi-Task child DAG;
- self-repair and dedicated-Fixer Task scheduling;
- one restart-queryable unified history projection for the UI;
- a user-facing autonomous Pivot control surface;
- release-channel and packaged upgrade/rollback qualification.

This is a production-wired default-off path, not a claim that the broader
autonomous Pivot product is complete.
