# Axis Pivot guarded continuation foundation

Status: default-off internal Main foundation  
Baseline: `Beta-0.1.63` / `0.1.63-beta`

## Scope

This slice adds a Main-owned consumer for durable Dynamic Pivot
`pending-guarded-review` handoffs. The consumer accepts only an explicit
handoff/decision binding plus the existing strict Guarded Safe Write
submission. It never derives writes, a reviewed-proposal Receipt, execution
authority, project root or task body from Pivot evidence.

Beta-0.1.63 adds a separate retry-only Main orchestrator that produces a
reviewed proposal and calls this consumer from the existing registered
Dry-run failure path. This consumer's contract remains independently usable
for explicit `retry` and child-Run `replan` submissions. No new Pivot IPC,
Preload, Renderer surface or scheduling UI was added.

## Contracts and Ports

- `AxisPivotGuardedContinuationRequest` contains only `decisionId`,
  `handoffId` and an existing validated Guarded submission.
- `AxisPivotGuardedContinuationAttempt` is immutable boundary evidence with
  optimistic revision, request digest, proposal/Receipt identity and one of
  `submitting`, `completed`, `failed` or `recovery-required`.
- `AxisPivotContinuationAuthorizationPort` exposes only the committed
  dispatch and its durable continuation handoff.
- `AxisGuardedSafeWriteSubmissionPort` exposes only `submit`; it does not
  expose Guarded infrastructure, Permission/Admin services, Run registries,
  Lease/Fingerprint capabilities, database handles or filesystem access.
- Concrete SQLite and Guarded implementations are constructed only by Main.

## Supported actions

- `retry`: the submitted Run, Session and Task must exactly match the
  decision-owned retry transition.
- `replan`: the submitted Run must be the committed child Run; the existing
  Guarded submission service remains responsible for authoritative Task and
  reviewed-write verification.
- `self-repair` and `dedicated-fixer`: rejected because their current action
  evidence records assignment but does not schedule an authoritative
  Guarded Task.

Terminal discard, escalation and stop actions never produce continuation
handoffs and cannot enter this consumer.

## Persistence and recovery

The WAL SQLite attempt registry owns a unique `(handoffId, requestSha256)`
record. The begin result explicitly distinguishes the creator from a
concurrent reuser, preventing a losing caller from submitting the same
reviewed request again. Completed attempts are reused without replay;
failed attempts fail closed.

An attempt left in `submitting` across restart is changed to
`recovery-required`. Startup does not guess whether Guarded mutation happened
and never automatically resubmits ambiguous work.

## Production composition

The application root constructs the runtime only when both the default-off
Dynamic Pivot runtime and the default-off real Guarded runtime expose their
narrow Ports. Readiness recovery, Session deletion and shutdown are owned by
the same composition root. The runtime has no IPC handler and no Renderer or
Worker capability surface. Its consumer Port is now called by the separate
Beta-0.1.63 retry-only Main orchestrator.

## Verification

- strict shared request/attempt runtime validation;
- structural import and capability-boundary checks;
- durable close/reopen recovery and optimistic transition tests;
- ownership, wrong-task and assignment-only rejection tests;
- duplicate completion reuse without Guarded replay;
- a real `AxisGuardedSafeWriteSubmissionService` stale-revision failure path
  proving no execution call and durable failed evidence;
- default-off runtime construction and startup recovery tests.

The full `Beta-0.1.63` verification baseline is 193 test files and 736 tests,
plus TypeScript strict, production build, performance budget and Electron
native dependency checks.

## Deliberately absent

- automatic reviewed-proposal orchestration for `replan`, self-repair or
  dedicated-Fixer;
- self-repair/Fixer authoritative Task scheduling;
- Pivot IPC, Preload, Renderer or UI reachability;
- automatic replay or resolution of `recovery-required` attempts;
- Guarded completion/failure history projection and attention workflow.
