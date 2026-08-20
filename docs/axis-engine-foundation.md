# Pivot Axis Engine foundation

This document is the stable entry point for the v1.0 Axis Engine core contracts. The current implementation is an alpha foundation and does not replace the CLI runtime yet.

## Ownership

- `src/shared/axis-engine-contracts.ts` owns runtime-validated protocol objects: `ComplexityReport`, `TaskDag`, `WorkerResult`, `GateResult`, `PivotDecision`, `BudgetEnvelope`, and `EngineTrace`.
- `src/main/services/axis-dag-scheduler.ts` owns deterministic validation and topological batching. It does not execute workers.
- `src/main/services/axis-budget-guard.ts` owns hard stop decisions. Prompts and adapters cannot override these decisions.
- `src/main/services/axis-complexity-evaluator.ts` and `axis-task-decomposer.ts` own strict structured-model boundaries and reject inconsistent routes, objective drift, invalid graphs, and file conflicts.
- `src/main/services/axis-classification-policy.ts` owns deterministic risk
  floors, low-confidence fallback, required human review and Gate selection.
  Model output is proposal-only; the task decomposer binds the code-owned
  decision to every authoritative task.
- `src/main/services/axis-shadow-run-coordinator.ts` owns planning-only orchestration. It cannot access `AgentRuntime`, tool execution, IPC, or Renderer code.
- `src/main/services/axis-trace-registry.ts` persists validated traces in SQLite by run and session.
- `src/main/services/ai-sdk-axis-planning-model.ts` adapts the active Provider to strict AI SDK structured output while keeping API keys in Electron Main.
- `src/main/services/axis-plan-lineage-registry.ts` persists revision-bound Provider replay attempts, immutable objective/file-scope digests, parent/root generations, and terminal recovery evidence.
- `src/main/services/axis-replan-coordinator.ts` owns fresh Provider replay for failed, paused, or budget-stopped runs. It rejects stale parent revisions and cannot access execution, IPC, or Renderer code.
- `src/main/services/axis-structured-model-runtime.ts` owns the shared AI SDK structured-output runner, conservative token pricing, usage normalization, and prompt data-block escaping for planning and Pivot models.
- `src/main/services/axis-pivot-policy.ts` maps Reviewer trigger categories to code-owned action allowlists and evaluates preflight/projected hard budgets.
- `src/main/services/axis-pivot-decision-registry.ts` persists revision-bound decision attempts, immutable budget/usage snapshots, Provider proposals, final decisions, and recovery state.
- `src/main/services/axis-pivot-coordinator.ts` owns fail-closed Dynamic Pivot selection. The model may propose a route but cannot commit state or execute that route.
- `src/main/services/axis-pivot-action-ports.ts` defines narrow read, planning-context, file-list, replan, and task-retry capabilities used after a decision. `axis-worker-attempt-ports.ts` separately defines Worker identity lifecycle/read and self-repair assignment capabilities; `axis-dedicated-fixer-ports.ts` isolates security Fixer resolution from immutable assignment persistence. The replan, retry, self-repair and dedicated-Fixer handlers validate their own decided action without receiving a Registry, database, filesystem, IPC, Renderer or execution capability.
- `src/main/services/axis-pivot-planning-context-adapter.ts` resolves the canonical project binding and frozen file manifest through read-only Ports. The action caller cannot provide a project root or command.
- `src/main/services/ai-sdk-axis-pivot-model.ts` adapts the active Provider to the read-only structured Pivot model boundary without exposing credentials or tools.
- `src/main/services/axis-settings-store.ts` owns three independent default-off flags for Shadow planning, Dry-run simulation, and real file execution; `axis-shadow-run-registry.ts` persists validated plan results.
- `src/shared/axis-run-state.ts` owns pure lifecycle transitions; `axis-run-state-registry.ts` persists task states, budget snapshots, revisions, and lifecycle events.
- `src/main/services/axis-task-executor.ts` defines the task-executor port. Its current `AxisDryRunTaskExecutor` implementation has zero tool authority and returns validated simulation results only.
- `src/main/services/axis-dry-run-coordinator.ts` owns approved DAG simulation, dependency order, budget checks, and terminal-state persistence without importing command, terminal, file-write, or agent-tool runtimes.
- `src/main/services/axis-execution-quality.ts` defines simulation-only Permission, Checkpoint, and Reviewer Gate evaluation ports. It cannot import the production permission manager, checkpoint store, or tool runtime.
- `src/main/services/axis-execution-authority.ts` issues short-lived HMAC-bound capability envelopes from authoritative Main-process session roots. It owns tool/file scope, expiry, and rollback ownership validation.
- `src/main/services/axis-fake-mutating-executor.ts` validates signed write intents and produces simulation receipts without accepting file content or importing a writer. `axis-authority-audit-registry.ts` durably records issuance and simulation receipts.
- `src/main/services/axis-permission-grant-collector.ts` derives permission scope only from the validated task and authoritative session root. `axis-permission-manager-port.ts` is the narrow adapter to the existing Main-owned permission prompt; Renderer answers allow/deny but cannot construct capabilities.
- `src/main/services/axis-checkpoint-receipt-issuer.ts` snapshots every existing assigned file through the checkpoint port and issues delete-on-rollback receipts for files that do not exist yet.
- `src/main/services/axis-guarded-fake-execution.ts` orders grant collection, complete checkpoint issuance, signed authority, Fake Worker simulation, and rollback evidence. It has no writer or IPC dependency.
- `src/main/services/axis-safe-write-worker.ts` is the only real file mutation adapter in the Axis foundation. It accepts content only with a separately signed `safe-write` envelope, verifies content digests and exact file/tool scope, and records digest-only write receipts.
- `src/main/services/axis-guarded-safe-write.ts` keeps real writes behind the third feature flag and orders permission, full checkpointing, safe-write authority, a durable worker-started transaction, bounded writes, and complete-batch rollback. It is intentionally absent from IPC.
- `src/main/services/axis-guarded-transaction.ts` composes the shared transaction/rollback sequence used by Fake and real execution, including fail-closed rollback evidence normalization.
- `src/main/services/axis-gate-runner.ts` owns deterministic Gate 1 sequencing through an injected no-shell command port. Trusted Main configuration supplies compile, test, and lint definitions; model, IPC, and Renderer input cannot supply commands.
- `src/main/services/axis-gate-evidence-registry.ts` persists bounded stdout/stderr, exit, timeout, duration, cycle, task ownership, and contiguous run sequence evidence in SQLite.
- `src/main/services/axis-execution-transaction-journal.ts` persists optimistic-revision transaction states before Worker invocation and retains recoverable evidence across process restarts.
- `src/main/services/axis-physical-rollback-executor.ts` is the isolated physical recovery boundary. It restores session-owned checkpoints and deletes files created by an interrupted transaction without importing Agent or IPC runtimes.
- `src/main/services/axis-execution-recovery.ts` replays worker-started, rollback-pending, rolling-back, and rollback-incomplete transactions through the idempotent rollback port.

## Alpha invariants

1. Pivot v1.0 allows one worker generation only (`spawnDepth: 1`); workers cannot recursively fork workers.
2. Task identifiers are unique and every dependency resolves inside the same DAG.
3. Cycles, self-dependencies, and duplicate file ownership fail before execution.
4. Parallel batches are deterministic and capped at eight workers.
5. Token, cost, duration, retry, Gate-cycle, and Pivot limits produce explicit stop reasons.
6. Trace events use contiguous sequence numbers beginning at one.
7. Run-state changes require an exact optimistic revision; lifecycle events are contiguous and the latest event must match the stored revision.
8. Dry-run execution is independently disabled by default and starts only when the approval lists every task in the persisted plan exactly once.
9. The coordinator revalidates the deterministic schedule, checks hard budgets before and after task simulation, and persists cancellation, pause, completion, and failure outcomes.
10. Dry-run tasks cannot invoke tools, commands, terminals, file writers, or the production `AgentRuntime`.
11. Every quality result carries `authority: simulation` and must exactly match the scheduled task, required-tool set, and assigned-file set. A malformed or mismatched result fails closed.
12. Permission and Checkpoint rejection happens before executor invocation. Reviewer rejection retries only within the original task and Gate-cycle budgets.
13. Mutation authority cannot be supplied by Renderer input. Main binds every envelope to the authoritative run, session, task, canonical project root, tool set, and file set, then signs the complete payload.
14. Every writable file capability has exactly one rollback receipt: existing files restore a concrete checkpoint; new files are removed on rollback. Envelopes expire within five minutes and reject tampering or cross-session reuse.
15. The current mutation executor is fake by construction: its contract carries only a content digest, returns `mode: fake-mutation`, and has no import path to file, command, terminal, permission, or production tool executors.
16. Renderer permission responses carry only a request identifier and decision. The grant collector canonicalizes the exact tool/file scope from the Main-owned task and rejects timeout, denial, abort, or adapter failure before checkpoint or Worker invocation.
17. Every existing assigned file must receive a physical checkpoint and every missing assigned file a delete-created-file receipt before authority issuance. A partial checkpoint batch never reaches the Worker.
18. A Fake Worker failure invokes the rollback port for the complete receipt batch. The result may claim `failed-rolled-back` only when every receipt has matching completed evidence; missing, malformed, or failed outcomes become `failed-rollback-incomplete`.
19. A transaction is durably `worker-started` before the first Worker call. State changes use an exact optimistic revision and only the declared transition graph is accepted.
20. Physical rollback validates canonical project containment plus checkpoint session/file ownership. Existing-file restore and new-file deletion are idempotent; an already absent new file is successful recovery, not an error.
21. Worker-started and non-terminal rollback states survive database reopen. Startup recovery may retry them, while complete and fully rolled-back transactions are excluded from the recovery queue.
22. Real file execution has a third feature flag independent of Shadow and Dry-run. The setting defaults to false, the guarded harness checks it before permission collection, and the authority service refuses to issue `safe-write` envelopes while it is false.
23. A real Worker accepts exactly the `fs.safeWrite` capability. File content never enters the authority audit; only the verified digest, byte count, ownership, and checkpoint receipt are persisted.
24. Every real write re-verifies the signed envelope immediately before file I/O. Expired, tampered, cross-run, cross-session, wrong-mode, wrong-tool, wrong-file, and digest-mismatched requests fail before that file is written.
25. A real batch reaches file I/O only after all permissions, all checkpoint receipts, authority issuance, transaction creation, and the durable `worker-started` transition succeed.
26. Failure or cancellation after the first write rolls back the complete checkpoint batch, including files not yet written. A failed completion-journal transition is treated as execution failure and also rolls back the batch.
27. No IPC handler, preload contract, Renderer store, or settings control can construct the safe-write harness or enable real execution in this phase.
28. Gate 1 accepts compile, test, and lint definitions only, in that order, with no duplicates. Each command uses `shell: false`, a maximum 120-second timeout, and the existing 64 KiB-per-stream capture ceiling.
29. The first failed or timed-out Gate stops later command execution. Later Gates are recorded as skipped, while every executed Gate must have exactly one persisted evidence identifier.
30. Gate evidence is cycle-bounded from one to three, unique per run/task/cycle/gate, and sequence-contiguous per run. Failure to persist evidence fails closed instead of returning an untracked pass.
31. A real safe-write transaction runs Gate 1 after the last write but before `completed`. Failed, malformed, wrong-owner, or unavailable Gate evidence rolls back the complete file batch.
32. Fresh Provider replay accepts only `failed`, `paused`, or budget-stopped source runs with an exact session-owned optimistic revision and a persisted source plan.
33. Replanning derives the objective from the source plan/state rather than caller input. The Provider response must preserve that objective and use a fresh run identifier.
34. Each replay freezes a canonical project file scope and stores SHA-256 bindings for both objective and scope. Provider-assigned files outside that scope fail before child-plan persistence.
35. Parent revision and terminal status are re-read after the Provider returns. Any concurrent restart or state change marks the lineage `stale` and produces no usable child plan.
36. Lineage transitions are durable and explicit: `planning -> materializing -> completed`, or a terminal `failed`, `stale`, or `interrupted` record. Only one live attempt may own the same parent revision.
37. Startup recovery marks vanished in-flight Provider calls interrupted, resumes a persisted child-plan materialization, and refuses recovery when the parent revision or child objective/session binding no longer matches.
38. Dynamic Pivot accepts only exact-revision `failed` or `paused` runs and records at most one decision attempt for a run revision.
39. Reviewer trigger categories map to code-owned action allowlists: minor permits self-repair/retry, direction permits retry/replan, design permits replan/escalate, security permits dedicated-fixer/escalate, and excessive permits discard/replan/escalate. Every category also permits stop.
40. Provider output is a proposal only. Task binding and action membership are revalidated before the decision can enter the committing state; a security trigger can never be routed to self-repair or ordinary retry.
41. Every decision record freezes source objective, status, revision, budget, usage, calculated remaining budget, allowed actions, Provider usage, duration, proposal, final action, and bounded evidence.
42. A new Pivot is refused before Provider invocation when token, cost, duration, or global Pivot capacity is exhausted. Provider usage is projected after return; exceeding a hard limit converts an otherwise valid proposal into a forced stop.
43. Non-stop decisions increment the persisted run Pivot counter through an optimistic state transition. The corresponding lifecycle event carries the durable decision identifier; stop decisions record evidence without consuming another Pivot.
44. A concurrent run revision change marks the prepared decision stale. `deciding` and `committing` states survive process failure: recovery marks lost Provider calls interrupted, resumes an uncommitted state transition, or completes evidence already present in the run state.
45. Dynamic Pivot decision selection has no IPC, Renderer, Worker, tool, command, permission, checkpoint, or file-writer dependency.
46. The `replan` action handler accepts only a decision identifier, expected Run revision, Run identifier, and Session identifier. It re-reads the decision, authoritative state, and latest `pivot-decided` lifecycle event before invoking the narrow replan Port.
47. A replan action is valid only for an unforced, decided `replan` decision whose Run/Session ownership, source revision, objective, budget snapshot, usage delta, and post-decision revision all match authoritative state.
48. Child budget is derived from the parent's remaining token, cost, duration, retry, Gate-cycle, and Pivot capacity. Caller input cannot widen a budget or select project context.
49. A completed lineage for the exact parent/Session/source-revision tuple is returned idempotently without another Provider call or duplicate child Run. Any non-completed attempt for that tuple blocks automatic replay until a new Pivot revision and decision exist.
50. The replan action foundation has no IPC, Renderer, Worker, tool, command, permission, checkpoint, or file-writer dependency. It is not production-composed or user-reachable.
51. The `retry` action accepts the same four-identifier request shape. Task identity comes only from the decided Pivot record and must name the exact failed task bound to the latest `pivot-decided` event.
52. Retry schedules one failed task back to `pending`, preserves all other task state and accumulated usage, increments only `retriesForTask`, and records a decision-bound `pivot-retry-scheduled` lifecycle event through an optimistic revision.
53. Retry refuses paused or non-failed Runs, completed/running/nonexistent target tasks, active sibling tasks, stale ownership/revisions, exhausted retry/token/cost/duration/Gate budgets, forced decisions, and malformed Port results.
54. A repeated or concurrent delivery of the same decision returns the persisted retry event without another revision or retry charge. SQLite reopen preserves this idempotency evidence.
55. The retry state Port is frozen and exposes only owned read plus the exact schedule operation. The handler has no execution capability and is not production-composed or user-reachable.
56. A strict Worker Attempt Binding now persists exact Run/Session/task/attempt/Worker ownership with optimistic lifecycle revisions. Worker identity is no longer inferred from a transient executor call.
57. A decided minor `self-repair` may create only an immutable assignment for the latest failed attempt and the same `workerId`; caller input cannot select the Worker, task or repair issue.
58. The self-repair Handler revalidates decision, latest Run event, failed task, attempt count, committed usage and remaining retry/token/cost/duration/Gate budgets before assignment.
59. Repeated, concurrent-conflict and post-reopen delivery reuses the same decision-bound assignment. The assignment does not mutate Run state or authorize execution.
60. Worker Attempt Reader, Lifecycle and Assignment Ports are frozen and separate; the Main-only Handler receives neither Lifecycle/Admin/database nor filesystem capability and is not production-composed.
61. Complexity model output is an untrusted proposal. Main policy merges
    repository evidence, applies code-owned risk floors and forces low-confidence
    work to one reviewed Worker.
62. Every authoritative task carries ordered, unique required Gates copied from
    the final classification. A model-produced DAG cannot select, omit or weaken
    those Gate requirements.
63. Guarded Safe Write validates Gate availability from the authoritative task
    before permission, Lease, Fingerprint, Checkpoint, authority issuance or
    mutation. Missing correctness/security capability fails closed.

## Shadow mode now available end to end

- Complexity and task decomposition run through an explicit `AxisPlanningModel` port and record measured cost/token usage.
- The coordinator produces a validated DAG and deterministic schedule, then stops before execution.
- Successful, budget-stopped, and contract-failed planning attempts persist an ordered `EngineTrace`.
- Renderer requests cannot supply project context or Provider secrets. Electron Main derives the authorized project manifest and resolves the active Provider.
- Shadow planning is disabled by default, requires an explicit Agent-setting opt-in, and enforces a bounded request budget.
- Completed plans persist per session and are inspectable in Work Center with task order, duration, token use, and conservative cost estimate.
- Every new plan receives a durable task-state snapshot with its original budget and usage. Cancellation and restart are session-scoped, revision-checked, and visible in Work Center.

## Dry-run simulation now available end to end

- Agent settings expose a second, independent default-off switch for DAG simulation; enabling Shadow planning does not enable Dry-run.
- Work Center can submit an exact approval request for every task in a planned run. Renderer input cannot alter the DAG, schedule, budget, project context, or individual task transitions.
- Electron Main resolves the authoritative session and persisted plan, then constructs only the zero-authority Dry-run executor.
- The coordinator traverses the persisted deterministic schedule and records every task transition and usage update through revision-checked state contracts.
- A pre-existing or newly reached hard budget limit pauses the run with an explicit stop reason. Executor errors are converted to validated failed task/run state instead of escaping as untracked work.
- Permission, Checkpoint, Reviewer Gate, and retry decisions persist as contiguous lifecycle events. Work Center exposes the latest quality audit plus Gate-cycle and retry counters.

## Execution authority foundation

- Capability issuance resolves `sessionId -> projectRoot` through an injected Main-process authority lookup; a caller-provided project root must match that canonical binding.
- Granted tools and files must be subsets of the validated DAG task. Canonical path checks reject traversal, alternate outside roots, and missing-parent escapes before signing.
- HMAC covers the complete envelope, including Checkpoint receipts and rollback owner. Verification checks signature, not-before/expiry time, and authoritative run/session/task/project binding.
- Successful issuance and Fake mutation receipts persist with contiguous per-run sequences. Session deletion removes the corresponding authority audit.
- No IPC channel exposes envelope issuance, verification, Fake mutation, or authority audit to Renderer code.
- The guarded harness is connected to the existing permission signal semantics through a narrow Main adapter, including the actual timeout/abort reason, while remaining unregistered in IPC.
- Physical checkpoint creation is exercised against `FileCheckpointStore`; Fake simulation proves files are unchanged and new-file receipts do not create files.
- Denial, timeout, pre-abort, partial checkpoint failure, Worker failure, complete rollback evidence, and incomplete rollback evidence are covered as fail-closed paths.
- The Guarded Harness now writes a transaction record before the Fake Worker. Success closes it as `completed`; failure records rollback progress and physical evidence through revision 5.
- Crash tests close and reopen both checkpoint and transaction databases, then prove restoration of an existing file, deletion of a created file, and persistence of terminal evidence.
- Missing checkpoints remain `rollback-incomplete` and recoverable instead of being silently treated as restored. Stale revisions, cross-session checkpoints, and paths outside the authoritative project root fail closed.

## Main-only safe-write foundation

- The real-execution setting is persisted independently and defaults to disabled even when Shadow and Dry-run are enabled.
- Authority issuance is gated twice: once before permission collection in the guarded harness and again inside the signing service.
- The safe-write Worker validates the signed mode, task binding, canonical file path, tool capability, checkpoint receipt, content digest, and byte limit before file I/O.
- Successful writes produce no-content audit receipts. A two-file success closes the durable transaction as `completed`.
- Mid-batch write failure, cancellation between files, authority expiry during a batch, and completion-journal failure all invoke physical rollback for the entire receipt batch.
- Existing-file restore and new-file deletion are verified with real temporary files. The same durable recovery coordinator remains able to replay an interrupted `worker-started` transaction after database reopen.
- This foundation is not registered in `ipc-handlers.ts`; there is no UI control or Renderer request that can reach it.

## Deterministic Gate 1 foundation

- Compile, test, and lint run sequentially through an injected command port. The Gate module does not import `child_process`, `CommandRunner`, Agent runtime, file writers, IPC, or Renderer code.
- Real process integration tests execute Node commands without a shell and verify passed, non-zero exit, fail-fast skip, and timeout behavior.
- Every executed Gate persists a strict evidence record with the exact Main-owned command definition, bounded output, exit code, timeout flag, duration, cycle, and ownership.
- Reopening the SQLite registry preserves ordered evidence. Duplicate evidence for the same run/task/cycle/gate and non-contiguous records fail closed.
- Safe-write completion now requires a passed Gate batch. Gate rejection restores existing files, deletes files created by the batch, and leaves the transaction with complete rollback evidence.
- Gate definitions are not yet auto-discovered from arbitrary projects; only trusted Main code may construct them in this phase.

## Revision-bound Provider replanning foundation

- Failed and budget-stopped plans can be replayed through a fresh planning-model call while inheriting the exact source objective, session, budget, and a frozen project manifest.
- Every attempt persists its parent run, root run, generation, source revision, objective/scope digests, child run, lifecycle status, and bounded error evidence in SQLite.
- A Provider response is validated before materialization and then checked against the source revision again. Objective drift, file-scope expansion, reused run identifiers, session mismatch, or concurrent restart fail closed.
- Child plan and child run-state creation are recoverable across database reopen. A crash before the Provider response becomes `interrupted`; a crash after child-plan persistence can finish run-state materialization.
- This coordinator and its lineage registry are intentionally absent from `ipc-handlers.ts`. The slice establishes internal recovery contracts without adding a Renderer action or enabling any real execution.

## Dynamic Pivot decision and non-executing action foundations

- Reviewer evidence enters through a strict trigger contract with a category, task binding, summary, and unique evidence identifiers.
- Main-owned policy narrows model choice to the routes approved by ADR-006. Minor omissions, direction drift, design faults, security findings, and excessive failures each receive a different allowlist.
- The AI SDK adapter sends only the run binding, objective, trigger, remaining budget, and allowed actions through escaped data blocks. It has no tool or state-mutation authority.
- SQLite decision records use `deciding -> committing -> decided` with terminal `failed`, `stale`, and `interrupted` outcomes. Per-run sequence numbers remain ordered after database reopen.
- Hard budgets are evaluated both before and after model generation. `maxPivots: 0` makes the code produce a forced stop without calling the Provider.
- A committing decision updates run usage and writes a `pivot-decided` lifecycle event through an exact optimistic revision. Crash recovery can finish either half of that durable handoff without selecting a second action.
- A narrow Main-only handler now connects only a valid `replan` decision to the existing revision-bound Provider replay Port. It supports paused parents, derives the child budget from remaining capacity, and returns an existing completed lineage on an identical repeated request.
- Project root and file scope are resolved by a Main adapter through Project Binding and file-list Ports; they are absent from the shared request. Failed, stale, interrupted, or active same-revision lineage attempts cannot be replayed automatically.
- A separate Main-only handler now schedules a decided `retry` for exactly one failed task. It derives the task from decision evidence, increments the retry budget once, and persists idempotency as a lifecycle event that survives database reopen.
- Retry does not invoke a Worker. It reopens the Run to `running` with the failed task at `pending`; a later separately guarded scheduler/execution boundary remains required.
- A strict Worker Attempt Registry now preserves the identity of the Worker that performed each task attempt. A separate Main-only self-repair handler may create one immutable same-Worker assignment for an unforced decided minor omission.
- A separate security Fixer Resolver and SQLite assignment Registry let a Main-only handler bind one decided security finding to a strict `security-fixer` identity different from the source Worker. The Handler revalidates the failed attempt and remaining non-retry budgets before persisting evidence.
- A separate discard Registry and Main-only handler bind one unforced decided excessive failure to the exact latest failed Worker attempt. The immutable receipt is terminal evidence, remains valid when continuation budgets are exhausted, and does not rebuild work or mutate Run state.
- Self-repair and dedicated-Fixer assignments do not reopen the Run or invoke a Worker/Fixer. Discard does not rebuild or execute work. Escalation and stop remain policy results without action handlers. None of the five action handlers is registered in production composition or IPC and none has a Renderer entry point.

## Not integrated yet

- Real safe-write execution exists only as a Main-owned, separately disabled foundation. It does not replace the existing `AgentRuntime`/CLI adapters, and Shadow planning plus Dry-run simulation remain zero-authority.
- Existing Renderer restart still reopens the same validated plan; the fresh Provider replay foundation has no IPC/UI route yet. Recovery covers planning materialization, not future long-running Worker processes.
- Dynamic Pivot can internally materialize a child plan for `replan`, schedule a failed task for `retry`, persist a same-Worker assignment for `self-repair`, record a different-Worker security Fixer assignment, or persist terminal discard evidence for a failed attempt. Production composition, guarded assignment consumption and IPC/UI reachability remain absent; stop semantics and human escalation handlers are still missing. Layered model routing, project-specific trusted Gate profiles, and semantic Reviewer Gates remain later v1.0 phases.
