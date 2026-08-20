# Pivot release gap assessment

Assessment date: 2026-08-21  
Code baseline: Beta-2.0.21 (`2.0.21-beta`)

This is a weighted engineering estimate against the product package Roadmap, not a percentage inferred from the semantic version. Confidence is medium and the error band is approximately +/- 7 percentage points because release quality, ecosystem adoption, and model behavior are not linear feature counts.

## Current estimate

| Target | Complete | Remaining | Interpretation |
|---|---:|---:|---|
| v1.0 internal beta | 100% | 0% | The package-free Beta-1.0 qualification gate passes unit/structural/system tests, TypeScript, formal build, Electron native checks, performance budgets and production-build Now smoke. This is an internal engineering baseline, not a signed public release. |
| v2.0 external/ecosystem release | 78% | 22% | The signed Catalog read chain, verified package delivery, tamper-evident install, explicit activation, Prompt/Skill/Theme consumers, capability-free Wasm v1 execution, two-phase update/rollback and fail-closed desktop release automation are production-wired. Actual signed desktop/content publication, independent Plugin security approval, public SDK/content documentation, two-version packaged release drills and the broader Studio/mobile roadmap remain. |

At the current slice size, the remaining 22% is approximately 6–10 independent
engineering or release slices, with an uncertainty of roughly three slices.
Two Marketplace launch blockers are external to ordinary code completion: the
offline signing/publication ceremony and independent Plugin sandbox review.
The broader uncertainty is still the breadth of Studios, mobile clients and
signed external-release drills.

## v1.0 weighting

| Workstream | Weight | Current credit | Main evidence / gap |
|---|---:|---:|---|
| Stable workbench and internal release base | 35 | 35 | Core workbench, security, persistence, Preview, updates, performance budgets and E2E exist. The Figma V2 shell is stable across Settings and Now is data-backed. The reproducible package-free `verify:beta1` gate, Apache-2.0 license metadata and production-build smoke pass. Signed distribution and upgrade/rollback drills remain external-release work. |
| Axis alpha engine | 25 | 25 | MCP client, strict planning/execution contracts, scheduling, hard budgets, durable state, Dry-run, signed capability envelopes, Fake mutation audit, production identity/lifecycle and a default-off guarded manual approval primitive exist; an automatic planner-output workflow remains. |
| Axis beta quality loop | 25 | 25 | Main-owned permission, checkpoints, rollback, Gate 1, replanning, Dynamic Pivot, Blackboard, atomic multi-file Leases and signed content fingerprints exist; the internal guarded coordinator now enforces their pre-mutation order. |
| Axis RC hardening | 15 | 15 | Desktop performance/smoke gates, durable recovery, external-change/permission/rollback/success system tests and real Electron rollback, stale-review and durable-completion paths exist. Dynamic Pivot now owns all concrete handlers, authoritative Dry-run failure observation, continuation handoffs, a fail-closed reviewed-submission consumer and retry-only proposal orchestration in default-off production Main composition. Packaged release-process E2E, broader orchestration reachability, engine degradation, circuit breaking, dynamic workers, Gate 3 and soak tests remain. |
| **Total** | **100** | **100** | Internal beta baseline only. |

## Completed implementation slice: Renderer terminal authority hardening

- Removed the unused structured `term:run` IPC request, its runtime validator,
  Main handler and Renderer service method. Internal Agent/Axis command Ports
  remain separate Main-only capabilities.
- Bound interactive terminal write, resize and destroy operations to the exact
  Electron `webContents.id` that created the PTY.
- Cross-window terminal identifiers now fail closed with a uniform
  `Terminal unavailable` error and cannot mutate or kill another owner's PTY.
- Retained `term:create`, `term:write`, `term:resize` and `term:destroy` because
  the user-facing interactive terminal is an intentional product capability.
  This slice reduces unused attack surface and enforces window ownership; it
  does not claim that a compromised Renderer cannot drive its own terminal.

## Completed implementation slice: Renderer arbitrary file-write bypass removal

- Removed the unused legacy `fs:safe-write` channel from the shared IPC
  contract, strict runtime validator, Main handler and Renderer file service.
- Removed its direct `SafeFileWriter` construction from production IPC
  composition. The class remains an internal compatibility/test utility while
  ordinary Agent mutation stays behind the fail-closed
  `AgentFileMutationPort` Adapter.
- Added a structural boundary test that requires reviewed Axis proposal and
  execution channels to remain the only arbitrary-content Renderer write path.
- Added a real Electron failure test proving a forged legacy invocation reaches
  no Main handler.
- Kept explicit user file-management actions (create, restore checkpoint and
  resolve review) separate from autonomous arbitrary-content mutation.
- Did not connect ordinary Agent writes to Axis by inventing a Run or Task ID.
  A future bridge must first receive an authoritative Axis-owned task binding.

## Post-Beta-1.0 work

1. Add a cross-action read-only history projection without exposing Admin capability.
2. Complete role factory and compatibility adapters for `.agent.md`, Codex TOML and supported external formats.
3. Add layered model routing, Scale-Then-Enrich, adaptive degradation, circuit breaker, dynamic worker count, trusted per-project Gate profiles and Gate 3 security review.
4. Complete unified-work projections and remove dormant compatibility chrome/styles after the active Renderer's Chat/IDE top-level state removal.
5. Complete signed Windows release channel, packaged production E2E, real previous-version upgrade/rollback drill, production icon, human localization review and engine soak/performance tests.

The Beta-1.0 internal engineering baseline is complete. The items above remain product expansion or public-distribution work: they do not invalidate the tested internal baseline, but they must not be described as delivered. Dynamic Pivot remains default-off, dedicated-Fixer still lacks a registered security-failure trigger, and none of these paths is a general autonomous UI feature.

## v2.0 remaining critical path

1. Build the Plugin SDK lifecycle, registry, sandbox and settings API on the existing strict Manifest/Runtime/Grant/Event/License contracts.
2. Skill engine with `SKILL.md` parsing, triggers, precedence, tests and safe execution boundaries.
3. Runtime Adapter SDK with unified event, permission, artifact, result and error contracts.
4. Theme engine/workshop with safe variable injection, preview, import and export.
5. Free community catalog backend/frontend, signing, compatibility checks, search, install/update and publish CLI.
6. Artifact/Studio SDK plus official Document, Slide, Image and Video studios.
7. Background run queue, schedules, remote status, attention flow and remote approval.
8. Mobile Now/Chat/Run status/Artifact Preview/approval clients.
9. Launch catalog content, public SDK documentation, compatibility matrix, security review and external distribution operations.

## Completed implementation slice: plugin/runtime authority foundation

- Added strict `PluginManifest`, `RuntimeAdapterManifest`, `CapabilityGrant`, `ExternalRunEvent` and `LicenseEntry` schemas.
- Enforced the all-free distribution contract and rejected unknown commerce or authority fields.
- Added exact filesystem/network/process/MCP capability declarations and safe runtime endpoint rules.
- Added Main-owned HMAC grant issuance, scope intersection, expiry, binding, tamper detection and revocation.
- Kept the foundation unreachable from Renderer/IPC and external process execution.

## Completed implementation slice: typed shared blackboard

- Added strict typed Fact, Evidence, Snapshot, View and write-request contracts.
- Split Reader, Writer, task-scoped and Admin capabilities into explicit Port interfaces.
- Added a SQLite adapter with WAL persistence and restart recovery.
- Bound ownership at task-Port construction; Worker input cannot choose another owner.
- Added run-shared/task-private projection, append-only writes and optimistic revision conflicts.
- Kept the store unreachable from production Worker/Renderer paths until the next guarded integration.

## Completed implementation slice: file ownership leases

- Added strict file identity, Lease, TTL, lifecycle and optimistic-version contracts.
- Split task Lease capabilities, file identity and Admin cleanup into explicit Ports.
- Added authoritative project-root path resolution and stable SHA-256 file identities.
- Added SQLite cross-task/cross-run active-write exclusion with a partial unique index.
- Added expiry, renew, release, run cleanup, conflict evidence and restart recovery.
- Added an explicit task-scoped Coordinator Port for bounded multi-file acquire, renew and release.
- Canonicalized, de-duplicated and sorted file identities before one all-or-nothing SQLite transaction.
- Made conflict, stale-version and ownership failures leave the complete requested set unchanged.
- Kept single-file operations on the same batch transaction core to prevent behavior drift.
- Kept Leases separate from filesystem mutation authority and unreachable from production writes.

## Completed implementation slice: external file fingerprint evidence

- Added strict existing/missing fingerprint evidence, bounded request and verification-result contracts.
- Bound evidence to project/run/session/task ownership, stable file identity and a short lifetime.
- Added a task-scoped capture/verify Port without filesystem or Admin capability exposure.
- Added a Main adapter with streaming content SHA-256, file-instance evidence and HMAC-SHA-256 proof.
- Added real failure-path coverage for modified, deleted, created, replaced, stale, cross-task and tampered evidence.
- Kept the adapter unreachable from Renderer/IPC paths; Beta-0.1.42 constructs it only inside the default-off production Main guarded runtime.

## Completed implementation slice: internal guarded file coordination

- Added read-only atomic Lease-version verification to the task Coordinator Port.
- Extended signed safe-write authority with exact project, Lease and fingerprint evidence.
- Enforced `acquireAll → captureAll → Checkpoint → authority → Lease verify → fingerprint verify → transaction/write`.
- Blocked modified, deleted, created and replaced files before transaction start without overwriting external work through rollback.
- Released acquired Leases through one `finally` path across completion, block, cancellation, rollback and failure.
- Kept concrete SQLite/filesystem adapters and all Admin capabilities out of Worker and Renderer boundaries.
- Beta-0.1.42 constructs the harness only inside a default-off production Main runtime; it remains unreachable from IPC and user flows pending separate review.

## Completed implementation slice: persistent project binding and Lease lifecycle

- Added strict Project Binding and Lease cleanup request/receipt contracts.
- Added a SQLite store that assigns one stable project identity per canonical root and recovers Session bindings after restart.
- Made Session bindings immutable and rejected caller-selected project identities.
- Narrowed consumers to one read-only `AxisProjectBindingReaderPort`.
- Replaced temporary root callbacks in File Identity, Fingerprint, Execution Authority and the internal Guarded Safe Write harness.
- Added Run- and Session-scoped Lease cleanup with idempotent receipts and real adapter-failure propagation.
- Kept binding Admin, Lease Admin, SQLite and filesystem capabilities out of Worker and Renderer boundaries.
- Kept the new store and lifecycle coordinator outside production composition pending review.

## Completed implementation slice: production identity and cleanup lifecycle

- Constructed the Project Binding Store, File Identity Adapter, Lease Store and lifecycle coordinators in the production Main composition root.
- Bound existing Sessions during startup and bound create/open/fork results before returning them to the caller.
- Cleaned Session Leases before soft close or hard deletion and unbound only after hard deletion committed.
- Routed cancel, failed Dry-run transitions and completed Dry-run transitions through a Lease-aware Run-state Port decorator.
- Committed terminal Run state before cleanup; cleanup failure remains visible while the durable terminal state is preserved.
- Added runtime readiness and shutdown cleanup/close hooks without exposing Binding Admin, Lease Admin, database or filesystem capabilities to Renderer or Worker.
- Covered restart rebind, cleanup interruption and TTL fallback with real adapters.
- Beta-0.1.42 adds a separate default-off guarded runtime alongside this lifecycle; user-reachable real execution remains absent.

## Completed implementation slice: default-off production guarded runtime

- Added strict `PIVOT_AXIS_REAL_EXECUTION=0|1` resolution; unset and `0` construct no guarded runtime resources.
- Added a production-only Main factory that composes Project Binding, Lease, Fingerprint, Checkpoint, signed Authority, Transaction Journal, Rollback, fixed Gate commands, Blackboard evidence and the narrow Worker.
- Reused the Agent runtime's Main-owned `PermissionManager` through `AxisPermissionManagerPort`; no Worker or Renderer receives Admin, SQLite or raw filesystem capabilities.
- Persisted Blackboard `axis.safe-write.precommit` evidence after Gate success and before transaction completion; evidence failure triggers the existing physical rollback path.
- Recovered durable interrupted transactions before runtime readiness and added Session deletion/close ownership for Blackboard, Gate evidence and transaction resources.
- Fixed Windows short-path versus canonical-path rollback recovery while preserving root-bound resolution and exact receipt evidence identity.
- Added no Renderer, Preload or IPC safe-write contract. The runtime is default-off and is not a delivered user feature.
- Changed visible version naming to `Beta-0.1.42` while keeping the package/updater SemVer as `0.1.42-beta`.

## Completed implementation slice: narrow guarded safe-write submission

- Added a strict shared request containing only run/session/task identifiers and a bounded write set.
- Rejected Renderer-supplied project roots, task objects, tools, authority envelopes and proof material.
- Added narrow execution and task-reader Ports; the submission service depends on Ports rather than concrete runtime/registry implementations.
- Resolved the authoritative task from persisted Shadow Runs and the project root from persistent Session Project Binding.
- Exposed `axis:execute-guarded-safe-write` only through trusted, validated IPC and retained the default-off `PIVOT_AXIS_REAL_EXECUTION=1` gate.
- Added production-adapter tests proving modified, deleted, created and same-content replaced targets block before Worker, Gate or transaction start, preserve external state and release Leases.
- Kept the primitive without a Renderer service/UI or completed/failed Run-state projection; it is not yet a delivered end-user workflow.
- Advanced the visible version to `Beta-0.1.43` and package/updater SemVer to `0.1.43-beta`.

## Historical planned slice (completed later)

After separate review, add a consumer for durable continuation handoffs that
creates or obtains an explicit reviewed proposal before calling the existing
Guarded submission Port. Never fabricate a reviewed-proposal Receipt from
Pivot evidence. Terminal stop/discard/Human Escalation results remain
separate. Packaged release-process E2E and trusted per-project Gate profile
discovery remain separate slices.

## Completed implementation slice: guarded Run-state projection

- Added positive `expectedRevision` to the strict shared submission and kept all authority/root/task fields Main-owned.
- Added pure atomic Guarded task claim/finish transitions with explicit lifecycle evidence, dependency checks and single-running-task exclusion.
- Added a narrow frozen `AxisGuardedRunStatePort`; the submission service does not receive the concrete Registry or Lease Admin capability.
- Projected completion, block, rollback and unexpected execution failure into authoritative task/Run state before terminal Lease cleanup.
- Added a typed Renderer service/store action that submits the current revision and reloads authoritative state after errors; no UI calls it yet.
- Added real permission-denial, permission-timeout and compile-Gate rollback tests plus stale-revision and cleanup-failure coverage.
- Advanced the visible version to `Beta-0.1.44` and package/updater SemVer to `0.1.44-beta`.

## Completed implementation slice: guarded Main IPC system boundary

- Exercised the real `registerIpcHandlers` composition and `axis:execute-guarded-safe-write` handler with real SQLite stores, filesystem mutation, permission signaling and startup recovery.
- Proved untrusted renderer frames and a forged `projectRoot` fail before Run-state mutation.
- Proved permission denial/timeout, physical Gate rollback, interrupted-transaction recovery and cleanup failure preserve the reviewed fail-closed behavior and durable state ordering.
- Added a Main-only `AxisGuardedIpcInfrastructure` seam that accepts only narrow Gate and lifecycle Ports plus a timeout value; no test infrastructure or authority field enters the shared IPC contract.
- Made IPC runtime shutdown idempotent and closed every composition-root-owned SQLite resource.
- Advanced the visible version to `Beta-0.1.45` and package/updater SemVer to `0.1.45-beta`.

## Completed implementation slice: guarded manual approval surface and real Electron rollback path

- Added a strict read-only shared feature-state contract so Renderer can discover whether guarded execution is available without receiving authority, filesystem or Admin capability.
- Added a user-reachable manual full-content approval surface for pending `fs.safeWrite` tasks, explicit risk acknowledgement and the existing narrow optimistic-revision submission.
- Kept the permission queue at the application shell so guarded requests remain actionable outside the Sessions tab.
- Normalized planner-supplied project-relative paths only at the Main authority boundary and continued to reject traversal outside the authoritative project root.
- Moved concrete guarded runtime construction into a dedicated Main composition module; IPC handlers depend on its narrow runtime surface.
- Added a real production-build Electron Renderer → Preload → Main E2E that reaches permission approval, triggers a real compile-Gate failure and proves physical rollback.
- Kept the feature default-off and did not add automatic model-produced writes, diff review, success evidence UI or packaged artifacts.
- Advanced the visible version to `Beta-0.1.46` and package/updater SemVer to `0.1.46-beta`.

## Completed implementation slice: model proposal and read-only Diff Review

- Added strict shared request, model-output, proposal and result contracts with exact fields, bounded file counts/content and runtime ownership/revision validation.
- Added narrow Main file-reader, model and Run-state Ports; only the Main composition root constructs filesystem and provider adapters.
- Required the authoritative pending `fs.safeWrite` task, exact assigned-file coverage and persistent Project Binding before model generation.
- Kept the model proposal-only: it receives bounded source review data, cannot invoke tools and cannot choose project roots, commands, authority or proof fields.
- Accounted measured proposal token/cost/time usage atomically in the durable Run state; budget excess hard-stops the task and Run.
- Added a lazy read-only Diff Review that pre-fills the existing editable full-content approval form while preserving explicit user acknowledgement.
- Added a real production-build Electron E2E for proposal → Diff Review → permission approval → compile-Gate failure → physical rollback.
- Kept the proposal baseline unbound to later guarded execution; it is review data, not a signed or persisted execution receipt.
- Advanced the visible version to `Beta-0.1.47` and package/updater SemVer to `0.1.47-beta`.

## Completed implementation slice: Main-issued reviewed-proposal Receipt

- Added a strict shared short-lived Receipt for proposal identity, project/run/session/task ownership, authoritative revision, exact proposed-content SHA-256 and complete review-time Fingerprint state.
- Added narrow Main issuer/verifier Ports and a concrete HMAC-SHA-256 service; only the guarded Main composition owns keys and the shared Fingerprint adapter.
- Captured Fingerprints before model generation, cross-checked bounded source reads and re-verified the baseline before Receipt issuance.
- Verified signature, expiry, ownership, revision, exact content and current full Fingerprint baseline before Task claim.
- Rechecked the same Receipt baseline against the Fingerprints captured after Lease acquisition and before Checkpoint, closing the verification-to-Lease race.
- Kept Worker and Renderer free of signing keys, Fingerprint Ports, Admin Ports, databases and filesystem capabilities.
- Added real modified/deleted/created/same-content-replaced tests, registered-handler HMAC flow and production-build Electron stale-review rejection before permission/claim.
- Advanced the visible version to `Beta-0.1.48` and package/updater SemVer to `0.1.48-beta`.

## Completed implementation slice: durable Guarded Safe Write completion evidence

- Added a strict shared Main completion-evidence contract binding completed Transaction identity/revision/time, exact Checkpoints, Gate evidence identifiers and written file content digests.
- Required completion evidence only for `completed`; blocked and rollback outcomes must carry `null`.
- Derived the receipt only from the Transaction returned by durable `markCompleted`, after Blackboard precommit persistence.
- Projected the latest read-only receipt into the Renderer Work surface without exposing the Transaction Port, database, filesystem or Admin capability.
- Added a narrow Windows npm Gate adapter after the production Electron success path exposed direct `npm.cmd` spawn `EINVAL`; the adapter rejects shell metacharacters and does not widen the general Agent command runner.
- Added real production runtime, registered Main IPC and production-build Electron success paths, while preserving rollback and stale-review regression coverage.
- Advanced the visible version to `Beta-0.1.49` and package/updater SemVer to `0.1.49-beta`.

## Completed implementation slice: decision-bound Dynamic Pivot replan action

- Added strict shared request/result contracts for one `replan` action. Caller input contains only decision, revision, Run and Session identifiers.
- Added narrow frozen decision-reader, Run-state-reader, planning-context, project-file-list and replan Ports; the handler receives no concrete Registry, database, filesystem, Admin, IPC or Renderer capability.
- Revalidated decided action, ownership, exact post-decision revision, objective, budget snapshot, usage delta and latest `pivot-decided` event before any Provider replay.
- Derived child limits only from the parent's remaining budget and rejected exhausted positive caps.
- Extended revision-bound replanning to paused parents, returned a completed same-source lineage idempotently, and blocked automatic replay after any non-completed same-revision attempt.
- Added real SQLite integration and malformed, wrong-action, cross-session, stale-revision, exhausted-budget, duplicate-child and failed-attempt tests.
- Kept the action outside production composition, IPC and Renderer. Self-repair, retry, Fixer, discard, stop and escalation remain unimplemented action boundaries.
- Advanced the visible version to `Beta-0.1.50` and package/updater SemVer to `0.1.50-beta`.

## Completed implementation slice: decision-bound Dynamic Pivot task retry

- Added strict shared request/result contracts. Caller input cannot select a task, action, budget, execution target or authority.
- Added a frozen `AxisPivotRetryStatePort` with owned read and one exact task-retry mutation; the handler receives no concrete Registry, database, filesystem, IPC, Renderer or execution capability.
- Required an unforced decided `retry`, exact Run/Session/revision/objective/budget/usage binding, latest matching `pivot-decided` event and one decision-owned failed task.
- Added a pure optimistic transition that preserves accumulated usage and sibling task state, increments retry usage once, returns the failed task to `pending`, and records `pivot-retry-scheduled`.
- Rejected paused/non-failed Runs, non-failed targets, active siblings and exhausted retry/token/cost/duration/Gate budgets.
- Made sequential, concurrent-conflict and post-database-reopen duplicate delivery return the same durable event without another revision or retry charge.
- Kept scheduling separate from Worker execution, production composition, IPC and Renderer reachability.
- Advanced the visible version to `Beta-0.1.51` and package/updater SemVer to `0.1.51-beta`.

## Completed implementation slice: durable same-Worker self-repair assignment

- Added strict shared Worker Attempt Binding and Self-Repair Assignment contracts with exact Run/Session/task/attempt/Worker ownership and runtime cross-field validation.
- Split frozen Reader, Lifecycle and Assignment Ports; the self-repair Handler receives no Lifecycle/Admin Port, concrete Registry, database, filesystem, IPC, Renderer or execution capability.
- Added a WAL-mode SQLite Registry with unique task-attempt identity, optimistic terminal lifecycle, one assignment per Pivot decision and close/reopen recovery.
- Required an unforced decided minor `self-repair`, exact post-decision Run event/revision/snapshot/usage, a failed task, the latest matching failed Worker attempt and remaining retry/token/cost/duration/Gate budgets.
- Derived task, Worker and issue only from durable decision/attempt evidence; caller input remains four identifiers and cannot select authority.
- Made repeated, concurrent-conflict and post-database-reopen delivery reuse the same immutable assignment without changing Run state or executing a Worker.
- Kept the Registry and Handler outside production composition, IPC, Renderer and Guarded Safe Write. This is assignment evidence, not delivered self-repair execution.
- Advanced the visible version to `Beta-0.1.52` and package/updater SemVer to `0.1.52-beta`.

## Completed implementation slice: different-Worker security Fixer assignment

- Added strict shared security Fixer identity and immutable assignment contracts with exact decision/Run/Session/task/source-attempt/source-Worker ownership.
- Enforced at runtime that the Fixer has the code-owned security specialty and differs from the source Worker.
- Split frozen Resolver and Assignment Ports; the Handler receives no concrete Registry, database, filesystem, IPC, Renderer, lifecycle or execution capability.
- Added an independent WAL-mode SQLite Registry with one assignment per decision, failed source-attempt verification and close/reopen recovery.
- Required an unforced decided security `dedicated-fixer`, exact post-decision Run event/revision/snapshot/usage, failed task/latest failed attempt and remaining token/cost/duration/Gate budgets.
- Made repeat and matching concurrent-conflict delivery reuse the same immutable assignment without re-resolving identity or changing Run state.
- Kept the Resolver, Registry and Handler outside production composition, IPC, Renderer and Guarded Safe Write. This is assignment evidence, not delivered Fixer execution.
- Advanced the visible version to `Beta-0.1.53` and package/updater SemVer to `0.1.53-beta`.

## Completed implementation slice: terminal Worker-attempt discard evidence

- Added strict shared discard-create and immutable receipt contracts binding decision, post-decision revision, reason, Run, Session, task, failed source attempt and source Worker.
- Added a frozen `AxisWorkerDiscardPort`; the Handler depends only on decision, Run-state, Worker-attempt and discard Ports.
- Added an independent WAL-mode SQLite Registry with one receipt per decision, latest failed-attempt verification and close/reopen recovery.
- Required an unforced decided `excessive` `discard`, exact latest Run event/revision/snapshot/usage, failed Run/task and latest matching failed Worker attempt.
- Allowed the terminal receipt when continuation budgets are exhausted because no new work is scheduled.
- Made repeat and matching concurrent-conflict delivery reuse the same immutable receipt without rebuilding work or changing Run state.
- Kept the Registry and Handler outside production composition, IPC, Renderer and Guarded Safe Write. This is disposition evidence, not a delivered discard workflow.
- Advanced the visible version to `Beta-0.1.54` and package/updater SemVer to `0.1.54-beta`.

## Completed implementation slice: production Figma V2 shell and Now dashboard

- Replaced the Settings-only rail variant with one stable global route rail so Now, Projects, Work, Artifacts, Automations, Extensions and Settings remain reachable on every route.
- Kept the Figma `44px` titlebar, `52px` rail, warm light palette, compact type scale and command-palette affordance without importing the obsolete Dashboard, Chat/IDE or CI/CD product semantics from the design file.
- Rebuilt Now as a production data-backed dashboard using real Session and unified `WorkItemSnapshot` values for Attention, active local/remote runs, completed work and recent artifacts.
- Added a Figma-density two-column dashboard with Continue, Attention and New actions in the primary column and Run/Artifact evidence in the secondary column.
- Added explicit responsive collapse: the activity panel leaves first, then the context sidebar, while the Now dashboard and summary cards collapse independently.
- Added structure tests plus server-rendered behavior tests that verify real summary values and route reachability under Settings.
- Verified the production Electron Now surface and the complete 17-entry Settings navigation with application-level E2E.
- Advanced the visible version to `Beta-0.1.55` and package/updater SemVer to `0.1.55-beta`.

## Completed implementation slice: route-driven UI V2 navigation

- Removed the active Renderer's `AppMode`, `setMode` and `toggleMode` state and made `PivotRoute` the only top-level navigation contract.
- Replaced historical `IdeActivity` / `WorkbenchTab` names with narrow `WorkspaceActivity` / `SessionView` state.
- Added pure shortcut resolution for Settings, Projects, Sessions and Terminal without granting any new capability.
- Replaced the first-run Chat/IDE product choice with one outcome-first entry while preserving project selection and Settings access.
- Added real Electron coverage for first run, Settings, Escape, Sessions and Terminal shortcuts.
- Kept Guarded Safe Write and Dynamic Pivot production reachability unchanged.
- Advanced the visible version to `Beta-0.1.56` and package/updater SemVer to `0.1.56-beta`.

## Completed implementation slice: decision-bound Human Escalation attention receipt

- Added strict shared create/receipt contracts for `design`, `excessive` and `security` attention evidence with bounded unique evidence IDs.
- Kept the caller request to decision/revision/Run/Session identifiers; task, category, reason, summary, evidence, identity and timestamp are Main-derived.
- Added a frozen `AxisHumanEscalationPort` and an independent WAL SQLite Registry with one immutable receipt per decision and restart recovery.
- Required an unforced decided `escalate`, exact failed-or-paused source state, ownership, post-decision revision, snapshot, usage and latest `pivot-decided` event.
- Covered failed task-bound security escalation and paused taskless design escalation.
- Made repeat and matching concurrent-conflict delivery reuse the same receipt without changing Run state, scheduling work, invoking a Worker or granting authority.
- Kept the Registry and Handler outside production composition, IPC and Renderer. This is attention evidence, not delivered notification, queue or human-resolution behavior.
- Advanced the visible version to `Beta-0.1.57` and package/updater SemVer to `0.1.57-beta`.

## Completed implementation slice: decision-bound Dynamic Pivot stop state

- Added strict four-field request and terminal result contracts for both model-selected and budget-forced `stop`.
- Added a strict `pivot-stopped` lifecycle event and kept planning-budget stopped Runs distinct from executed Pivot-stopped Runs.
- Preserved completed/failed/cancelled task evidence and changed only pending/running tasks to cancelled.
- Added a frozen `AxisPivotStopStatePort`; the Handler receives no concrete Registry, database, Worker, Renderer or execution capability.
- Required exact ownership, post-decision revision, failed-or-paused source status, snapshot, usage and latest `pivot-decided` event.
- Preserved model usage while enforcing that stop consumes no additional Pivot budget unit.
- Made sequential repeat, commit acknowledgement loss and SQLite reopen reuse the same terminal event without another revision.
- Kept the Handler outside production composition, IPC and UI. This is a durable Main-only state transition, not a delivered end-user stop workflow.
- Advanced the visible version to `Beta-0.1.58` and package/updater SemVer to `0.1.58-beta`.

## Completed implementation slice: Main-only Dynamic Pivot action dispatch

- Added one strict four-field dispatch request; callers cannot select an action or route.
- Added one strict result envelope that binds nested action evidence to the decision, execution revision, Run and Session.
- Separated `replan`, `retry`, self-repair and dedicated-Fixer continuation from terminal discard, Human Escalation and stop evidence.
- Added generic narrow executor Ports plus one frozen dispatcher Port exposing only `dispatch`.
- Routed all seven actions exclusively from the committed decision and revalidated every returned action result.
- Kept dispatcher and composition free of concrete Handlers, SQLite, filesystem, Worker, Checkpoint, Safe Write and Execution Authority.
- Proved a real SQLite close/reopen stop repeated through the dispatcher reuses the same terminal event.
- Kept concrete application-root runtime construction, automatic consumption, IPC and UI absent.
- Advanced the visible version to `Beta-0.1.59` and package/updater SemVer to `0.1.59-beta`.

## Completed implementation slice: default-off production Dynamic Pivot runtime

- Added strict `PIVOT_AXIS_DYNAMIC_PIVOT=0|1` resolution; disabled mode constructs no Pivot resources or Provider models.
- Added durable, strictly parsed dispatch-result persistence and Session cleanup.
- Constructed the Pivot/replan coordinators, all seven concrete action handlers and their durable evidence adapters inside one production Main runtime.
- Wired runtime readiness, committed-decision recovery, Session deletion and idempotent shutdown into the application composition root.
- Rejected a valid same-route result when its exact action does not match the committed decision.
- Kept the runtime internal: no Pivot IPC, Preload, Renderer or UI surface, production failure trigger, Worker scheduling or external-process interruption was added.
- Advanced the visible version to `Beta-0.1.60` and package/updater SemVer to `0.1.60-beta`.

## Completed implementation slice: authoritative Dry-run failure observation

- Added strict shared observation, immutable failure-evidence and
  continuation-handoff contracts with runtime validation.
- Added narrow Main evidence/reader Ports and independent WAL SQLite
  registries with idempotent source-revision and decision ownership.
- Wrapped the Dry-run task executor with a narrow attempt-tracking decorator
  so self-repair/Fixer actions consume real failed Worker-attempt evidence.
- Observed only the authoritative latest `task-failed` Run event through the
  existing registered Main handler; stale, cross-Session and non-failure
  observations fail closed.
- Reused the same committed decision/dispatch/handoff for duplicate delivery
  and after restart without replaying the model.
- Persisted `pending-guarded-review` handoffs only for continuation actions;
  terminal discard/escalate/stop results never enter that queue.
- Did not fabricate a reviewed-proposal Receipt or invoke Guarded Safe Write.
  No Pivot IPC, Preload, Renderer capability or autonomous user feature was
  added.
- Advanced the visible version to `Beta-0.1.61` and package/updater SemVer to
  `0.1.61-beta`.

## Completed implementation slice: Main-owned Pivot reviewed-submission consumer

- Added strict shared request and durable attempt contracts around the
  existing Guarded Safe Write submission contract.
- Added narrow authorization, submission and optimistic attempt Ports; the
  consumer receives no Admin service, Registry, database, Permission,
  Fingerprint or filesystem capability.
- Accepted only committed `retry` and child-Run `replan` targets; rejected
  forged ownership, wrong retry Tasks and assignment-only self-repair/Fixer
  actions before Guarded submission.
- Added a WAL SQLite attempt registry with unique reviewed-request identity,
  explicit creator/reuser results and durable completed/failed evidence.
- Changed interrupted `submitting` attempts to `recovery-required` on startup
  and never replayed ambiguous Guarded work.
- Composed the runtime only when both default-off Dynamic Pivot and real
  Guarded runtimes expose narrow Ports; added readiness, Session cleanup and
  shutdown ownership without Pivot IPC/Preload/Renderer reachability.
- Proved a real Guarded submission-service revision conflict without invoking
  execution and without replaying the same reviewed request.
- Kept automatic reviewed-proposal creation, production orchestration,
  self-repair/Fixer scheduling and user-facing automatic repair absent.
- Advanced the visible version to `Beta-0.1.62` and package/updater SemVer to
  `0.1.62-beta`.

## Completed implementation slice: retry-only reviewed-proposal orchestration

- Added strict shared request and durable orchestration contracts with exact
  cross-field validation for retry ownership, proposal evidence and consumer
  completion.
- Added narrow proposal, consumer and optimistic attempt Ports; the
  orchestrator receives no Admin service, concrete Registry, database,
  Permission, Lease/Fingerprint or filesystem capability.
- Added a WAL SQLite registry that commits `preparing` before proposal work
  and `submitting` plus proposal evidence before Guarded consumption.
- Converted interrupted work to `recovery-required` at startup and never
  replayed ambiguous proposal/submission work.
- Required an exact committed retry handoff and an exact next-revision
  Main-issued proposal before constructing the existing guarded consumer
  request.
- Reused the same Main proposal service through a narrow Port and connected
  only authoritative registered Dry-run retry dispatches in the production
  composition root.
- Proved the real registered chain from Dry-run failure through Pivot retry,
  proposal generation, permission and Guarded physical completion, plus real
  proposal stale-revision and restart ambiguity failures.
- Kept replan, self-repair and dedicated-Fixer automatic continuation absent
  until each has authoritative next-Task scheduling evidence; no Pivot IPC,
  Preload, Renderer or Worker capability was added.
- Advanced the visible version to `Beta-0.1.63` and package/updater SemVer to
  `0.1.63-beta`.

## Completed implementation slice: child-Run replan next-Task scheduling evidence

- Added a strict decision-only shared request and immutable schedule evidence
  contract; Run, Session, Task, dependencies, lineage and revisions are always
  derived from committed Main evidence.
- Added narrow authorization, child-plan, child-state and schedule Ports. The
  scheduler receives no concrete Registry, database, filesystem, Worker,
  Permission, Lease, Fingerprint or Authority capability.
- Added a WAL SQLite schedule Registry uniquely bound to
  `(decisionId, childStateRevision)`, allowing a multi-Task child DAG to
  advance without collapsing every Task into one decision-level record.
- Required exact replan handoff, lineage budget/ownership, authoritative plan
  ordering, dependency completion, no running sibling and exactly
  `fs.safeWrite`; drift and malformed input fail closed before persistence.
- Added a frozen Shadow Run reader Port and composed runtime readiness,
  Session hard-delete cleanup and idempotent shutdown in Main.
- Kept production triggering and proposal/Guarded submission absent: the
  current registered Dry-run evidence is authentically `minor` and therefore
  cannot be relabeled as `replan` merely to exercise this foundation.
- Verified 198 test files and 747 tests, TypeScript strict, formal build,
  performance budget and Electron native dependencies.
- Advanced the visible version to `Beta-0.1.64` and package/updater SemVer to
  `0.1.64-beta`.

## Completed implementation slice: post-retry replan reviewed-task orchestration

- Added a strict version-2 `direction` failure evidence variant that is emitted
  only after an authoritative same-Task retry has failed Guarded execution.
- Preserved version-1 `minor` evidence for initial Dry-run failures instead of
  relabeling them to force a replan.
- Added strict per-schedule orchestration contracts, narrow Ports and an
  independent WAL Registry with optimistic transitions and restart recovery.
- Derived child Run, Task and revision only from the immutable persisted
  schedule; callers cannot choose or forge scheduling identity.
- Reused the existing proposal and guarded-consumer Ports without exposing
  Registry, database, filesystem, Permission, Lease, Fingerprint, Authority or
  Admin capabilities.
- Connected the real registered chain from failed retry and physical rollback
  through direction/replan, child planning/scheduling, reviewed proposal and
  successful Guarded child completion.
- Preserved the failed parent history while completing the child Run lineage.
- Verified 203 test files and 758 tests, TypeScript strict, formal build,
  performance budget and Electron native dependencies.
- Advanced the visible version to `Beta-0.1.65` and package/updater SemVer to
  `0.1.65-beta`.

## Historical planned slice (completed later)

Add a durable continuation driver for the remaining dependency-ready Tasks in
a multi-Task replan child Run and a unified restart-queryable completion/failure
projection. Self-repair/Fixer Task scheduling and packaged release
qualification remain separate reviewed boundaries.

## Completed implementation slice: multi-Task replan child-Run driver

- Added strict decision-only drive request and bounded terminal result
  contracts with unique schedule/orchestration/Task evidence.
- Added a serial Driver that asks the authoritative scheduler again only after
  the previous Guarded Task completed at a new child revision.
- Rejected repeated schedules, owner drift, non-completed Task state and more
  than 100 Tasks; any non-completed Guarded execution stops the Run drive.
- Added an independent WAL Registry with one immutable terminal result per
  decision and restart-queryable completion/failure evidence.
- Composed readiness, Session cleanup and shutdown in Main without exposing
  concrete storage or execution capabilities to Renderer or Worker.
- Extended the real registered system path to a two-Task dependent child DAG,
  two proposals, two Guarded completions, two physical writes and terminal
  projection reuse.
- Verified 208 test files and 767 tests, TypeScript strict, formal build,
  performance budget and Electron native dependencies.
- Advanced the visible version to `Beta-0.1.66` and package/updater SemVer to
  `0.1.66-beta`.

## Historical planned slice (completed later)

Give self-repair and dedicated-Fixer assignments an authoritative executable
Task transition before they may enter reviewed proposal/Guarded execution.
Keep release qualification as the final independent slice.

## Completed implementation slice: assignment-owned executable scheduling

- Added explicit `pivot-self-repair-scheduled` and
  `pivot-dedicated-fixer-scheduled` lifecycle transitions.
- Added strict version-2 action results binding assignment, decision, Task,
  execution revision, schedule event and resulting Run revision; legacy
  version-1 assignment-only records remain readable but cannot execute.
- Added a narrow assignment state Port implemented only by the Main Run-state
  Registry; handlers receive no database, filesystem, Admin, Permission,
  Lease/Fingerprint or Authority capability.
- Made assignment plus schedule idempotent across concurrent acknowledgement
  loss and SQLite reopen, with self-repair consuming retry budget while the
  dedicated security Fixer remains a distinct action.
- Extended reviewed proposal and Guarded consumer paths only for exact
  scheduled evidence and exact next-revision Task ownership.
- Proved the registered Main self-repair path through failure observation,
  same-Worker assignment, proposal, permission, Guarded compile/test, physical
  write and authoritative completion.
- Kept dedicated-Fixer user reachability unclaimed because current registered
  Dry-run evidence is authentically `minor`, not `security`.
- Verified 209 test files and 771 tests, TypeScript strict, formal build,
  performance budget and Electron native dependencies.
- Advanced the visible version to `Beta-0.1.67` and package/updater SemVer to
  `0.1.67-beta`.

## Completed release slice: Beta-1.0 internal qualification

- Advanced the visible version to `Beta-1.0.0` and package/updater SemVer to
  `1.0.0-beta`.
- Added a strict release-contract test for version identity, the package-free
  qualification command, Apache-2.0 metadata, complete license text, build
  resource notices and honest README distribution boundaries.
- Added `verify:beta1`, which runs the full MVP gate, performance budgets and a
  production-build Now smoke without generating an installer or portable app.
- Verified 210 test files and 774 tests, TypeScript strict, formal build,
  Electron native dependency match and zero offline production dependency
  vulnerabilities.
- Passed the performance gate with 13 JavaScript chunks, an 11.53 MiB largest
  worker chunk, 4.18 MiB largest application chunk, 1.72 MiB initial load and
  22.61 MiB total output.
- Passed the production-build Now smoke with trusted root/preload, `zh-CN`, the
  Pivot title, desktop tray/shortcut presence, five Now sections and no legacy
  controls.
- Kept code signing, hosted update-channel credentials, a real previous-version
  upgrade/rollback drill, packaged E2E and reliable Git release traceability as
  explicit external-release gaps.

## Completed Figma General preference foundation (2026-08-02)

- Verified current Figma node `71:1735` and aligned the General Settings chrome
  and control rhythm without adding Renderer capabilities.
- Added strict shared application-preference contracts, narrow Main Ports, a
  versioned SQLite Adapter, optimistic revision conflicts, strict IPC and a
  narrow Renderer client/store.
- General preferences now survive SQLite reopen and the persisted locale loads
  at application startup. The remaining General values are persisted
  configuration only until their Main/runtime policies are wired and tested.
- Recovered the unchanged performance budget by lazy-loading Settings and its
  validators: 16 JavaScript chunks, 11.53 MiB largest worker, 4.18 MiB largest
  app chunk, 1.56 MiB initial Renderer and 22.75 MiB total.
- Production-build Settings smoke traverses all 17 entries and validates the
  real provider and About heading shapes.
- The current Figma Dashboard node `324:6487` exposes a different global Rail
  information architecture from production. Docs, Market, Ext and Help need
  explicit route contracts and reachable behavior before the Rail can be
  truthfully unified; remapping labels onto unrelated existing routes is not
  accepted as completion.

## Completed Figma global navigation and additional-interface slice (2026-08-03)

- Advanced the visible version to `Beta-1.1.0` and package/updater SemVer to
  `1.1.0-beta`.
- Re-read the current Core Screens and replaced the deleted historical Rail
  contract with Avatar, Home, Projects, Auto, Docs, Market, Ext, Settings and
  Help from nodes `324:6487`, `549:3877`, `187:3639`, `549:3543` and
  `248:5476`.
- Kept Sessions, Work, Artifacts and Runtimes as explicit internal routes;
  project/task, document and Settings surfaces continue to own their entry
  points instead of duplicating them in the global Rail.
- Added a data-backed Docs & Files screen over the existing project-scoped
  file tree and file-open behavior. It does not expose a filesystem handle or
  add a new Renderer capability.
- Added searchable Help & Docs cards whose actions target actual Docs and
  Settings routes, plus distinct Marketplace and Installed Extensions modes
  over the existing free, configured provider/resource data.
- Implemented Additional Interfaces nodes `74:1976` and `425:6216` as a
  dismissible/reopenable persistent panel and Attention Queue projected only
  from current runtime failures and strict `PermissionRequest` values. Sample
  runtime, path and rate-limit notifications from Figma are not shipped.
- Verified the slice with 219 test files / 796 tests, TypeScript and the formal
  build, the unchanged performance gate (1.58 MiB initial Renderer; 22.77 MiB
  total), Electron native dependency matching, and production Now/Settings
  smoke paths.
- Remaining Figma gaps include a real remote/free marketplace catalog,
  extension install/update lifecycle, durable Attention history across
  restart, detailed resolved/reopened states, profile editing, command palette
  execution and the remaining settings/core screen fidelity pass.

## Completed Figma Feedback local-outbox slice (2026-08-03)

- Advanced the visible version to `Beta-1.2.0` and package/updater SemVer to
  `1.2.0-beta`.
- Re-read the current selected Figma Feedback node `577:2787` and added the
  new Feedback item to the exact Settings navigation and production smoke
  contract.
- Added strict shared feedback, attachment-metadata and discard contracts;
  Main exposes separate Reader, Writer, Attachment Staging and Attachment
  Discard Ports.
- Feedback records and selected attachment bytes are stored in a versioned
  SQLite local outbox. Renderer receives no path, file content, database
  handle, filesystem object or Admin capability.
- Submission is append-only and idempotent by submission ID. Missing,
  unsupported, already-owned and corrupted attachment/record states fail
  closed. Abandoned staged BLOBs are removed during restart recovery, and a
  user removal deletes an unsubmitted BLOB immediately.
- The Figma history demonstration rows are not shipped. Production history is
  populated only from real locally saved feedback records and is explicitly
  labelled `Saved locally`.
- Verified with 226 test files / 812 tests, TypeScript and the formal Electron
  build, the unchanged performance gate (1.58 MiB initial Renderer; 22.79 MiB
  total), Electron native dependency matching, and production Now/Settings
  smoke paths.
- Remote delivery, authentication/consent policy, retry/backoff, server ticket
  identifiers and remote Open/In Progress/Resolved synchronization remain
  explicit gaps. This slice must not be described as a delivered remote
  feedback service.

## Completed durable Attention lifecycle slice (2026-08-03)

- Advanced the visible version to `Beta-1.3.0` and package/updater SemVer to
  `1.3.0-beta`.
- Re-read Additional Interfaces nodes `425:6244`, `425:6268` and `425:6287`
  and implemented real queue detail, resolved and reopened states without
  shipping the Figma demonstration incidents.
- Added strict shared observation, record and optimistic-lifecycle contracts;
  Main exposes separate Reader, Observation and Lifecycle Ports over a
  versioned SQLite Adapter.
- Runtime failures and `PermissionRequest` values are observed idempotently by
  stable source ID. Records survive restart; resolution increments revision;
  a later recurrence automatically reopens the same evidence record.
- Renderer receives only validated Attention records. It receives no database
  handle, filesystem capability, Admin Port or execution authority. Permission
  review and runtime switching continue to route to their existing owners.
- Verified with 231 test files / 826 tests, TypeScript and the formal Electron
  build, the unchanged performance gate (1.72 MiB initial Renderer; 22.81 MiB
  total), Electron native dependency matching, and production Now/Settings
  smoke paths.
- Remote notification transport, automatic runtime reconnect and Attention
  ingestion from Main-owned non-Renderer subsystems remain separate gaps. This
  slice is durable local evidence and lifecycle UI, not a recovery executor.

## Completed Figma Command Palette slice (2026-08-03)

- Advanced the visible version to `Beta-1.4.0` and package/updater SemVer to
  `1.4.0-beta`.
- Re-read the current Figma file, enumerated 81 top-level frames and implemented
  Command Palette node `597:5670` as the next independent production slice.
- The title-bar trigger and `Ctrl/Cmd+K` now open a keyboard-accessible overlay;
  `Escape`, arrow navigation and `Enter` execute real behavior.
- Recent rows come only from real Sessions, file rows come only from the
  existing project-scoped Main file-search boundary, and commands target only
  registered application routes. Figma demonstration auth files and commands
  are not shipped.
- Renderer received no new IPC, filesystem capability, database handle or
  Admin Port. File search does not run without an active Session/project.
- Verified with 233 test files / 832 tests, TypeScript and the formal Electron
  build, the performance gate (1.74 MiB initial Renderer; 22.83 MiB total),
  Electron native dependency matching, and production Command Palette, Now and
  Settings smoke paths.
- The newly added Docs, Marketplace, automation, New Project, empty-state and
  diagram surfaces remain separate Figma slices. Their screen presence is not
  treated as delivered functionality.

## Completed Figma project creation and honest empty-state slice (2026-08-03)

- Advanced the visible version to `Beta-1.5.0` and package/updater SemVer to
  `1.5.0-beta`.
- Implemented Figma New Project node `597:5842` through a strict shared request
  contract, narrow Main `ProjectCreationPort`, Node Adapter and existing
  Session/project authorization path. The Adapter creates only a previously
  absent target directory, optionally initializes Git and a HTTPS origin, and
  removes only that new target on failure.
- Implemented honest empty states for No Projects `597:6165`, No Automations
  `597:6278` and No Extensions `597:6403`. Create/import/template actions route
  to existing owners. Automation creation remains disabled while the Scheduler
  Port is absent; extension suggestions and install actions are not fabricated.
- Split installed-extension inventory from configured Provider models. The
  current empty extension inventory links to the existing free Marketplace;
  it does not claim Provider configurations are installed extensions.
- Added real Electron smoke paths that create a project on disk, validate the
  empty layouts and Figma IDs, and click the Automation/Extension Marketplace
  navigation actions.
- Restored the performance budget by route-splitting New Project, Automations
  and Extensions. Final initial Renderer is 1.74 MiB and total output is
  22.86 MiB without increasing any threshold.
- Verified 239 test files / 856 tests, strict TypeScript and formal build,
  performance, Electron native dependency matching, and all four production
  smoke paths. No installer or portable package was generated.
- Docs remains intentionally outside this slice at product-owner direction.
  The current Figma Marketplace Favorites node `615:6887` also remains a
  separate slice because real Catalog, Favorites and Install Ports do not yet
  exist; Figma sample plugins, ratings and download counts are not shipped.

## Completed Marketplace Catalog/Favorites foundation slice (2026-08-11)

- Advanced the visible version to `Beta-1.6.0` and package/updater SemVer to
  `1.6.0-beta`.
- Added strict immutable shared Catalog Source, Entry, Snapshot, Signature,
  Favorite Collection and optimistic Favorite write contracts.
- Catalog evidence is all-free, HTTPS-only, SHA-256 bound and Ed25519 signed;
  unknown fields, commerce data, duplicate resources, source/key mismatch,
  malformed signatures and snapshots lasting longer than seven days fail
  validation.
- Added separate Catalog Reader, Favorite Reader and Favorite Writer Ports.
  None exposes installation, execution, Admin, database or filesystem
  capability.
- Added a versioned SQLite Favorite Adapter with atomic optimistic revisions,
  idempotent writes, cross-connection stale-write rejection, restart recovery
  and fail-closed persisted-row validation.
- Verified 242 test files / 870 tests, strict TypeScript, formal build, the
  unchanged performance gate and Electron native dependency matching.
- This is a bottom-layer foundation only. No production catalog source,
  trusted public-key registry, IPC/Renderer path, download, installation,
  update, rating or download-count behavior is claimed.

## Completed trusted Marketplace Catalog Reader foundation (2026-08-11)

- Advanced the visible version to `Beta-1.7.0` and package/updater SemVer to
  `1.7.0-beta`.
- Added a shared canonical Catalog payload protocol and kept cryptography out
  of `src/shared`.
- Added narrow Main-only Transport, Trust Reader and Cache Reader/Writer Ports.
  The trust capability verifies signatures without exposing stored public-key
  objects to its consumer.
- Added an Ed25519 trust registry and a verified Catalog Reader Adapter that
  checks the exact trusted source ID, HTTPS URL, key ID, canonical payload,
  signature, generation time, expiry and monotonic revision before caching.
- Added a versioned SQLite Catalog cache. Only transport failure can use a
  still-current verified cache; invalid remote content never silently falls
  back. Cache corruption, downgrade and same-revision payload replacement fail
  closed across restart.
- Verified 245 test files / 883 tests, strict TypeScript, formal build, the
  unchanged performance gate and Electron native dependency matching.
- This remains a Main-only foundation. No concrete production HTTP Adapter,
  configured official source/public key, IPC/Renderer path, package signature
  verification, download or installation lifecycle is claimed.

## Completed bounded Marketplace HTTPS Transport foundation (2026-08-11)

- Advanced the visible version to `Beta-1.8.0` and package/updater SemVer to
  `1.8.0-beta`.
- Added a Main-only HTTPS JSON Transport Adapter behind the existing narrow
  Transport Port. It sends credential-free GET requests, disables automatic
  redirects and rejects URL credentials, fragments, redirects and non-200
  statuses.
- Enforced JSON media types, declared and streaming response-size limits,
  connection/body-read timeout, fatal UTF-8 decoding and complete JSON parsing.
- Added a Catalog composition factory that constructs Transport, Trust,
  verified Reader and SQLite cache only when explicit source configuration is
  present. An absent source constructs no database or network capability.
- Proved the full deterministic composition path with real Ed25519 evidence,
  bounded `Response`, durable cache restart and verified offline recovery.
- Verified 248 test files / 896 tests, strict TypeScript, formal production
  build, the unchanged performance gate and Electron native dependency
  matching.
- The app still has no official Catalog URL/public key configuration and no
  Marketplace IPC/Renderer or installation behavior.

## Completed production Marketplace trust configuration slice (2026-08-13)

- Advanced the visible version to `Beta-1.9.0` and package/updater SemVer to
  `1.9.0-beta`.
- Added a strict Main-only `PIVOT_MARKETPLACE_CATALOG_CONFIG` loader with a
  bounded schema-versioned JSON contract.
- Accepted only a complete trusted source and public Ed25519 key. Private-key
  material, unknown fields, partial configuration, non-Ed25519 keys,
  credential-bearing URLs and URL fragments fail before composition.
- Wired the loader into the production Main composition root and its shutdown
  lifecycle. An unset configuration constructs no Catalog database or network
  capability and reports an honest unconfigured state.
- No official source/key is embedded, and no Catalog/Favorites IPC, Renderer
  projection, package verification, download, install or publish behavior is
  claimed.
- Verified with 251 test files / 912 tests, strict TypeScript, the formal
  Electron production build, the performance gate (1.74 MiB initial Renderer;
  22.89 MiB total), and matching Node/Electron native dependencies. No installer
  or portable package was generated.

## Completed provider and ordinary-Agent authority hardening slice (2026-08-13)

- Advanced the visible version to `Beta-1.10.0` and package/updater SemVer to
  `1.10.0-beta`.
- Bound built-in Providers to Main-owned official endpoints. Custom Providers
  accept remote HTTPS or explicit loopback HTTP only and reject credentials,
  query/fragment data, private/link-local/reserved IP literals and known
  metadata hosts.
- Required a newly entered API key whenever a stored Provider endpoint changes.
  Provider SDK and connection-test requests are constrained to the configured
  origin/API path and automatic redirects are disabled.
- Bound `allow_session` permission reuse to a SHA-256 digest of the complete,
  deterministically serialized tool input instead of the tool name alone.
- Replaced child-process inheritance of `process.env` with an explicit
  non-secret runtime allowlist while preserving `shell: false`, bounded timeout
  and bounded output.
- Split ordinary Agent command and file mutation capabilities into narrow
  Ports. Production ordinary-Agent `fs.safeWrite` now fails closed through a
  dedicated Adapter until it is explicitly integrated with reviewed Axis
  Guarded Safe Write; the user-driven editor save path remains separate.
- Verified with 254 test files / 930 tests, strict TypeScript, the formal
  Electron production build, the performance gate and matching Node/Electron
  native dependencies. No installer or portable package was generated.
- This slice hardens existing authority boundaries; it does not add Marketplace
  ecosystem scope, so the weighted v2.0 estimate remains 51% complete / 49%
  remaining (approximately 16–22 independent slices).

## Completed Provider DNS pinning and rebinding defense slice (2026-08-13)

- Advanced the visible version to `Beta-1.11.0` and package/updater SemVer to
  `1.11.0-beta`.
- Added narrow Main-only DNS Resolution and Pinned Request Ports. No DNS,
  dispatcher, socket or network capability enters Shared, Preload, Renderer,
  Worker or plugin contracts.
- Production Provider requests now resolve the exact configured hostname once,
  reject empty, private, link-local, reserved or mixed public/private answers,
  freeze the approved address evidence and restrict Undici socket lookup to
  that immutable set while preserving the original TLS hostname and SNI.
- Applied the pinned production default to connection tests, normal Agent chat,
  Axis planning, Dynamic Pivot and Guarded proposal model traffic. Explicit
  test fetch injection remains bounded by origin/path and redirect policy but
  is not treated as production transport evidence.
- Added a real loopback socket test proving one DNS resolution followed by a
  connection through the approved address set, plus private/mixed-answer and
  request-target failure tests.
- Verified with 256 test files / 937 tests, strict TypeScript, the formal
  Electron production build, the performance gate and matching Node/Electron
  native dependencies. No installer or portable package was generated.
- This closes the previously documented custom Provider DNS pinning limitation.
  It does not add Marketplace ecosystem scope, so the weighted v2.0 estimate
  remains 51% complete / 49% remaining (approximately 16–22 slices).

## Completed Axis classification policy and Gate binding slice (2026-08-13)

- Advanced the visible version to `Beta-1.14.0` and package/updater SemVer to
  `1.14.0-beta`.
- Split untrusted model classification proposals from final code-owned
  decisions. Main policy now applies repository evidence, risk score floors,
  low-confidence single-worker fallback, required review and Gate selection.
- Added strict confidence, risk, policy-adjustment, Gate and human-review
  invariants to Shared runtime contracts; unknown and inconsistent fields fail
  closed.
- Added a proposal-only task DAG contract. The Main decomposer copies the
  classification decision into every authoritative task, so models cannot
  choose or remove execution Gates.
- Guarded Safe Write now rejects unavailable task-required Gates before
  permission, Lease, Fingerprint, Checkpoint, authority or file mutation. It
  consumes the persisted task decision instead of guessing risk again from
  file names.
- Added deterministic benchmark cases for narrow UI, cross-process IPC,
  external plugin runtime, destructive migration and high-context work, plus
  structural and real pre-permission failure tests.
- This improves the Axis foundation rather than delivering project-specific
  Gate profiles, correctness/security Gate adapters, adaptive model routing or
  a general autonomous UI. The weighted v2.0 estimate is now 52% complete / 48%
  remaining (approximately 15–21 independent slices).
- Verified with 261 test files / 958 tests, strict TypeScript, the formal
  Electron production build, the performance gate (1.74 MiB initial Renderer;
  22.91 MiB total) and matching Node/Electron native dependencies. No installer
  or portable package was generated.

## Completed Axis classification production-audit hardening slice (2026-08-13)

- Advanced the visible version to `Beta-1.15.0` and package/updater SemVer to
  `1.15.0-beta`.
- Separated repository-manifest evidence from model-selected candidate-file
  evidence. A repository that merely contains sensitive infrastructure no
  longer escalates every task, while the authoritative classification is
  re-evaluated after the decomposer selects the actual task files.
- Added bounded English and Chinese objective-risk evidence for security,
  external-runtime and destructive work, including negative cases that prevent
  ordinary UI removal language from being treated as destructive mutation.
- Guarded Safe Write now verifies that a successful Gate batch contains every
  required Gate, rather than trusting `supports()` and the aggregate status.
  Missing evidence triggers the real rollback path.
- Added a Main Adapter compatibility boundary for pre-Beta-1.14 persisted Axis
  plans. Legacy records are conservatively upgraded on read while Shared
  contracts remain strict; stopped records without a DAG and multi-agent
  security-risk records are covered with real SQLite recovery tests.
- Verified with 261 test files / 966 tests, strict TypeScript, the formal
  Electron production build, the performance gate (1.74 MiB initial Renderer;
  22.91 MiB total) and matching Node/Electron native dependencies. No installer
  or portable package was generated.
- This is correctness and upgrade hardening, not new ecosystem scope. The
  weighted v2.0 estimate remains 52% complete / 48% remaining (approximately
  15–21 independent slices).

## Completed trusted command Gate profile slice (2026-08-13)

- Advanced the visible version to `Beta-1.16.0` and package/updater SemVer to
  `1.16.0-beta`.
- Added a strict Shared Gate Profile data contract and a narrow Main-only
  resolution Port. Profile resolution is bound to the authoritative
  session/project identity; Renderer, Worker, model output and project files
  cannot provide executable commands.
- Added a code-owned Pivot TypeScript profile with bounded compile, test,
  correctness and security commands. Windows npm execution continues through
  the existing safe-token, no-shell Adapter.
- Generalized Gate evidence and batch contracts from three command Gates to
  five ordered Gates, while retaining unique Gate/evidence ownership and
  aggregate-status invariants.
- Guarded Safe Write now passes the exact task-required Gate set to the Runner.
  The Runner executes only those Gates from the trusted profile; missing
  profiles or capabilities fail before permission, and failed commands roll
  back the real file transaction.
- Real production-runtime tests prove four-Gate durable completion and a
  failed security command with physical checkpoint restoration.
- Verified with 264 test files / 975 tests, strict TypeScript, the formal
  Electron production build, the performance gate (1.74 MiB initial Renderer;
  22.91 MiB total) and matching Node/Electron native dependencies. No installer
  or portable package was generated.
- This delivers trusted command-type correctness/security adapters, not the
  architecture roadmap's model-based semantic Reviewer Gate 2 or Gate 3. It
  closes a high-value Axis gap but does not add Marketplace ecosystem scope;
  the weighted v2.0 estimate remains 52% complete / 48% remaining
  (approximately 14–20 independent slices).

## Completed Axis contract decomposition slice (2026-08-13)

- Advanced the visible version to `Beta-1.17.0` and package/updater SemVer to
  `1.17.0-beta`.
- Split execution authority, mutation, rollback, guarded completion and audit
  contracts into `axis-execution-contracts.ts`; split durable Gate evidence and
  batch contracts into `axis-gate-contracts.ts`.
- Kept `axis-engine-contracts.ts` as a compatibility entry point that re-exports
  the exact same runtime Schema objects. Existing consumers therefore do not
  fork validation identity or require a broad migration.
- Added structural tests enforcing the 800-line ceiling, Shared-only import
  direction and runtime Schema identity across direct and compatibility imports.
- Reduced the former 1,000-plus-line Shared contract module to 652 lines; the
  extracted execution and Gate modules are 494 and 92 lines respectively.
- Verified with 265 test files / 977 tests, strict TypeScript, the formal
  Electron production build, the performance gate (1.74 MiB initial Renderer;
  22.91 MiB total) and matching Node/Electron native dependencies. No installer
  or portable package was generated.
- This removes architecture debt without claiming a newly reachable product
  feature. The weighted v2.0 estimate remains 52% complete / 48% remaining
  (approximately 14–20 independent slices).

## Completed Main IPC boundary decomposition slice (2026-08-13)

- Advanced the visible version to `Beta-1.18.0` and package/updater SemVer to
  `1.18.0-beta`.
- Extracted IPC runtime option contracts, trusted-frame registration and small
  runtime support policies into focused Main-only modules. No Main capability,
  database handle, command runner or filesystem authority moved into Renderer,
  Preload, Worker or Shared.
- Preserved the original `ipc-handlers.ts` public type entry points, including
  explicit Gate Runner and Lease Lifecycle Port exports required for structural
  review.
- Reduced `ipc-handlers.ts` from 865 to 793 lines and added a structural test
  enforcing the 800-line ceiling and Main-only dependency direction across the
  extracted modules.
- A full regression initially caught a missing compatibility type export; the
  existing architecture assertion was preserved and the entry point was fixed.
- Verified with 266 test files / 979 tests, strict TypeScript, the formal
  Electron production build, the performance gate (1.74 MiB initial Renderer;
  22.91 MiB total) and matching Node/Electron native dependencies. No installer
  or portable package was generated.
- This removes a concrete architecture-rule violation without claiming new
  product capability. The weighted v2.0 estimate remains 52% complete / 48%
  remaining (approximately 14–20 independent slices).

## Completed semantic Reviewer foundation and Guarded transaction slice set (2026-08-13)

- Advanced through five independently tested patches from `Beta-1.19.0` to
  `Beta-1.23.0` (`1.23.0-beta`).
- Added strict Shared request, finding, untrusted proposal, code-owned decision
  and durable evidence contracts. Reviewer input is limited to objective,
  bounded diff and file digests; Worker reasoning is not accepted.
- Added a narrow Main-only Reviewer Port. It returns `unknown`; malformed,
  stale, low-confidence and unavailable results fail closed under a code-owned
  policy. Security failures require a dedicated Fixer rather than self-repair.
- Added a durable SQLite evidence Registry with restart recovery, contiguous
  per-run sequencing, ownership uniqueness and corrupt-record rejection.
- Added a bounded Coordinator enforcing correctness-before-security ordering,
  conditional security review, independent read-only reviewer identity,
  timeout/cancellation behavior and durable decisions.
- Added a Main Snapshot Adapter that constructs post-write review input from
  exact Checkpoint content and verified current file digests. Guarded Safe
  Write depends only on narrow review and snapshot Ports.
- Production composition can now own independent Reviewer Ports, evidence and
  snapshots. A failed semantic review after command Gates physically rolls
  back the transaction; successful review persists evidence before durable
  completion.
- Verified with 272 test files / 993 tests, strict TypeScript, the formal
  Electron production build, the performance gate (1.74 MiB initial Renderer;
  22.93 MiB total) and matching Node/Electron native dependencies. No installer
  or portable package was generated.
- Production IPC does not yet configure real independent model Reviewer
  Adapters, so this is a production-composable foundation and tested
  transaction path, not a default user-reachable Gate 2/3 claim. The weighted
  v2.0 estimate is now 55% complete / 45% remaining (approximately 12–18
  independent slices).

## Completed production semantic Reviewer hardening slice set (2026-08-13)

- Advanced through five independently tested patches from `Beta-1.24.0` to
  `Beta-1.28.0` (`1.28.0-beta`).
- Added strict Shared Reviewer routing and usage-evidence contracts. Main-owned
  routing rejects a Worker/Reviewer model collision and requires correctness
  and security Reviewers to use distinct provider/model identities.
- Added a read-only AI SDK Reviewer Adapter that reuses the existing structured
  model runtime and provider trust boundary. Objective, file metadata and diff
  are escaped as untrusted data blocks; no tool or filesystem Port is supplied.
- Added durable SQLite usage evidence for measured input/output tokens and
  cost. Exceeding any immutable route budget discards the model proposal and
  fails closed to human review.
- Added a bounded circuit breaker with closed/open/half-open behavior. Repeated
  provider failures stop additional calls during cooldown; only a successful
  half-open probe restores service.
- Added default-off Main IPC composition. Explicit activation requires an
  active Provider plus independently configured correctness/security model
  identifiers; secrets remain in Main and Renderer/Worker receive no Reviewer
  Admin, Provider Store, database or filesystem capability.
- Verified with 279 test files / 1006 tests, strict TypeScript, the formal
  Electron production build, the performance gate (1.74 MiB initial Renderer;
  22.94 MiB total) and matching Node/Electron native dependencies. No installer
  or portable package was generated.
- This makes semantic review a real configurable Guarded Safe Write production
  path, but it remains default-off and does not claim large-diff chunking,
  richer line mapping, Reviewer fallback pools, production telemetry/UI or
  broad field validation. The weighted v2.0 estimate is approximately 60%
  complete / 40% remaining (roughly 9–14 independent slices).

## Completed segmented semantic Reviewer resilience slice set (2026-08-13)

- Advanced through five independently tested patches from `Beta-1.29.0` to
  `Beta-1.33.0` (`1.33.0-beta`).
- Added strict Shared segmentation contracts plus a deterministic, newline-aware
  Main Segmenter. Each bounded segment carries its own SHA-256 digest and stable
  contiguous index.
- Added a segmented Reviewer Adapter that validates every measured response,
  aggregates usage and confidence, preserves all findings, and fails closed on
  malformed output or mixed Reviewer identities.
- Added post-write finding validation against exact changed-file ownership and
  snapshot-derived line counts. Findings for unknown files, missing line numbers
  or out-of-range lines can no longer approve a transaction.
- Added an independent primary/fallback Reviewer Adapter. Fallback is used only
  for transport/runtime failure, never to override a successful business
  decision; dual failure and cancellation remain fail closed.
- Production composition now supports independently named correctness/security
  fallback models and durable evidence records the model actually selected.
  Worker/primary/fallback role collisions are rejected before startup.
- Verified with 284 test files / 1020 tests, strict TypeScript, the formal
  Electron production build, the performance gate (1.74 MiB initial Renderer;
  22.95 MiB total) and matching Node/Electron native dependencies. No installer
  or portable package was generated.
- Semantic review remains explicit and default-off. Remaining v2.0 work includes
  user-visible review/telemetry surfaces, provider-specific field validation,
  restart/chaos campaigns, accessibility and broad end-to-end product
  qualification. The weighted v2.0 estimate is approximately 66% complete / 34%
  remaining (roughly 6–10 independent slices).

## Completed semantic review observability slice set (2026-08-13)

- Advanced through five independently tested patches from `Beta-1.34.0` to
  `Beta-1.38.0` (`1.38.0-beta`).
- Added strict Shared, bounded read contracts for session-owned semantic review
  telemetry. The projection excludes prompts, provider secrets, database
  handles, filesystem paths and privileged selectors.
- Added narrow evidence and usage Reader Ports backed by the existing durable
  SQLite registries. Reads survive restart, reject corrupt records and cannot
  cross session ownership boundaries.
- Added a Main projection service that joins decision and usage evidence by
  request identity and fails closed on inconsistent run/task/session ownership.
- Wired the reader through the production Guarded runtime and a separately
  owned Main IPC module. Trusted-renderer and active-session authorization are
  enforced before every query; Renderer receives no Admin Port or registry.
- Added a user-reachable Runtime Hub surface with explicit loading, unavailable,
  empty, error, result and truncated states. Renderer revalidates every IPC
  response and ignores stale session responses.
- The full regression caught the Main IPC entry point exceeding the 800-line
  ceiling; telemetry registration was extracted and the new module was added to
  the structural line/import boundary test.
- The initial formal build exposed a 4 KiB initial-renderer performance
  regression. Strict runtime validation was retained and lazily loaded on the
  telemetry path; no performance threshold was weakened.
- Verified with 288 test files / 1030 tests, strict TypeScript, the formal
  Electron production build, the performance gate (1.75 MiB initial Renderer;
  22.97 MiB total) and matching Node/Electron native dependencies. No installer
  or portable package was generated.
- This delivers read-only operational visibility for the existing default-off
  semantic review path; it does not make semantic review universally enabled.
  Remaining v2.0 work includes user-manageable Reviewer configuration and
  capability probes, provider qualification, deeper source mapping,
  restart/chaos and accessibility/localization qualification. The weighted
  v2.0 estimate is approximately 76% complete / 24% remaining (roughly 4–7
  independent slices).

## Completed Provider model availability probe slice set (2026-08-13)

- Advanced through five independently tested patches from `Beta-1.39.0` to
  `Beta-1.43.0` (`1.43.0-beta`).
- Added strict Shared query/result contracts. Renderer can select only a
  bounded Provider ID and refresh intent; returned evidence is capped at 100
  model identifiers and contains no endpoint, credential or network authority.
- Added a narrow Main-only model Probe Port and production Adapter. It reuses
  the existing official-endpoint/custom-endpoint trust policy and DNS-pinned
  Provider fetch path, requires JSON, validates model identifiers, rejects
  redirects/non-200/malformed/oversized responses and keeps timeout enforcement
  active while a response body stalls.
- Added a revision-aware TTL service that coalesces concurrent probes,
  invalidates results after Provider configuration changes, never caches a
  failure as success and may explicitly return stale prior evidence when a
  refresh fails.
- Added a focused trusted Main IPC registration. The registered production
  path resolves the Provider and decrypts its secret in Main before invoking
  only the narrow Probe Port; Renderer and Worker receive neither ProviderStore
  nor the network Adapter.
- Added a strict Renderer Store and user-reachable Models & Providers surface
  for not-probed, loading, not-configured, failure, empty, cached, populated and
  truncated states. Stale responses, unknown fields and cross-Provider results
  are discarded.
- The architecture test caught `ipc-handlers.ts` exceeding 800 lines during
  implementation. Registration/composition was extracted to a focused module
  and added to the same line/import boundary gate; the limit was not weakened.
- Verified with 295 test files / 1046 tests, strict TypeScript, the formal
  Electron production build, the performance gate (1.75 MiB initial Renderer;
  22.98 MiB total) and matching Node/Electron native dependencies. No installer
  or portable package was generated.
- A `/models` result proves only Provider-reported identifier availability. It
  is not proof of structured-output support, context/token limits, cost or
  Reviewer fitness. Remaining v2.0 work includes a minimal no-tool Reviewer
  capability qualification, durable user-managed Reviewer routing, chaos and
  restart qualification, accessibility/localization and broad release
  certification. The weighted v2.0 estimate is approximately 84% complete /
  16% remaining (roughly 3–5 independent slices).

## Completed Reviewer qualification and durable routing slice set (2026-08-14)

- Advanced through four independently tested patches from `Beta-1.44.0` to
  `Beta-1.47.0` (`1.47.0-beta`).
- Added strict Shared no-tool Reviewer qualification, evidence and revisioned
  routing contracts. Requests cannot carry credentials, endpoints, database
  paths or tool authority; evidence has fixed cost/token ceilings and expiry.
- Added a Main-only qualification Runner Port and AI SDK Adapter. The Adapter
  requests one exact structured object, exposes no tools, caps output at 128
  tokens, propagates cancellation and records measured usage only after strict
  runtime validation.
- Added durable qualification and routing stores behind narrow Ports, with a
  versioned transactional SQLite migration and partial legacy-schema recovery.
  Qualification is bound to the exact Provider revision and can replace expired
  evidence without accepting stale evidence.
- Added optimistic routing revisions and fail-closed activation checks. Every
  configured Reviewer identity must remain qualified, use the active configured
  Provider, stay distinct from the Worker and other Reviewer roles, and match
  the current Provider revision.
- Replaced production env activation at the composition root with a durable,
  revalidated routing snapshot. Main retains ProviderStore, secret and database
  authority; Worker and Renderer receive only the existing semantic Reviewer
  Port or strict trusted IPC contracts.
- Added a user-reachable Models & Providers workflow to qualify, enable and
  disable the correctness Reviewer. Renderer validates ownership, ignores stale
  qualification responses, requires exact revision increments and states that
  activation occurs on the next Runtime start rather than hot-swapping a live
  transaction.
- CodeGraph review confirmed the production call path and blast radius. A
  restart composition test proves a persisted qualified route is revalidated
  before semantic review is constructed.
- Verified with 305 test files / 1065 tests, strict TypeScript, the formal
  Electron production build, the performance gate (1.75 MiB initial Renderer;
  22.99 MiB total) and matching Node/Electron native dependencies. No installer
  or portable package was generated.
- This completes the core engineering path for user-managed qualified Reviewer
  activation. It does not claim that every external Provider/model is already
  qualified in production. Remaining v2.0 work is release qualification:
  representative real-Provider campaigns, restart/timeout/partial-response
  chaos on live transports, accessibility/four-locale end-to-end review, and
  signed distribution/update certification. The weighted v2.0 estimate is
  approximately 94% complete / 6% remaining, roughly 1–3 verification/release
  slices depending on Provider access and signing availability.

## Completed Security Audit remediation slice (2026-08-14)

- Advanced to `Beta-1.48.0` (`1.48.0-beta`).
- Closed the deleted-session resurrection/capability-retention path: active
  session lookup now gates project-root access, fork, file IPC and Agent tools;
  soft deletion revokes Agent, permission, terminal, watcher, lease and Axis
  binding capabilities before the delete commit, while explicit undo rebinds.
- Added fail-closed external CLI resource ceilings for stdout, stderr, lines,
  partial buffers, structured fields, input size/depth, queued events/bytes and
  aggregate response text, with child-process termination and cleanup tests.
- Locked the five production packages named by the audit to fixed releases and
  upgraded the desktop/toolchain baseline to Electron 43.4.0,
  electron-builder 26.15.3, electron-vite 5.0.0, Vite 7.3.6 and Vitest 3.2.6.
  Official complete dependency-tree audit now reports zero vulnerabilities.
- Added a structural production-wiring gate that keeps dormant MCP process
  launch unreachable until trusted provenance, approval, capability grant and
  allowlist contracts exist. This is a safety gate, not delivered MCP runtime.
- Verified with 306 test files / 1074 tests, strict TypeScript, formal build,
  unchanged performance ceilings (1.74 MiB initial Renderer; 23.02 MiB total),
  Electron/Node native bindings and a real hidden Electron 43 smoke. No
  installer or portable package was generated.
- The v2.0 estimate remains approximately 94% complete / 6% remaining. The
  remaining 1–3 release-evidence slices are representative live-Provider chaos,
  accessibility/four-locale E2E, and signed install/update/rollback validation;
  MCP production enablement remains a separate future capability slice.

## Completed Agent Run Event evidence foundation (2026-08-14)

- Opened the Beta-2 line at `Beta-2.0.0` (`2.0.0-beta`). This is an internal
  beta version boundary, not a claim of public 2.0 release qualification.
- Added a strict bounded Shared `AgentRunEvent` discriminated union and separate
  Writer, Reader and lifecycle Ports. Worker and Renderer receive no Reader,
  lifecycle, SQLite or database capability.
- Added a versioned SQLite append-only Adapter with transaction-assigned
  contiguous Session sequences, fixed Run ownership, one terminal fact,
  strict persisted-data validation, close/reopen restoration and owned Session
  deletion.
- Side-wired Agent Runtime start, non-null phase, permission, tool start/tool
  finish and terminal facts. Tool execution fails closed if durable start
  evidence cannot be recorded; successful completion is not reported before
  its terminal fact is durable; partial failure bytes and error class survive
  restart.
- Wired only the Writer Port into Agent Runtime and only the lifecycle Port into
  permanent deletion. The centralized shutdown coordinator closes the concrete
  Adapter. No Reader IPC or Renderer surface was added.
- Verified with 315 test files / 1104 tests, strict TypeScript, the formal
  Electron production build, unchanged performance ceilings (1.74 MiB initial
  Renderer; 23.04 MiB total), matching Electron native dependencies and a real
  hidden Electron smoke. No installer or portable package was generated.
- This is an execution-evidence foundation, not a claim that Pivot now uses a
  canonical event-sourced conversation model or supports replay. The next
  Harness-inspired engineering slice is a unified Tool Execution Pipeline;
  inbox steering, scoped capability envelopes and replay/invariant checks remain
  separate later slices. The v2.0 release-evidence estimate remains about 94%
  complete / 6% remaining because this foundation improves architecture rather
  than replacing the external Provider, accessibility/localization and signed
  distribution qualification still required for v2.0.

## Completed persisted theme and verified Marketplace projection slice (2026-08-17)

- Advanced to `Beta-2.0.1` (`2.0.1-beta`). This is an engineering slice, not a
  claim that the Marketplace install lifecycle or public Beta 2 qualification
  is complete.
- Promoted Appearance theme selection into the strict Shared application
  preferences contract and SQLite schema v2. Existing schema-v1 rows migrate
  deterministically to Light, while subsequent Light, Dark and System choices
  survive Adapter close/reopen and hydrate the Renderer at application startup.
- Exposed only verified Marketplace catalog reading and revision-checked
  Favorites through narrow IPC contracts. Main retains catalog trust, network,
  cache and database ownership; Renderer receives no Admin, filesystem,
  transport, key or SQLite capability.
- Rebuilt the Marketplace around current Figma node `818:9249` with a fluid
  auto-fit grid, narrow-window category strip, bounded content, explicit load,
  empty, unconfigured and failure states. General and Appearance now point to
  current nodes `818:4102` and `818:4269`.
- Applied current Figma Variables as semantic `--pv-*` tokens and moved inactive
  controls and inverse foregrounds behind semantic component variables.
- Replaced Settings screens that only had design-sample content with explicit
  empty states. No fabricated runtimes, Skills, MCP servers, storage totals,
  downloads, automations or Advanced controls are presented as production data.
- Marketplace remains unavailable in builds without a provisioned trusted
  catalog. Package download verification, install/uninstall authority,
  rollback, sandbox activation and a shipped signed first-party catalog remain
  required before Marketplace can be called an end-user-complete Beta 2 feature.

## Completed Marketplace publisher foundation slice (2026-08-17)

- Advanced to `Beta-2.0.2` (`2.0.2-beta`). This is developer publishing
  infrastructure, not a production Catalog or installable Marketplace release.
- Added a developer-only Publisher service behind a narrow crypto Port and a
  separate Node Ed25519 Adapter. Main, Renderer and Worker import none of the
  publishing authority.
- Added an exclusive key-generation command that refuses Git worktrees,
  resolves Windows Junctions, self-verifies each keypair, writes no private
  material to logs or public manifests and never overwrites an existing keyset.
- Added strict Catalog draft signing through the exact Shared Schema and
  canonical serializer. The private/public key binding, fingerprint, key ID,
  bounded lifetime and final signature are verified before an exclusive output
  file is created.
- Added behavior, real CLI failure-path and structural tests for malformed
  input, unknown flags, unsafe lifetime, Git/Junction paths, mismatched keys,
  tampering and overwrite attempts.
- Kept the official Marketplace repository under an explicit publication hold.
  Package signing/verification, safe extraction, install, activation, update,
  uninstall and rollback remain required before `catalog.json` may be shipped.

## Completed official Marketplace public trust-anchor slice (2026-08-17)

- Advanced to `Beta-2.0.3` (`2.0.3-beta`). This pins public verification
  identity only; it is not a published Catalog or installable Marketplace.
- Pinned the official `pivot-marketplace-2026-01` Ed25519 public key, SHA-256
  fingerprint, source ID and GitHub Pages Catalog URL in a Main-only module.
  Module initialization recomputes the fingerprint and fails closed on drift.
- Replaced complete environment trust injection with the default-off
  `PIVOT_MARKETPLACE_CATALOG_ENABLED` `0`/`1` gate. Environment input can no
  longer replace the official URL, Key ID or public key.
- Qualified the production Trust Registry with a real empty Catalog signature
  produced by the external official private key. Payload tampering and another
  Key ID are rejected; no private material entered source, tests or logs.
- Recorded the trust and future rotation policy in ADR 0001. Renderer, Preload,
  Shared and Worker remain outside the trust, transport, cache and database
  capability boundary.
- The public repository still rejects `catalog.json`. Package signing and byte
  verification, safe extraction, transactional install, activation,
  update/uninstall, rollback and recovery remain required before publication.
- Verified with 324 test files / 1127 tests, strict TypeScript, the formal
  Electron production build and unchanged performance ceilings (1.73 MiB
  initial Renderer; 22.99 MiB total). No installer or portable package was
  generated.

## Completed Marketplace package artifact verification foundation (2026-08-18)

- Advanced to `Beta-2.0.4` (`2.0.4-beta`). This is a bottom-layer integrity
  capability, not a wired download or install feature.
- Added a strict Shared package descriptor that binds exact byte length and
  lower-case SHA-256 to source ID, resource kind, resource ID and version. The
  canonical serializer and Catalog-entry projection provide one package
  Ed25519 signing payload.
- Added separate Main-only Inspection and Verification Ports. The verification
  policy depends on those Ports and the existing Trust Reader rather than Node
  filesystem or crypto implementations.
- Added a Node inspection Adapter that streams files through an open handle,
  enforces a 512 MiB hard ceiling, rejects symbolic links and non-regular files,
  and fails closed on mutation, deletion or pathname replacement observed
  during inspection.
- Added real Ed25519 and filesystem failure-path tests for valid bytes,
  tampering, truncation, replacement, missing/non-regular/symbolic-link paths,
  wrong signatures, unknown keys and configured size ceilings, plus structural
  tests keeping Renderer and Worker outside the capability boundary.
- The verifier is deliberately not production-wired. Package signature
  creation, bounded download staging, safe archive extraction, transactional
  install, activation, update/uninstall, rollback and recovery remain required
  before the official Catalog publication hold can be lifted.
- Verified with 325 test files / 1134 tests, strict TypeScript, the formal
  Electron production build, unchanged performance ceilings (1.73 MiB initial
  Renderer; 22.99 MiB total) and matching Electron native dependencies. No
  installer or portable package was generated.

## Completed Marketplace package signing foundation (2026-08-20)

- Advanced to `Beta-2.0.5` (`2.0.5-beta`). This is developer publishing
  infrastructure and a signing/verification qualification loop, not a wired
  Marketplace download or installation feature.
- Added strict Shared package identity and signed-envelope contracts. Package
  signatures cover a fixed `pivot-marketplace-package:v1` domain plus the
  canonical descriptor, preventing cross-protocol signature reuse.
- Added `MarketplacePublisher.signPackageArtifact` behind the existing narrow
  Crypto Port. It binds the private key to the reviewed public manifest,
  validates the descriptor, signs, self-verifies and returns only immutable
  public evidence.
- Added the developer-only `marketplace:sign-package` command. It uses the
  existing bounded Node inspection Adapter to derive exact byte length and
  streaming SHA-256 from a real regular file, rejects symbolic links and
  unstable paths, and creates the public signature output exclusively.
- Added a real ephemeral-key end-to-end qualification proving Publisher output
  is accepted by the production Main package verifier and rejected after byte
  or signed-identity tampering. No official private key was read or copied.
- Main, Renderer and Worker receive no Publisher, private-key, inspection or
  signing capability. Safe download staging, archive validation/extraction,
  transactional install, activation, rollback and recovery remain required
  before the official Catalog publication hold can be lifted.
- Verified with 326 test files / 1140 tests, strict TypeScript, the formal
  Electron production build, unchanged performance ceilings (1.73 MiB initial
  Renderer; 22.99 MiB total), matching Electron native dependencies and zero
  production dependency vulnerabilities. No installer or portable package was
  generated.

## Completed Marketplace package download staging foundation (2026-08-20)

- Advanced to `Beta-2.0.6` (`2.0.6-beta`). This is a reviewed Main-only
  staging and verification capability, not a production-wired Marketplace
  installation feature.
- Added a strict Shared download intent projected from a verified Catalog
  entry. It carries only the signed descriptor, HTTPS URL, schema version and
  signature; callers cannot select request headers, credentials or output
  paths.
- Added narrow Download and Staging Ports. Policy depends on those Ports, the
  Trust Reader and the existing Artifact Verification Port rather than on Node
  filesystem or transport implementations.
- Added bounded HTTPS streaming into exclusive Main-owned partial files. The
  Adapter rejects cross-origin URLs, credentials, query strings, fragments,
  redirects, non-200 responses, unapproved content types, missing or mismatched
  lengths, truncation and actual-byte overflow, with timeout/cancellation and
  failure cleanup.
- Package signatures are verified before network access and staged bytes are
  reverified with the production length, SHA-256, identity and signature
  verifier. Verification failure removes the staged artifact, while cleanup
  refuses pathname replacement.
- Added structural and real filesystem/stream failure-path tests covering
  strict projection, capability isolation, symbolic-link staging directories,
  valid staging, tampering, redirects, malformed length evidence, truncation,
  overflow, cancellation, timeout, transport failure and residual-file cleanup.
- The capability is deliberately absent from Renderer, Worker, IPC and the
  production Marketplace composition root. Safe archive validation/extraction,
  transactional installation, activation, rollback/recovery and update/
  uninstall remain required before Catalog publication.
- Verified with 327 test files / 1149 tests, strict TypeScript, the formal
  Electron production build, unchanged performance ceilings (1.73 MiB initial
  Renderer; 22.99 MiB total), matching Electron native dependencies and zero
  production dependency vulnerabilities. No installer or portable package was
  generated.

## Completed Marketplace safe archive extraction foundation (2026-08-20)

- Advanced to `Beta-2.0.7` (`2.0.7-beta`). This is a reviewed Main-only ZIP
  inventory and extraction capability, not a production-wired Marketplace
  installation feature.
- Added strict Shared inventory and extraction-evidence contracts. They reject
  unknown fields, absolute/traversal/UNC/drive/ADS/reserved-device paths,
  malformed segments, case-insensitive duplicates, file-ancestor collisions,
  excessive path depth, excessive entries and excessive extracted bytes.
- Added narrow Inspection, Extraction and Preparation Ports. The verification
  policy depends only on those Ports and the existing verified staged-artifact
  capability; Renderer, Preload and Worker receive no filesystem, archive,
  trust, database or Admin capability.
- Strengthened staged artifacts with an identity-checked, read-only file-
  descriptor lease. Active leases block discard, pathname replacement fails
  closed, and extraction re-inventories the exact leased bytes before creating
  output.
- Added a Node ZIP Adapter that accepts only stored/deflated unencrypted regular
  files and directories, rejects links and unsupported file types, extracts
  exclusively beneath a private canonical Main root, hashes exact file output,
  checks file identity and cleans partial residue on malformed archives,
  cancellation, stream failure or evidence mismatch.
- Added real malicious-archive and race/failure tests for traversal, absolute
  paths, symlinks, encryption, unsupported compression, collisions, expansion
  limits, forged inventory, malformed ZIPs, cancellation, staged replacement
  and cleanup. The implementation is pinned to `yauzl` 3.4.0 and carries its
  direct/transitive license notices.
- The capability remains absent from IPC and the production installation
  composition root. Strict package-manifest cross-binding, capability review,
  transactional install/activation, rollback/restart recovery and update/
  uninstall remain required before Catalog publication.
- Verified with 329 test files / 1177 tests, strict TypeScript, the formal
  Electron production build, unchanged performance ceilings (1.73 MiB initial
  Renderer; 22.99 MiB total), matching Electron native dependencies and zero
  production dependency vulnerabilities. No installer or portable package was
  generated.

## Completed Marketplace embedded manifest foundation (2026-08-20)

- Advanced the first requested slice to `Beta-2.0.8` (`2.0.8-beta`). Added a
  strict Shared `pivot-package.json` contract and a Main-only bounded regular-
  file inspection Port/Adapter.
- The manifest binds package identity, publisher, entrypoint, capabilities and
  exact payload path/length/SHA-256 declarations. Unknown fields, path
  traversal, self-reference, duplicates, symbolic links, malformed JSON,
  oversized input and extraction-evidence drift fail closed.
- This is embedded-manifest evidence, not installation or execution delivery.

## Completed Marketplace package evidence binding foundation (2026-08-20)

- Advanced the second requested slice to `Beta-2.0.9` (`2.0.9-beta`). Added a
  policy Adapter that depends on narrow validation capability and creates a
  bound package only after Catalog, signature descriptor, Manifest publisher/
  identity and every extracted file agree exactly.
- Root validation lives behind a Main Port with a Node Adapter; the policy has
  no Node filesystem dependency. Renderer and Worker receive no root path or
  cleanup capability.
- This is pre-install evidence composition, not a user-reachable install flow.

## Completed Marketplace capability review foundation (2026-08-20)

- Advanced the third requested slice to `Beta-2.0.10` (`2.0.10-beta`). Added
  strict review evidence, deterministic risk grading and default-deny approval.
- Prompt/Theme packages cannot request runtime capability; Skill is limited to
  workspace read; undeclared approvals fail; `process.spawn` and `secrets.read`
  are globally rejected for Marketplace v1.
- Approval evidence is not runtime enforcement. Activation remains blocked.

## Completed Marketplace transactional installation foundation (2026-08-20)

- Advanced the fourth requested slice to `Beta-2.0.11` (`2.0.11-beta`). Added
  narrow Storage/Registry Ports, private Node staging and a versioned SQLite
  registry with optimistic revisions.
- Installation re-hashes exact source files, writes an exclusive partial tree,
  atomically commits by identity and rolls back bytes when registry commit
  fails. Duplicate identities, stale revisions, symbolic-link sources and
  unapproved capabilities fail closed.
- The coordinator is Main-only and not constructed by production composition.

## Completed Marketplace uninstall and restart recovery foundation (2026-08-20)

- Advanced the fifth requested slice and consolidated version to `Beta-2.0.12`
  (`2.0.12-beta`). Exact-revision uninstall removes bytes before deleting its
  record and persists failure instead of reporting false success.
- Restart recovery reconciles real persisted `installing`, `removing` and
  `failed` state against identity-bound partial/final storage. Corrupted
  recovery JSON fails closed.
- The five slices remain absent from Renderer, Preload, Worker, IPC and the
  production Marketplace composition root. Activation/sandbox enforcement,
  update policy, UI wiring, signed Catalog publication and packaged end-to-end
  qualification remain before the Marketplace becomes a delivered feature.
- Consolidated verification passed with 336 test files / 1206 tests, strict
  TypeScript, the formal Electron production build, unchanged performance
  ceilings (1.73 MiB initial Renderer; 22.99 MiB total), matching Electron
  native dependencies and zero production dependency vulnerabilities. No
  installer or portable package was generated.

## Completed Marketplace activation authority foundation (2026-08-20)

- Advanced to `Beta-2.0.13` (`2.0.13-beta`). Added strict Shared activation
  evidence, a persistent SQLite activation registry and a coordinator depending
  only on installation, installed-package, registration and evidence Ports.
- Activation binds the exact installed revision, embedded manifest identity and
  approved capability set. Runtime registration is rolled back if evidence
  cannot commit, and evidence survives a real database restart.
- Plugin activation explicitly fails closed because no isolated third-party
  code sandbox exists. This slice is activation authority infrastructure, not a
  production-wired resource consumer.

## Completed Marketplace two-phase update foundation (2026-08-20)

- Advanced to `Beta-2.0.14` (`2.0.14-beta`). Added strict update evidence and a
  persistent optimistic-revision registry.
- A candidate must be a newer version of the same source/kind/resource. It is
  installed and switched first while the old installed version remains available
  for rollback. Switch failure removes the candidate; rollback switches to the
  old version before candidate removal; finalize alone removes the old version.
- The switch Port has no production resource consumer yet. The Marketplace UI
  therefore does not pretend that installing a second version is an update.

## Completed production Marketplace package delivery (2026-08-20)

- Advanced to `Beta-2.0.15` (`2.0.15-beta`). Main now composes the pinned
  Catalog trust root, bounded HTTPS staging, signature/digest verification,
  safe ZIP preparation, embedded Manifest verification, evidence binding,
  capability review, transactional installation and restart recovery.
- Added strict public install/list/uninstall contracts and narrow IPC. Renderer
  can provide only Catalog identity/revision and explicit capability approvals;
  URLs, paths, storage keys, database handles and infrastructure Ports remain in
  Main. Catalog identity is resolved again before network access.
- Marketplace UI loads installed state and exposes Install, capability approval
  and confirmed exact-revision Uninstall. Temporary staged/extracted resources
  are cleaned on success and failure. Update remains visibly unavailable until
  its consumer switch Port is production-wired.

## Completed local delivery qualification and publication hold (2026-08-20)

- Consolidated the four slices as `Beta-2.0.16` (`2.0.16-beta`). A real
  ephemeral-key test creates a signed ZIP and runs download, Ed25519/SHA-256
  verification, extraction, Manifest binding, installation, public listing and
  uninstall through the production delivery composition with no residue.
- Hardened production-owned directories against symbolic-link/junction escape
  and added a real failure-path test.
- Added strict publication qualification evidence. Empty or expiring Catalogs,
  installation recovery residue, resource kinds without production consumers,
  and plugins without an isolated sandbox block publication readiness.
- This release delivers verified package install/list/uninstall, not arbitrary
  plugin execution or active Prompt/Skill/Theme consumption. Activation and
  update foundations remain production-unreachable until their resource-specific
  consumers exist. Official signing/publication remains an offline human step;
  no private key was read and no installer or portable package was generated.
- Consolidated verification passed with 349 test files / 1231 tests, strict
  TypeScript, the formal Electron production build, the performance budget
  (1.73 MiB initial Renderer; 4.18 MiB largest application chunk; 23.10 MiB
  total), matching Electron native dependencies and zero production dependency
  vulnerabilities.

## Completed local Marketplace runtime slices (2026-08-21)

- Consolidated the resource-contract, activation/consumer, update/rollback and
  capability-free Wasm v1 slices as `Beta-2.0.20` (`2.0.20-beta`).
- Added strict Prompt, Skill, Theme and Plugin payload contracts plus
  install-time manifest evidence. Activation re-verifies installed manifest and
  entrypoint bytes and rejects modification, deletion, replacement or legacy
  records without the required evidence.
- Production Main now restores exact activation evidence after restart. Active
  Prompt/Skill guidance reaches the Agent through a narrow Port; Theme output is
  restricted to semantic tokens; Renderer receives only validated IPC DTOs.
- Added production update delivery with candidate activation, durable ready
  evidence, restart replay, exact rollback and explicit finalize cleanup.
- Added a bounded Wasm v1 Plugin sandbox with a fixed host ABI, no ambient
  filesystem/network/process/secret capability, resource-limited Worker
  execution, output bounds and a hard timeout. Arbitrary JavaScript and Wasm
  memory/table/start sections fail closed.
- Added Marketplace qualification to production IPC/UI. Official Plugin
  publication deliberately remains blocked until independent sandbox review;
  an unavailable or unsigned official Catalog also remains unavailable rather
  than silently falling back.
- The local code path is covered by strict schemas, structural boundaries, real
  tamper failures, timeout failures, restart recovery and signed-ZIP delivery.
  Official catalog signing/publication, packaged release qualification and the
  independent security decision remain release operations, not completed code
  features.
- Consolidated verification passed with 355 test files / 1248 tests, strict
  TypeScript, the formal Electron production build, production-build Now smoke,
  matching Electron native dependencies, the performance budget (1.73 MiB
  initial Renderer; 4.18 MiB largest application chunk; 23.17 MiB total) and
  zero production dependency vulnerabilities. No installer or portable package
  was generated.

## Completed external release engineering prerequisites (2026-08-21)

- Consolidated this repository-owned slice as `Beta-2.0.21`
  (`2.0.21-beta`). It adds release infrastructure, not a published release.
- Added a manual-only, protected Windows release workflow. The release config
  forces Authenticode signing, uses GitHub Releases in the public source
  repository and creates a draft Beta release. Missing signing authority fails
  closed instead of producing an unsigned public artifact.
- Added a bounded preflight with repository, operator and artifact scopes. It
  checks Git traceability, secret presence without printing values, installed
  electron-builder Schema validity, signed NSIS/update files and Authenticode
  status.
- Exported the reviewed Figma `Type=AppIcon` vector, pinned its SHA-256 and
  qualified it through the official electron-builder converter as a 256px
  Windows ICO without fallback.
- Added security/support/contribution/changelog policy and a step-by-step
  external release runbook. Public source and signed Releases share
  `QT7-C23/Pivot`; the existing Marketplace repository stays separate.
- Verification passed with 357 test files / 1259 tests, strict TypeScript,
  formal build, performance budget, matching Electron native dependencies,
  production-build Now smoke and zero official npm production vulnerabilities.
- No installer, portable package, Git tag or release was generated. A trusted
  certificate, protected GitHub authority, independent project Git root, two
  signed-version upgrade/rollback drill, official Catalog ceremony and
  independent Plugin sandbox decision remain external operations.
