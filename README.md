# Pivot

Pivot is an Electron-based AI Agent coding workbench. It combines conversation, project files, safe Agent edits, hunk-level Diff Review, multiple terminals, structured Plan execution, and BYOK model providers in one desktop interface.

Current internal build: `Beta-2.0.21` (`2.0.21-beta`).

## Open source

Pivot is open-source software under the Apache License 2.0. The canonical
source repository is `QT7-C23/Pivot`; its GitHub Releases carry signed desktop
installers and update metadata, while `Pivot-Marketplace` contains Marketplace
catalog and package content. The `"private": true` field in `package.json` only blocks
accidental publication to the npm registry—it does not make the GitHub source
repository private.

## Beta-2.0 internal capabilities

- Conversation and IDE focus modes with persistent sessions, FTS search, groups, tags, forks, export, and undoable deletion.
- Project-scoped file access, `.gitignore` support, quick-open search, external file watching, and safe Main-process path validation.
- Read-only file previews plus checkpointed Agent writes and per-hunk Diff acceptance/rejection.
- Multiple isolated `node-pty` terminals with output limits and a draggable terminal split.
- Persisted Plan → approval gate → Execute workflow with automatic, step-by-step, and selective execution.
- Anthropic and OpenAI-compatible BYOK runtimes. API keys are encrypted with Electron `safeStorage` and never returned to the Renderer.
- Figma-aligned settings workspace with Provider, model, Agent, appearance, language, shortcuts, MCP, plugins, Cookbook, and about sections.
- Strict typed IPC validation, context isolation, permission gates, Markdown sanitization, and structural boundary tests.

## Development

Requirements: Windows, Node.js 22+, and npm.

```powershell
npm.cmd install
npm.cmd run dev
```

Validation commands:

```powershell
npm.cmd test -- --run
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:e2e:packaged
npm.cmd run verify:performance
npm.cmd run verify:mvp
npm.cmd run verify:beta2
```

Build a local Windows installer (unsigned unless signing authority is present):

```powershell
npm.cmd run dist:win
```

Build an unpacked Windows x64 application for local distribution testing:

```powershell
npm.cmd run dist:portable
```

The installer is written to `release/`. The external release path is separate,
forces Authenticode signing, publishes a draft in the same public GitHub
repository, and never stores signing credentials in source control. See
[`docs/external-release-runbook.md`](./docs/external-release-runbook.md).

Windows builds default to the compatible software-rendering startup path. Set `PIVOT_ENABLE_HARDWARE_ACCELERATION=1` before launch only when explicitly testing GPU acceleration on a compatible machine.

## Architecture boundaries

- Renderer code communicates with Main only through the typed preload API.
- Session identity is authoritative for file and terminal operations; Renderer-supplied roots are rejected.
- Ordinary file previews are read-only. Agent writes go through checkpoint and review services.
- Provider secrets stay in Main and are encrypted by the operating system.
- Stable architecture and readiness notes live in [`docs/`](./docs/).

## Internal-beta release boundary

`npm.cmd run verify:beta2` runs tests, TypeScript/production build, Electron
native dependency verification, the bundle performance budget, and the
production-build Now smoke path. It does not build an installer or portable
package.

The Beta-2.0 internal baseline is not itself a public signed release. The
repository now contains fail-closed signing/publishing automation and static
release qualification. A trusted Windows certificate, protected GitHub
credentials, independent source-repository traceability, and a real two-signed-
version upgrade/rollback drill remain operator-controlled prerequisites.

## License

Apache-2.0. See [`LICENSE`](./LICENSE) and
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
