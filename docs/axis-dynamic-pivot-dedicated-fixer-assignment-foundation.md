# Pivot Axis Dynamic Pivot dedicated Fixer assignment foundation

Status: reviewed Main-only security identity and assignment foundation; not production-composed and not executable  
Code baseline: Beta-0.1.53 (`0.1.53-beta` package SemVer)

## Scope

Beta-0.1.53 establishes immutable assignment evidence for ADR-006 security findings that require a dedicated Fixer different from the Worker whose attempt produced the finding.

This slice resolves a code-owned security Fixer identity and records one decision-bound assignment. It does not invoke the Fixer, reopen the Run, schedule work, acquire a Lease, capture a Fingerprint, create a Checkpoint, mint execution authority or mutate a file.

## Shared contracts

`src/shared/axis-dedicated-fixer-contracts.ts` defines strict runtime-validated values:

- `AxisDedicatedFixerIdentity` is schema-versioned and fixed to the `security-fixer` role and `security` specialty.
- `AxisDedicatedFixerAssignment` binds one decision, execution revision, issue, Run, Session, task, failed source attempt, source Worker and resolved Fixer.
- A cross-field invariant requires the Fixer identity to differ from the source Worker.
- Unknown fields, malformed identifiers, wrong specialties and forged authority fields fail validation.

The action request remains limited to `decisionId`, `expectedRevision`, `runId` and `sessionId`. Caller input cannot choose the task, issue, source Worker, Fixer, project root, authority or evidence.

## Main capability boundaries

`AxisDedicatedFixerResolverPort` and `AxisDedicatedFixerAssignmentPort` are separate frozen capabilities.

- The Resolver Port returns a detached, runtime-validated security Fixer identity.
- The Assignment Port can only assign or find immutable decision-owned evidence.
- The Handler also receives only existing decision-reader, Run-state-reader and Worker-attempt-reader Ports.
- No Lifecycle/Admin Port, Registry, database, filesystem, IPC or Renderer capability crosses into the Handler.

## Durable Registry behavior

`AxisDedicatedFixerAssignmentRegistry` stores assignment evidence in an independent WAL-mode SQLite database:

- `decisionId` is unique, allowing only one assignment per Pivot decision;
- assignment creation re-reads the latest source attempt through `AxisWorkerAttemptReaderPort`;
- the source attempt must be failed and exactly match Run, Session, task, attempt number, attempt identity and source Worker;
- malformed Port output is rejected before persistence;
- close/reopen preserves the immutable assignment.

## Decision-bound Handler

`AxisPivotDedicatedFixerActionHandler` requires:

1. an unforced durable `decided` action of `dedicated-fixer`;
2. a `security` trigger whose task matches the decision task;
3. exact Run/Session ownership and post-decision optimistic revision;
4. the latest matching `pivot-decided` event and failed task;
5. objective, budget and committed usage matching the decision snapshot;
6. remaining token, cost, duration and Gate-cycle capacity;
7. the latest durable Worker attempt to be failed and equal the task attempt count;
8. a strict security Fixer identity different from the source Worker.

Task, issue and source identity come only from durable evidence. Sequential duplicate delivery, a matching concurrent unique conflict and database restart return the same assignment. A repeat reuses the stored identity without consulting the Resolver again.

## Explicit non-delivery

- No production composition root constructs the Resolver, Registry or Handler.
- No IPC, Preload, Renderer service/store or UI reaches this action.
- No scheduler or Fixer runtime consumes the assignment.
- The assignment does not grant permission, execution or filesystem authority.
- No Run/task state or retry budget is changed.
- Discard, stop and escalation action boundaries remain separate.

## Verification

- `tests/shared/axis-dedicated-fixer-contracts.test.ts`
- `tests/main/axis-security-fixer-resolver-adapter.test.ts`
- `tests/main/axis-dedicated-fixer-assignment-registry.test.ts`
- `tests/main/axis-pivot-dedicated-fixer-action-handler.test.ts`
- `tests/main/axis-pivot-dedicated-fixer-action-integration.test.ts`
- `tests/shared/axis-pivot-action-boundaries.test.ts`

Beta-0.1.53 verification passes 158 test files / 631 tests, TypeScript strict no-emit, production build, performance budget, Electron native dependency validation and the 3 existing Guarded production-build Electron paths. No installer or portable package was generated.
