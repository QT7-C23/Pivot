# Pivot UI V2 implementation gap — 2026-08-21

## Scope and evidence

- Figma file: `vsi6Wm7yOPOSBGytQxHOqv`
- Core Screens page: `2:8`
- Components page: `2:5`
- Current component nodes sampled directly: Button `43:83`, GlobalRail `1337:9921`, SettingsSidebar `1391:11561`
- Current production entry: `src/renderer/pivot-app.tsx`
- A screen is counted as delivered only when it is reachable, receives real state, and has behavior/failure tests. A Figma frame, disabled control, static demonstration value, or unused component is not a delivered feature.

## Current implementation matrix

| Figma area | Production status | Evidence / remaining gap |
| --- | --- | --- |
| Dashboard `1026:8514` | Partially delivered | Reachable and backed by sessions, work items, runs, attention and artifacts. The Figma update banner, dashboard settings overlay and dedicated Agent Activity stream are not wired. |
| GlobalRail `1337:9921` | Partially delivered | One route-driven rail is shared by all views. Figma Database and Toolkit destinations have no production route/capability, so Pivot intentionally does not expose dead buttons. Profile is still an inert avatar. |
| Project Chat / Preview / Terminal | Delivered foundation | Conversation, preview and terminal are real session views. Updated Chat History and Agent-specific overlays still need a focused visual/behavior pass. |
| Project Tasks / Plan / Diff / Runs | Delivered foundation | Work snapshots, plan execution, artifact review and context timeline are data-backed. They are not yet unified under the exact updated Figma tab hierarchy. |
| Command Palette / New Project | Delivered | Both are reachable and behavior-backed. Current Figma node references and responsive polish still need the dedicated overlay pass. |
| Settings: General / Appearance | Delivered | Values persist through application preferences; theme is restored before React paints. |
| Settings: Models & Providers | Delivered foundation | Provider configuration and health states are real. Updated provider-specific frames need visual normalization against the new component variants. |
| Settings: Updates / Shortcuts / Feedback / About | Delivered foundation | Reachable production pages exist. |
| Settings: Runtimes, Agents, Skills, Slash Commands, MCP, Plugins, Downloads, Automations, Privacy, Data, Advanced | Not delivered in Settings | These routes render explicit honest empty states. Some similarly named legacy/demo components exist but are deliberately not mounted because they contain invented values or inactive actions. |
| Marketplace Browse `818:9249` | Delivered foundation | Verified catalog, search, source filter, kind filters, installed/favorites, install/update/rollback/activate/deactivate/uninstall and plugin invocation are real. |
| Marketplace Skills / Prompts / Themes / Plugins | Delivered through catalog filters | These are resource-kind views over the verified catalog rather than separate fake pages. |
| Marketplace Model Hub | Not delivered | Shared marketplace contracts have no model resource kind or model-installation authority. Provider/model settings are not equivalent to a signed model marketplace. |
| Extension detail / changelog / reviews / support | Not delivered | Catalog entries can open their verified manifest, but Pivot has no internal detail/review/support contracts or routes. |
| Marketplace Featured / Top Charts | Not delivered | Catalog contracts do not carry editorial placement, ranking or download metrics. Figma example cards must not be rendered as real data. |
| Automations Home | Honest empty foundation only | The route always receives `items: []` and `runtimeAvailable: false`. No scheduler repository/Port is composed into Renderer. |
| Automations Create Pipeline / Run Log Detail | Not delivered | Requires typed pipeline, trigger, schedule, run and log contracts plus Main adapters and recovery tests. |
| Database Home | Not delivered | No route, narrow database-inspection Port, renderer contract or authorization model exists. Renderer must never receive a database handle. |
| Toolkit | Not delivered | No owned product contract or route exists for the Figma Toolkit surface. |
| Profile Home / Edit / Achievements | Not delivered | The rail avatar has no action and there is no profile persistence/achievement contract. |
| Dashboard Settings overlay | Not delivered | No dashboard-layout preference contract exists. |

## Prioritized capability slices

### P0 — remove misleading or broken affordances

1. Profile entry: either deliver a real Profile route with persisted display preferences, or render the avatar as non-interactive identity until the contract exists.
2. Automation truthfulness: keep Create disabled until a scheduler Port is composed; add an explicit capability explanation and a tested recovery path when the runtime becomes available.
3. Settings inventory: keep all unbacked sections as empty states. Do not mount legacy demonstration components.

### P1 — complete the largest Figma product promises

1. Automation foundation: shared pipeline/run contracts → scheduler Port → Main adapter/store → IPC boundary → Renderer store → Home/Create/Run Detail.
2. Marketplace details: signed detail metadata and changelog first; reviews/support only after an authenticated external service and abuse/moderation policy exist.
3. Database Home: read-only query/inspection contract with strict project ownership and result limits. Never expose database handles or arbitrary SQL to Renderer.
4. Profile: local profile preferences first; achievements only after event ownership, anti-spoofing and persistence rules are defined.
5. Toolkit: write an ADR that defines whether it owns local developer tools, model utilities or marketplace-installed capabilities before adding a route.

### P2 — visual and interaction convergence

1. Normalize all page headers, tabs, cards, empty/loading/error states and overlays onto the component variants from Figma page `2:5`.
2. Recompose Project Chat/Tasks/Plan/Diff/Runs into the updated StudioHeader and tab-bar without duplicating state or routes.
3. Add visual regression coverage at 1440×900, 1100×760 and the supported minimum window size, including 125%/150% zoom and long Chinese/German content.
4. Add actual update-state and agent-activity inputs to Dashboard; do not use static banner or activity examples.

## Completion rule

Each remaining surface is complete only after: strict shared runtime schema, narrow Port, Main composition, Renderer reachability, loading/empty/error/permission states, real failure-path tests, structural dependency tests, responsive checks, TypeScript, full suite, production build and performance gate.
