# Internal Beta Readiness

Last automated review: 2026-08-21 (Beta-2.0.21).

## Verified gates

- `npm test`: 357 test files, 1259 behavioral, failure-path, system and structural tests.
- `npm run build`: TypeScript strict check and production Electron/Vite bundles pass.
- `npm run verify:mvp`: tests, build, and Electron native ABI verification pass.
- `npm run verify:performance`: initial Renderer 1.73 MiB; largest application chunk 4.18 MiB; largest Worker 11.53 MiB; total JavaScript 23.18 MiB, all within separate explicit budgets.
- Electron smoke: real BrowserWindow, context-isolated preload, all ten settings pages, missing-CLI maintenance contract, and application-update contract pass; latest packaged settings ready time 0.679 seconds.
- Packaged smoke (`npm run test:e2e:packaged`): welcome, settings, and focused-workbench startup paths pass; the workbench contract verifies a 328 px decision-context panel whose content stretches to the available width.
- Playwright Electron E2E now covers six real flows: conversation streaming, checkpointed Diff acceptance, pointer spotlight behavior, all-free plugin policy, honest unavailable update state, and Preview loading from a local HTTP server with device switching.
- Prior packaged settings, Editor lazy-runtime, and dedicated Preview smoke runs pass. The Editor smoke proves no Monaco instance exists at startup and a real Monaco instance mounts only after opening the IDE Editor; the packaged Preview creates its isolated guest, address bar, and three device viewports.
- Localization follows the product contract: nine language choices switch and persist immediately; Chinese and English fully cover the surfaces localized in this release, while Japanese, Korean, German, French, Spanish, Portuguese, and Russian are visibly marked Beta until technical long-form copy completes human review. The title bar, welcome page, mode strip, session sidebar, Provider editor, and all ten settings pages share one typed locale state.
- Main-window visibility no longer depends on Chromium's `ready-to-show` event: creation is visible by default, while load completion, readiness, and a bounded fallback all explicitly restore, show, and focus the live window.
- Windows user data now uses `%LOCALAPPDATA%\Pivot`, avoiding the legacy Roaming cache and credential state. Persistent database initialization failures fall back to a temporary runtime instead of preventing Renderer creation.
- Windows startup policy defaults to software rendering and disables only the GPU-process sandbox. This prevents the observed `0xC0000135` GPU child-process crash while preserving the Renderer sandbox; `PIVOT_ENABLE_HARDWARE_ACCELERATION=1` is an explicit opt-in override.

## Completed Beta-2.x workflows

- Session FTS search, automatic titles, favorite/archive/unread metadata, tags, groups, fork, YAML/JSON export, and five-second delete undo.
- Project file watching, lazy file tree, right-click create/reveal actions, quick-open search, and project-root path enforcement.
- Checkpointed Agent writes and hunk-level Diff Review with accept/reject/reset.
- Multiple terminals, process ownership cleanup, capped output, and draggable terminal split.
- Persisted Plan generation with a code-enforced read-only policy, three-mode approval gate, step status, pause/continue, and execution.
- BYOK presets/custom endpoint, OS-encrypted keys, connection testing, and Anthropic/OpenAI-compatible streaming runtime adapters.
- First-launch Conversation/IDE choice and Provider/project shortcuts.
- Chat/IDE Preview with address navigation, back/forward/reload, system-browser opening, and desktop/tablet/mobile viewports.
- User-controlled application update state machine with honest unavailable fallback, explicit check/download/restart-install actions, and no silent downloads.
- IDE Editor/Diff and Terminal lazy boundaries with a stable reduced-motion-aware loading placeholder and production size budgets.

## Security invariants

- Renderer has no Node integration and communicates only through the typed preload contract.
- Every IPC request is exact-field validated and trusted-main-frame checked.
- File and terminal requests derive project roots from authoritative sessions.
- Ordinary previews are read-only; Agent writes require permissions, checkpoints, and review records.
- Provider secrets never leave Main, never appear in Provider DTOs, and are not written to logs or exports.
- Planning blocks write/terminal tools in code before permission handling.
- Preview permits remote HTTPS and loopback HTTP only; Main strips guest preload/Node access, forces sandbox and web security, and denies permissions, downloads, popups, and unsafe redirects.
- Application updates are owned by Main, enabled only when packaged release metadata exists, and exposed through exact-field IPC. Automatic download is disabled; check, download, and restart installation remain explicit user actions.

## External release boundary

- The repository-owned release path is qualified: signing is forced, publishing
  is manual/protected/draft-only, update artifacts target GitHub Releases in
  the public source repository, and the reviewed Figma production icon converts
  to Windows ICO.
- The canonical `QT7-C23/Pivot` source repository is required to be public under
  Apache-2.0; `package.json` remains npm-private only to prevent accidental
  registry publication.
- The complete preflight remains blocked without an independent Pivot Git root,
  remote traceability, protected GitHub publishing authority and trusted Windows
  signing authority.
- A signed installer has not been generated in this slice. Public distribution
  still requires two real signed versions for previous-to-current update,
  interruption and rollback evidence.
- Official Marketplace Plugin publication remains held for an independent Wasm
  sandbox security decision and the offline Catalog signing ceremony.
