# Pivot Axis typed blackboard foundation

Status: precommit evidence wired into a default-off guarded proposal/review/approval boundary; no evidence UI  
Code baseline: Beta-0.1.49

The Axis blackboard is an append-only, run-scoped exchange for bounded facts and evidence. It replaces cross-module state reads with explicit contracts and narrow Ports.

## Module contract

| Layer | File | Responsibility |
|---|---|---|
| Shared contracts | `src/shared/axis-blackboard-contracts.ts` | Typed values, facts, evidence, bindings, snapshots, views and optimistic write requests |
| Port interfaces | `src/main/services/axis-blackboard-ports.ts` | Reader, Writer, task-scoped composite, factory and Admin capabilities |
| SQLite adapter | `src/main/services/sqlite-axis-blackboard-store.ts` | WAL persistence, revision transactions, restart recovery and task projection |

Consumers must depend on a Port interface, not `SqliteAxisBlackboardStore`. The application composition root may hold the Admin/Factory implementation. A Worker receives only the task-scoped Port returned by `openTaskPort`.

## Ownership model

- Every task Port is permanently bound to one `runId`, `sessionId` and `taskId`.
- A Worker draft cannot provide `ownerTaskId`; unknown fields are rejected.
- The store assigns ownership from the bound Port.
- `run` visibility is readable by every task in the same run.
- `task` visibility is readable only by the owner task.
- A task Port exposes only `read`, `appendFact` and `appendEvidence`.
- Full snapshots, deletion and lifecycle operations remain on the Admin Port.

## State and concurrency

- Facts and evidence are append-only. There is no overwrite or arbitrary delete operation on a task Port.
- Every write carries `expectedRevision`.
- SQLite updates match run, session and revision in one transaction.
- Stale revisions fail with a conflict instead of silently replacing newer state.
- Duplicate fact/evidence identifiers fail closed.
- Returned views are parsed copies; mutating a caller-owned view cannot mutate persistence.
- Database rows and embedded snapshot revisions are cross-checked during reads.

## Payload limits

- Typed values: text, finite number, boolean, bounded string list or validated JSON text.
- Text is limited to 16,000 characters; JSON text to 32,000 characters.
- A snapshot holds at most 2,048 facts and 4,096 evidence entries.
- Keys, identifiers, locators, media types and summaries are bounded.
- Evidence requires a SHA-256 digest and explicit source.

## Current limitations

- The store is constructed only when the production guarded runtime is explicitly enabled.
- The Worker still does not receive Blackboard Admin or SQLite capability; the coordinator-owned evidence recorder receives only the task-scoped Port factory.
- Precommit evidence is recorded after Gate success and before transaction completion; completion/failure evidence projection remains.
- Git checkpoint identifiers are not attached to evidence automatically.
- Session deletion cleanup is connected; Run-level Blackboard retention policy remains.
- Large binary artifacts remain outside the blackboard and must be referenced by locator/digest.
- JSON text is syntactically validated but does not yet have per-key domain schemas.

These omissions keep the slice fail-closed: the guarded workflow can cause Main to append strict precommit evidence only after Gate success. Beta-0.1.49 derives a separate completion receipt only after Transaction completion; it does not relabel Blackboard precommit as completion evidence or expose a Blackboard Port to proposal, Worker or Renderer.

## Verification

- `tests/shared/axis-blackboard-contracts.test.ts`
- `tests/shared/axis-blackboard-boundaries.test.ts`
- `tests/main/axis-blackboard-store.test.ts`
- `tests/main/axis-production-guarded-runtime.test.ts`
- `tests/main/axis-guarded-safe-write.test.ts`
- `tests/main/axis-guarded-ipc-system.test.ts`

The tests cover typed and oversized payloads, forged ownership, task-private filtering, narrow Port surfaces, stale revisions, duplicate identifiers, cross-session access, detached views and restart recovery.
