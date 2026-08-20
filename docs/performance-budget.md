# Renderer performance budget

This document is the stable entry point for Pivot's build-time Renderer performance contract.

## Loading boundary

- Conversation, Settings, and Welcome must not import Monaco Editor or Diff statically.
- `EditorWorkspace` and `FileReviewWorkspace` are dynamic imports behind one stable `Suspense` placeholder.
- Opening the IDE editor or a Diff review is the explicit trigger for loading the shared Monaco chunk.
- Terminal rendering remains a separate lazy boundary.

## Enforced budgets

`npm run verify:performance` inspects real production output and fails when any of these limits is exceeded:

| Artifact | Hard limit | 0.1.11 measurement |
|---|---:|---:|
| Initial Renderer entry | 1.75 MiB | 1.54 MiB |
| Largest non-worker application chunk | 6 MiB | 4.18 MiB Monaco on-demand chunk |
| Largest worker | 15 MiB | 11.53 MiB TypeScript worker |
| Total JavaScript | 25 MiB | 21.93 MiB |

The initial-entry budget is separate from total and lazy-chunk budgets so code splitting cannot disguise overall growth, and overall budgets cannot disguise first-load regressions.

## Verification

- `tests/renderer/ide-lazy-boundary.test.ts` protects the dynamic-import boundary and the initial-entry budget.
- Editor and File Review component tests protect their local contracts.
- Playwright's checkpointed Diff acceptance flow exercises the dynamic imports in a real Electron Renderer.
