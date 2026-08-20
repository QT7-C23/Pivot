# Pivot UI V2 shell and Now dashboard

Date: 2026-07-30  
Code baseline: Beta-0.1.55 (`0.1.55-beta` package SemVer)  
Design source: Pivot UI V2 Figma file `vsi6Wm7yOPOSBGytQxHOqv`

> 2026-08-02 implementation directive: Figma is now the UI and functional
> target. The historical adaptation notes below explain the Beta-0.1.55
> decision, but no longer authorize silently diverging from current Figma
> nodes. Differences must be implemented or recorded as explicit gaps.

## Delivered production behavior

1. The application uses one stable global rail on every route. Settings no longer substitutes Home/Auto/Market aliases or hides Work and Artifacts.
2. The titlebar follows the Figma V2 `44px` shell, centered command affordance, compact brand treatment and warm neutral token system.
3. Now is a production data-backed dashboard rather than a static demo:
   - Attention is derived from unified attention records plus the current recoverable error.
   - Local / Remote Runs counts active `RunRecord` values.
   - Completed counts delivered or review-ready work.
   - Recent Artifacts uses real `ArtifactRecord` values.
   - Continue uses real recent sessions and opens the selected session.
4. The dashboard uses the Figma hierarchy: four compact summary cards, a primary work column and a narrow run/artifact evidence column.
5. Responsive behavior is owned by CSS breakpoints: activity collapses before context; the dashboard collapses before its summary cards; the global rail remains available.

## Product-contract adaptations

The Figma file is a visual reference, not runtime authority. This implementation intentionally does not copy:

- the generic SaaS Dashboard's invented statistics, calendar or release notes;
- the historical Chat/IDE split as separate products;
- the Automations screen's CI/CD controls;
- sample provider identities, file capabilities or process logs;
- the known broken compact-layout example.

Current Session, Task, Run, Artifact, Review and Attention contracts remain authoritative. Renderer receives no database handle, Admin Port or new filesystem capability.

## Explicit non-delivery

- The centered command affordance does not add a command-palette service in this slice.
- This slice does not complete removal of every legacy Chat/IDE state field.
- It does not implement all Figma frames or treat design-only controls as delivered capability.
- It changes no Main, Worker, IPC, database or Guarded Safe Write authority.
- No installer or portable package was generated.

## Verification

- Vitest: 163 files / 651 tests passed.
- TypeScript strict no-emit and Electron production build passed.
- Performance budget passed: 13 JavaScript chunks; largest worker 11.53 MiB; largest app chunk 4.18 MiB; initial Renderer 1.72 MiB; total 22.37 MiB.
- Electron native dependency validation passed.
- Production-build Now smoke passed with light theme, `48px` rail items, no legacy project controls and five live sections.
- Settings V2 Electron E2E passed with all 17 navigation entries and stable provider layout.

## 2026-08-02 General settings foundation

- Re-read current Figma node `71:1735` and aligned the Settings sidebar and
  General page to its icon-free navigation, 32px search control, 32px content
  rhythm and 27px selects.
- Replaced Renderer-only local storage for the seven General values with a
  strict shared version-1 contract, narrow Main Reader/Writer Ports, a
  versioned SQLite Adapter and optimistic revision checks.
- Added strict IPC validation, a narrow Renderer client and application-start
  locale synchronization. Renderer still receives no database, Admin Port or
  filesystem capability.
- Kept startup-page selection, session restoration, tray-minimized launch,
  idle timeout and notification delivery as explicit policy-wiring gaps. Their
  values persist, but this slice does not claim that all policies execute.
- Lazy-loaded Settings and its validators after the initial Renderer entry
  exceeded the unchanged performance gate. The final initial chunk is 1.56
  MiB; the budget was not weakened.
- Current Figma node `324:6487` supersedes deleted historical rail node `60:4`
  and specifies Home, Projects, Auto, Docs, Market, Ext, Settings and Help plus
  an avatar. The current production rail still exposes Now, Projects, Work,
  Artifacts, Automations, Extensions and Settings. This is the next explicit
  UI/function slice, not part of the delivered General foundation.

## 2026-08-03 current Rail, Docs/Help and Attention slice

- The production Rail now follows the current Figma order: Avatar, Home,
  Projects, Auto, Docs, Market, Ext, Settings and Help. Work, Artifacts,
  Sessions and Runtimes remain typed routes reached from their owning product
  surfaces.
- Docs & Files node `549:3877` is backed by the active project file tree and
  opens a selected document through the existing project-scoped file service.
  No direct filesystem or Main implementation dependency was added.
- Help node `248:5476` provides local search and routes every visible action to
  an existing application destination.
- Marketplace `187:3639` and Extensions `549:3543` now have distinct route and
  presentation modes, but only display authentic configured resources. The
  Figma sample catalog and commerce-like install counts are not production
  data and were not copied.
- Additional Interfaces nodes `74:1976` and `425:6216` are represented by a
  persistent alert plus Attention Queue. Dismissed items remain in the queue
  and can be reopened; the queue is projected from actual runtime error and
  permission-request state rather than demonstration rows.
- Durable Attention history, resolved/reopened workflows, remote catalog
  discovery, extension installation/update and profile/command-palette
  behavior remain explicit future contracts.
- Final verification passed with 219 test files / 796 tests, the formal
  TypeScript/Electron build, the unchanged performance gate, native dependency
  matching, and both Now and Settings production smoke paths.

## 2026-08-03 Feedback local outbox

- Added current Figma node `577:2787` as the Settings Feedback page, including
  type, four-level priority, title, description, attachment selection and
  real local history.
- Attachment paths and bytes stay in Main. Renderer receives strict opaque
  metadata only; unsubmitted removal deletes the staged BLOB immediately.
- History contains only records submitted through the production IPC path.
  Figma sample tickets and their remote workflow states were not copied.
- The Settings production smoke now checks all 18 entries in exact Figma
  order and verifies that Feedback is reachable.
- A remote feedback transport and remote ticket-state synchronization remain
  separate future contracts.

## 2026-08-03 durable Attention lifecycle

- Additional Interfaces nodes `425:6244`, `425:6268` and `425:6287` now map to
  a real queue detail surface and resolved/reopened lifecycle states.
- The queue is hydrated from a versioned Main SQLite Adapter. Current runtime
  errors and permission requests are idempotent observations; no Figma sample
  incidents are inserted.
- Dismiss resolves a persisted record with an expected revision. Reopen is a
  real lifecycle transition, and a recurring observation automatically marks a
  previously resolved record as reopened.
- Runtime and permission buttons route to existing Runtimes and Sessions
  owners. The Attention feature does not reconnect a process, decide a
  permission, touch files or acquire an Admin capability.
- Final verification passed with 231 test files / 826 tests, the formal
  TypeScript/Electron build, the performance gate, native dependency matching,
  and both Now and Settings production smoke paths.
