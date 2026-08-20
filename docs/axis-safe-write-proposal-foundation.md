# Pivot Axis safe-write proposal foundation

Status: default-off model proposal, read-only Diff Review and Main-issued review binding implemented  
Code baseline: Beta-0.1.49 (`0.1.49-beta` package SemVer)

## Scope

This layer turns one authoritative pending `fs.safeWrite` task into bounded full-content review data. It does not claim the task, acquire Leases, create Checkpoints, issue execution authority or mutate the workspace.

The user may generate a proposal, inspect the original/proposed content in a read-only Diff Review and then explicitly acknowledge the existing Guarded Safe Write approval. Once loaded, proposed content is read-only because the exact bytes are bound to a short-lived Main-issued Receipt; changing content requires proposal regeneration. Execution remains a separate strict submission.

## Shared contracts

`src/shared/axis-safe-write-proposal-contracts.ts` defines strict runtime schemas for:

- the request: positive `expectedRevision` plus `runId`, `sessionId` and `taskId`;
- model output: 1–16 unique `{ filePath, content }` writes;
- review files: exact path, existing/missing state, original content/hash and proposed content;
- the result: proposal, Main-issued reviewed-proposal Receipt and the authoritative Run state after usage accounting.

Unknown fields are rejected. Aggregate original and proposed content are each capped at 4 MiB. The request cannot contain a project root, task body, commands, tools, authority, proof material or provider credentials.

## Narrow Main capabilities

The service depends only on:

- `AxisSafeWriteProposalFileReaderPort`;
- `AxisSafeWriteProposalModelPort`;
- `AxisSafeWriteProposalRunStatePort`;
- `AxisProjectBindingReaderPort`;
- `AxisGuardedTaskReaderPort`;
- `AxisReviewedProposalReceiptIssuerPort`.

Only the Main composition root constructs the real filesystem reader and provider-backed model adapter. Renderer receives proposal values through validated IPC; it receives no Port, database handle, provider secret, Project Binding Admin capability or raw filesystem access.

The model Port accepts bounded source review data and returns untrusted output plus measured usage. It exposes no tool invocation surface. The prompt treats the objective, task and file contents as untrusted data and forbids commands, roots, authority, proof fields, patches and extra paths.

## Authoritative flow

`strict request → authoritative Run revision/pending task → authoritative fs.safeWrite task → persistent Project Binding → review-time Fingerprint capture → root-contained source snapshots/cross-check → pre-model size limits → proposal-only model → atomic Run usage accounting → hard budget check → strict output/exact file-set validation → Fingerprint re-verification → Main Receipt → read-only Diff Review`

Important ordering:

1. stale revision, wrong ownership, non-pending task, unsafe tools and missing Project Binding fail before model generation;
2. source paths resolve beneath the Main-owned project root;
3. each existing source is limited to 1 MiB and aggregate prompt source content to 4 MiB before model cost is incurred;
4. measured token/cost/time usage is atomically recorded even when later model-output validation fails;
5. budget excess durably fails the task and Run;
6. Receipt issuance binds proposal identity, authoritative revision, exact proposed content digests and the complete review-time Fingerprint state;
7. proposal generation never claims or writes the task.

## Renderer behavior

The proposal store keeps the parsed review value, strict Receipt and authoritative Run state. A proposal remains usable only while proposal/receipt/run/session/task ownership, the accounted revision and exact assigned-file set match the active task.

`CodeDiffEditor` is lazy-loaded so Monaco remains outside the initial Renderer bundle. The Diff Review and Receipt-bound full-content field are read-only. The user must still explicitly acknowledge the write and rollback risk before submission.

## Verified failure paths

- malformed and unknown contract fields;
- missing, extra and duplicate model files;
- stale revision, cross-session ownership and non-pending tasks;
- tasks that request tools other than exactly `fs.safeWrite`;
- project-root traversal;
- oversized individual and aggregate source snapshots;
- invalid model output after durable usage accounting;
- hard token-budget stop;
- tampered, expired or ownership-mismatched Receipt;
- modified, deleted, created and same-content replaced review baselines;
- real Electron compile-Gate failure with physical rollback after proposal/review/approval.
- real Electron stale-review rejection before permission and Task claim.

## Explicit non-delivery

The Receipt is short-lived process-owned evidence and does not make the workflow autonomous or default-on. Successful guarded completion evidence UI, Blackboard evidence presentation, packaged release-process E2E, trusted project Gate profiles and Dynamic Pivot action handlers remain separate.

## Verification

- `tests/shared/axis-safe-write-proposal-contracts.test.ts`
- `tests/shared/axis-safe-write-proposal-boundaries.test.ts`
- `tests/shared/axis-reviewed-proposal-contracts.test.ts`
- `tests/shared/axis-reviewed-proposal-boundaries.test.ts`
- `tests/main/axis-safe-write-proposal.test.ts`
- `tests/main/axis-reviewed-proposal-receipt.test.ts`
- `tests/main/ai-sdk-axis-safe-write-proposal-model.test.ts`
- `tests/shared/ipc-validation.test.ts`
- `tests/renderer/axis-shadow-store.test.ts`
- `tests/renderer/axis-guarded-write-approval.test.ts`
- `tests/e2e/pivot-core-flows.spec.ts`
