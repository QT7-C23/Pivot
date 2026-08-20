# Pivot UI V2 route navigation

Assessment date: 2026-07-30  
Code baseline: Beta-0.1.56 (`0.1.56-beta` package SemVer)

## Scope

This slice removes the active Renderer's historical Chat/IDE top-level mode state. It does not change Main capabilities, Guarded Safe Write authority, Runtime execution or Dynamic Pivot production reachability.

## Active navigation contract

- `PivotRoute` is the single top-level application navigation contract.
- `SessionView` is a narrow view inside the Sessions route: conversation, editor, preview or terminal.
- `WorkspaceActivity` is a narrow project/work context preference and cannot select a top-level product mode.
- Keyboard shortcuts resolve through the pure `resolvePivotShortcut` function before the App applies the route target.
- The first-run screen offers one outcome-first entry instead of asking the user to choose between separate Chat and IDE products.

## Figma adaptation

Figma node `365:4658` is used for the project/task hierarchy: Chat, Tasks, Artifacts, Runs, Diff, Preview and Terminal are views within one project context. The implementation keeps Pivot's stable V2 rail and does not import the design file's obsolete product split.

## Boundary evidence

- Renderer navigation imports only Renderer-local types and state.
- Worker and Renderer receive no Main Admin Port, database handle or filesystem capability.
- Main execution, Lease, Fingerprint, Checkpoint and Guarded Safe Write behavior is unchanged.
- CodeGraph post-change review found `resolvePivotShortcut` called by the active App and `PivotRoute` consumed by the shell; no new Main implementation dependency was introduced.

## Verification

- 164 Vitest files, 653 tests passed.
- TypeScript strict and production Electron build passed.
- Performance budget passed.
- Electron native dependency verification passed.
- Production-build Now smoke passed.
- Route-navigation V2 Electron E2E passed.
- Settings V2 17-entry navigation Electron E2E passed.

No installer or portable package was generated.
