# Pivot foundation dependency baseline

This document is the stable entry point for dependencies that implement product-level capabilities. A package is not considered integrated until a Pivot Module owns it through a local Interface and a behavior test covers that Interface.

## Product baseline

| Capability | Dependency / implementation | Pivot Module and seam | Verification |
|---|---|---|---|
| Desktop runtime | Electron | main / preload / renderer process split | build + Electron E2E |
| UI state | React 19 + Zustand 5 | renderer stores and service adapters | store and renderer tests |
| Styling | Tailwind CSS 4 + source-owned Shadcn pattern | namespaced `pv` utility layer, `cn`, source-owned button primitive | UI foundation test + build |
| Editor | Monaco Editor | direct `CodeEditor` / `CodeDiffEditor` adapters | editor and diff tests |
| Terminal | xterm.js + node-pty | `TerminalManager` and terminal service/store | terminal tests |
| Persistence | better-sqlite3 | registries and stores using WAL | persistence tests |
| File watch | chokidar 4 | `ProjectFileWatcher` Interface | normalized event and cleanup tests |
| Ignore rules | ignore | project ignore matcher | full gitignore semantics tests |
| Large file trees | @tanstack/react-virtual | flattened file-tree render seam | structural test + production build |
| LLM providers | Vercel AI SDK Core, provider adapters and Undici | `AiSdkProviderAdapter` behind `AgentAdapter`; `UndiciProviderPinnedRequestAdapter` behind DNS/request Ports | real compatible SSE stream, DNS policy and pinned socket tests |
| Auto update | electron-updater | `ApplicationUpdateService` behind typed update state and IPC contracts | state-machine tests, honest unavailable E2E, packaged smoke |
| Web Preview | Electron isolated guest WebView | `PreviewWorkspace` + `preview-security` behind URL and IPC contracts | URL, guest hardening, renderer structure, Electron E2E |
| Renderer performance | Vite dynamic imports + React Suspense | IDE Editor/Diff and Terminal lazy boundaries | structural contract, explicit production budgets, Diff E2E |
| Unit / integration tests | Vitest | service, store, protocol, structure suites | `npm test` |
| End-to-end tests | Playwright Electron | conversation and Diff review flows | `npm run test:e2e` |
| Build / packaging | Vite, electron-vite, electron-builder | project scripts and NSIS target | build + packaged smoke |

## Axis Engine extension baseline

| Capability | Dependency | Pivot Module and seam |
|---|---|---|
| MCP client | @modelcontextprotocol/sdk | `McpClientSession`, with Streamable HTTP and stdio Transports |
| Runtime contracts | zod | MCP server configuration parser |
| Codex configuration discovery | smol-toml | Codex TOML to Pivot MCP contract adapter |
| Axis Engine contracts | zod | strict `ComplexityReport`, `TaskDag`, result, budget, pivot, and trace schemas in shared code |
| Axis DAG planning | first-party deterministic scheduler | validated topological batches, worker limits, cycle checks, and exclusive file ownership |
| Axis budget enforcement | first-party pure guard | hard token, cost, time, retry, gate-cycle, and pivot stop decisions |
| Axis shadow planning | AI SDK structured output + first-party coordinator | active-Provider planning behind authoritative default-off IPC, strict budgets, no execution authority |
| Axis trace persistence | better-sqlite3 + strict trace schema | per-run/per-session validated audit trail with terminal events |
| Axis plan persistence | better-sqlite3 + strict result schema | per-session Work Center history with validated DAG, schedule, usage, and trace |
| Axis plan lineage and replay | better-sqlite3 + first-party replan coordinator | revision-bound failed/paused/stopped Provider replay, immutable objective/file scope, stale-response rejection, same-revision replay blocking, and crash-recoverable child materialization |
| Axis structured model runtime | AI SDK structured output + conservative pricing | shared planning/Pivot usage accounting, schema-bound output, and escaped untrusted prompt data |
| Axis Dynamic Pivot | first-party policy/coordinator/action Ports + better-sqlite3 | ADR-006 action allowlists, revision and remaining-budget binding, forced hard stops, ordered decision evidence, crash-recoverable state commit, idempotent `replan`, task-scoped failed-task `retry`, durable same-Worker self-repair assignment, different-Worker security Fixer assignment and terminal failed-attempt discard evidence foundations |
| Axis Worker attempt identity | zod + better-sqlite3 | strict Run/Session/task/attempt/Worker binding, optimistic terminal lifecycle, separate Reader/Lifecycle/Assignment Ports, unique decision assignment and restart recovery |
| Axis dedicated Fixer assignment | zod + better-sqlite3 | strict code-owned security Fixer identity, separate Resolver/Assignment Ports, failed source-attempt verification, different-Worker invariant, unique decision evidence and restart recovery |
| Axis Worker discard evidence | zod + better-sqlite3 | strict decision/revision/failed-attempt binding, narrow frozen Port, one immutable receipt per decision, exhausted-continuation-budget acceptance and restart recovery without Run mutation |
| Axis run-state persistence | better-sqlite3 + strict lifecycle schema | durable per-task state, original budget snapshot, optimistic revisions, cancellation/restart audit events |
| Axis Dry-run execution | first-party executor port + coordinator | separately default-off, exact whole-DAG approval, deterministic simulation, hard-budget enforcement, and zero tool/command/file authority |
| Axis quality evaluation | first-party simulation-only evaluator ports | strict Permission, Checkpoint and Reviewer Gate evidence; fail-closed task matching; bounded retries; durable Work Center audit |
| Axis execution authority | Node HMAC + first-party capability service | short-lived Main-only run/session/task/project/tool/file binding with explicit rollback receipts and no Renderer issuance channel |
| Axis authority audit | better-sqlite3 + strict authority schemas | contiguous per-run envelope/receipt records, restart persistence, and session-scoped cleanup |
| Axis Fake mutation | first-party digest-only executor | verifies signed capabilities and emits `fake-mutation` receipts without file content, writer, command, or production tool authority |
| Plugin/runtime contracts | zod + Node HMAC | strict free-distribution manifests, runtime transports, external events, pinned license provenance, and Main-issued short-lived capability grants |
| Axis typed blackboard | zod + better-sqlite3 | explicit Reader/Writer/Admin Ports, task ownership, run/task visibility, append-only facts/evidence, optimistic revisions and restart recovery |
| Axis file ownership leases | zod + better-sqlite3 + Node path/crypto | authoritative project file identity, task-scoped Lease Ports, cross-run write exclusion, TTL, optimistic versions and restart recovery |

## Deliberate implementation choices

- `@monaco-editor/react` is not added. Pivot already owns a deeper Monaco Adapter with explicit worker setup and Diff behavior; adding a second wrapper would duplicate lifecycle ownership.
- AI SDK Core runs in Electron Main, not `useChat` in the renderer. Provider keys remain behind OS secure storage and the renderer continues to receive the existing typed stream contract.
- Tailwind preflight is excluded and utilities are prefixed with `pv`. This prevents the foundation layer from restyling the Figma-aligned UI before components are migrated intentionally.
- Shadcn/ui is source-owned rather than a runtime component package. New shared primitives should use `cn`, CVA, and the namespaced utility layer.
- Auto-update starts only for packaged builds containing `app-update.yml`. Development and portable builds never contact an update feed.
- Auto-update never downloads silently: check, download, and restart installation are explicit About-page actions documented in `docs/update-release-channel.md`.
- React Bits adoption is paused until the dependency foundation and subsequent UI review are complete.
- Axis Dry-run is a contract/evaluation seam, not a production worker. It proves approval, DAG order, lifecycle, failure, cancellation, and budget behavior before any executor receives mutation authority.
- Simulation Checkpoint identifiers are evidence markers only. They do not read project files and are intentionally separate from `FileCheckpointStore` until real execution permission and rollback policy are integrated.
- Authority HMAC keys remain Main-process runtime secrets and are not persisted or exposed over IPC. Current envelopes are short-lived and intentionally unusable after application restart.
- Plugin/runtime manifests declare possible capability needs but never authorize execution. `PluginCapabilityGrantService` intersects manifest and adapter scopes, requires reviewed license provenance, and issues signed run/session/task-bound grants; no plugin execution or IPC route exists yet.
- Axis blackboard consumers depend on narrow Ports rather than the SQLite adapter. Task Ports bind ownership at construction and cannot read another task's private entries or call Admin lifecycle operations.
- File Lease storage depends on an injected file-identity Port and never resolves paths itself. Its task-scoped Coordinator atomically acquires, renews or releases bounded file sets, while a Lease still coordinates ownership only and does not replace permission, Checkpoint, signed authority or rollback.
- Preview intentionally adds no browser wrapper dependency. Electron owns the guest runtime; Pivot owns URL policy, session isolation, navigation controls, and device framing through local Interfaces documented in `docs/preview-security.md`.
- Monaco and Diff remain first-party adapters but load only when the IDE editor is opened. Initial, lazy-chunk, worker, and total budgets are enforced separately in `docs/performance-budget.md`.
