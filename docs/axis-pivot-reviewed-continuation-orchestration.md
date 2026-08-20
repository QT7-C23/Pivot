# Axis Pivot reviewed continuation orchestration

Status: default-off internal Main retry path  
Baseline: `Beta-0.1.63` / `0.1.63-beta`

## Scope

This slice connects one authoritative Dynamic Pivot `retry` dispatch to the
existing safe-write proposal producer and guarded continuation consumer. The
orchestrator accepts only `decisionId`; it derives Run, Session, Task and
revision ownership from the committed dispatch and continuation handoff.

The production trigger is the existing registered Main Dry-run failure path.
It runs only when both default-off Pivot and real Guarded runtimes are enabled
and only when the committed dispatch action is `retry`.

This is not a general autonomous repair feature. No Pivot IPC, Preload,
Renderer or Worker capability was added.

## Capability boundaries

- `AxisSafeWriteProposalPort` exposes only `propose`.
- `AxisPivotGuardedContinuationConsumerPort` exposes only `consume`.
- `AxisPivotReviewedContinuationAttemptPort` exposes only begin, optimistic
  transitions and decision lookup.
- The orchestrator receives no Registry implementation, database handle,
  Admin service, Permission manager, Lease/Fingerprint Port, signing secret or
  filesystem capability.
- Main remains the only composition root for concrete adapters.

The same Main-owned proposal service backs the existing explicit proposal IPC
and the retry orchestrator. Its model adapter resolves the active Provider at
call time, while all file reads, fingerprint baselines and reviewed Receipt
issuance remain inside the existing proposal service.

## Durable state and recovery

The WAL SQLite registry persists one orchestration per decision:

1. `preparing` is committed before proposal generation.
2. `submitting` and the strictly validated proposal result are committed
   before the guarded consumer is called.
3. `completed` stores the guarded continuation attempt.
4. known proposal or submission failures become `failed`.
5. startup converts interrupted `preparing` or `submitting` work to
   `recovery-required`.

Completed work is returned idempotently. Failed, in-progress and
recovery-required work is never replayed. An interrupted completion commit is
left as `submitting`, so restart requires manual reconciliation instead of
guessing whether filesystem mutation occurred.

## Ownership checks

- authorization must be an exact committed continuation-route `retry`;
- handoff and dispatch must match decision, source Run, Session, execution
  revision and target Run;
- the proposal request is derived from the scheduled retry Task and its
  authoritative state revision;
- the proposal result must match that Run, Session and Task and advance by
  exactly one revision;
- the guarded submission contains only the Main-issued Receipt and exact
  proposed writes.

## Verification

- strict shared request/orchestration validation and structural boundaries;
- creator/reuser, optimistic transition and SQLite restart recovery tests;
- real proposal-service stale-revision failure with no consumer call;
- malformed skipped-revision Port output rejection;
- registered Main system test covering Dry-run failure, retry dispatch,
  proposal generation, Main permission, Guarded completion and physical file
  update;
- full `Beta-0.1.63` baseline: 193 test files and 736 tests, TypeScript strict,
  production build, performance budget and Electron native dependency checks.

## Deliberately absent

- automatic `replan` continuation: a child Run exists, but no authoritative
  next Guarded Task scheduling evidence exists yet;
- self-repair or dedicated-Fixer execution: current evidence assigns a Worker
  but does not schedule an authoritative Task;
- non-Dry-run production failure observation;
- restart reconciliation UI or automatic replay;
- persistent Guarded completion/failure history projection;
- Pivot IPC, Preload, Renderer or user-facing automatic repair workflow.
