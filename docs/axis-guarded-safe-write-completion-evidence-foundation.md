# Pivot Axis Guarded Safe Write completion evidence foundation

Status: successful default-off Guarded Safe Write completion is proven and projected as a narrow read-only Main receipt  
Code baseline: Beta-0.1.49 (`0.1.49-beta` package SemVer)

## Contract

`AxisGuardedSafeWriteCompletionEvidenceSchema` is a strict shared runtime contract. It binds:

- `authority: pivot-main`;
- run, session and task ownership;
- the completed Transaction identifier, revision and completion timestamp;
- the exact Checkpoint receipts;
- the exact Gate evidence identifiers;
- each written file path, content SHA-256 and authority-envelope identifier.

`AxisGuardedSafeWriteResultSchema` requires this evidence for `completed` and requires `null` for blocked, rolled-back or rollback-incomplete outcomes. It cross-checks ownership, Checkpoints, Gate identifiers and write evidence against the enclosing execution result. Unknown fields, duplicate paths, duplicate Gate evidence and pre-completion Transaction revisions are rejected.

The receipt is a read-only result value. It is not accepted as later execution authority and contains no project root, signing key, proof secret, database handle, filesystem capability or Admin Port.

## Main ordering

The successful tail is:

`Gate passed → Blackboard precommit persisted → Transaction markCompleted committed → completion evidence derived → strict result returned → authoritative Task/Run completed`

The Harness uses the Transaction returned by `markCompleted`; it does not infer completion from Gate success or Blackboard precommit. If journal completion fails, the existing Checkpoint-backed physical rollback runs and the result contains `completionEvidence: null`.

Blackboard evidence remains deliberately named `axis.safe-write.precommit`. It is not presented as completion proof.

## Windows Gate adapter

The production-build Electron success test exposed that direct `spawn('npm.cmd', ..., { shell: false })` fails with `EINVAL` in Electron Main on Windows. `AxisWindowsNpmGateCommandAdapter` now wraps only the fixed Main Gate Port:

- non-Windows commands delegate unchanged;
- Windows `npm.cmd` Gate commands execute through `cmd.exe`;
- every npm token must match a narrow safe-token grammar, so shell metacharacters are rejected;
- returned Gate evidence is normalized back to the logical `npm.cmd` command and original arguments;
- the general Agent command runner and Renderer receive no shell capability.

## Projection

The trusted IPC response carries the strict completion evidence. The Renderer store keeps only the latest evidence for the active run and the Work surface shows Transaction revision, completion time, file count and Gate-evidence count.

This projection is immediate and read-only. The authoritative durable source is still the completed Transaction journal entry. Beta-0.1.49 does not add a Renderer Transaction reader, database access or a restart-time completion-history query.

## Verification

- Shared contract tests cover strict fields, duplicate rejection, completed-only presence and exact evidence-set cross-checking.
- Harness tests prove the receipt matches the durable completed Transaction and is absent on Gate/journal failure.
- Production runtime and registered Main IPC tests reopen the Transaction journal and compare its identifier, revision and completion timestamp with the projected receipt.
- Renderer tests prove successful evidence storage, failed-result clearing and the absence of transaction/database/filesystem capabilities.
- Production-build Electron E2E proves proposal, read-only Diff Review, permission, real compile/test Gates, file mutation, completed Run state and visible Transaction r3 evidence.
- The prior production-build Electron rollback and stale-review paths remain regression gates.

Beta-0.1.49 verification baseline: 139 Vitest files / 569 tests, strict TypeScript, production build, performance budget, Electron native dependency check and three targeted guarded Electron paths.

## Explicit non-delivery

- The feature remains disabled unless `PIVOT_AXIS_REAL_EXECUTION=1`.
- The completion card is not a persistent history browser and is not reconstructed after application restart.
- Blackboard precommit evidence still has no user-facing browser.
- Trusted per-project Gate profiles, packaged release-process E2E and Dynamic Pivot action handlers remain separate slices.
- This is a reviewed bottom-layer workflow, not autonomous execution or a complete 1.0 release.
