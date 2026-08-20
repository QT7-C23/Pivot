# Pivot Figma General preferences foundation handoff

Date: 2026-08-02  
Version remains: `Beta-1.0.0` / `1.0.0-beta`  
Design source: Pivot UI V2 `vsi6Wm7yOPOSBGytQxHOqv`, node `71:1735`

## Delivered engineering slice

1. `src/shared/application-preferences.ts` owns a strict version-1 runtime
   contract for all seven General settings and rejects unknown or empty updates.
2. `ApplicationPreferencesReaderPort` and `ApplicationPreferencesWriterPort`
   are the only application-facing Main capabilities. The concrete SQLite
   Adapter is constructed and closed in the Main composition root.
3. The Adapter owns a versioned migration, singleton immutable snapshot,
   optimistic revision update and real SQLite reopen recovery.
4. IPC requests and responses are strictly validated. Renderer receives only
   the two typed settings channels and no database, filesystem or Admin Port.
5. General settings load from Main, recover authoritative state after update
   failure and synchronize the persisted locale during application startup.
6. Settings and its strict validators are lazy-loaded to preserve the initial
   Renderer budget.
7. The Settings sidebar and General stage match the current Figma structure:
   icon-free entries, 32px search, 32px page rhythm and compact selects.

## Verified failure paths

- malformed persisted JSON fails strict parsing;
- stale revision updates fail without mutation;
- unknown/empty update payloads fail validation;
- Renderer update failure reloads Main-authoritative state;
- dependency tests prevent Renderer imports of Main implementations and keep
  the concrete Adapter in Main composition.

## Validation evidence

- Full Vitest after the implementation: 217 files / 790 tests; one subsequent
  smoke-selector regression test also passes, bringing the current inventory
  to 218 files / 791 tests.
- TypeScript strict and formal Electron production build passed.
- Performance passed without changing budgets: 16 JS chunks; largest worker
  11.53 MiB; largest app 4.18 MiB; initial Renderer 1.56 MiB; total 22.75 MiB.
- Electron native dependency match passed.
- Production-build Now smoke passed.
- Production-build Settings smoke passed and traversed all 17 entries, including
  current provider and About heading structures.
- No installer or portable package was generated.

## Explicit non-delivery and next slice

- `openOnLaunch`, `restoreSessions`, `startMinimized`, `sessionTimeout` and
  `notificationLevel` are durable settings, but their runtime policies are not
  yet wired and must not be described as delivered behavior.
- Historical Figma rail node `60:4` is deleted. Current node `324:6487` defines
  avatar + Home, Projects, Auto, Docs / Market, Ext, Settings, Help. Production
  still exposes Now, Projects, Work, Artifacts, Automations / Extensions,
  Settings.
- Next: define truthful route/feature contracts for Docs, Market, Ext and Help,
  preserve reachability of Work and Artifacts from their designed surfaces,
  then align the global rail and add route-driven Electron tests.
