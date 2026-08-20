# Axis Dynamic Pivot human escalation foundation

Status: Main-only foundation  
Baseline: `Beta-0.1.57` / `0.1.57-beta`

## Scope

This slice records one immutable Main-owned attention receipt when a committed
Dynamic Pivot decision selects `escalate`. It does not notify a person, create a
queue item in Renderer, mutate the Run, schedule work, invoke a Worker, or grant
execution authority.

## Shared contracts

`src/shared/axis-human-escalation-contracts.ts` defines:

- `AxisHumanEscalationCreateInputSchema`
- `AxisHumanEscalationReceiptSchema`
- `AxisHumanEscalationCategorySchema`

The receipt binds:

- decision and post-decision execution revision;
- Run and Session ownership;
- optional task ownership;
- one of the code-owned `design`, `excessive`, or `security` categories;
- the exact decision reason and trigger summary;
- a bounded, non-empty, unique evidence-ID list;
- Main-issued escalation identity and open timestamp.

`AxisPivotEscalateActionRequestSchema` accepts only
`decisionId`, `expectedRevision`, `runId`, and `sessionId`. The caller cannot
choose the category, task, evidence, reason, summary, identity, timestamp,
authority, project root, command, or execution target.

## Capability boundary

`AxisHumanEscalationPort` exposes only:

- `open(input)`
- `findByDecision(decisionId)`

The concrete `AxisHumanEscalationRegistry` is constructed separately and uses
WAL-mode SQLite with a unique decision constraint. Its frozen Port does not
expose the database, lifecycle administration, filesystem, IPC, Worker, or
Renderer capability.

`AxisPivotEscalateActionHandler` depends only on:

- `AxisPivotDecisionReaderPort`
- `AxisPivotRunStateReaderPort`
- `AxisHumanEscalationPort`

## Fail-closed consumption rules

Before opening attention, the Handler requires:

1. a strictly valid, unforced, decided `escalate` record;
2. a supported `design`, `excessive`, or `security` trigger;
3. exact Run and Session ownership;
4. exact post-decision revision (`sourceRevision + 1`);
5. the original failed or paused source status;
6. exact objective and budget snapshot;
7. the latest matching `pivot-decided` event;
8. an existing decision-bound task when `taskId` is non-null;
9. exact committed cost, duration, token, Pivot, retry, and Gate usage;
10. exact receipt ownership and evidence on every Port result.

The create payload is derived from committed decision and trigger evidence.
Sequential duplicate delivery, a matching concurrent unique conflict, and
database reopen reuse the same receipt. Malformed or mismatched Port output
fails closed.

## Verified behavior

- strict shared runtime validation and cross-field result validation;
- unsupported category, duplicate evidence, unknown field, and caller-selected
  task/reason rejection;
- failed Run with task-bound security escalation;
- paused Run with taskless design escalation;
- stale revision, cross-Session ownership, and stale latest-event rejection;
- matching idempotent repeat and concurrent-conflict recovery;
- SQLite close/reopen recovery;
- no Run-state mutation;
- structural exclusion of concrete registries, Renderer, IPC, command,
  Checkpoint, file writer, executor, and Safe Write dependencies.

## Deliberately absent

- production composition or IPC;
- Renderer Attention Queue or notification delivery;
- user acknowledgement/resolution lifecycle;
- Run stop transition;
- scheduler, Worker, Fixer, model, command, filesystem, Lease, Checkpoint,
  Fingerprint, Transaction, or Execution Authority access.

This foundation must not be described as a delivered human-escalation feature.

## Next boundary

Implement explicit decision-bound `stop` semantics as its own state-transition
slice, or separately production-compose already reviewed continuation actions
behind guarded scheduling/execution policy. Do not combine the two risks.
