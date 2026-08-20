# Pivot Beta-1.0 internal release qualification

Date: 2026-08-02  
Display version: `Beta-1.0.0`  
Package/updater version: `1.0.0-beta`

## Scope

This record qualifies an internal engineering baseline. It does not claim a
signed public Windows release, a hosted update channel, packaged upgrade
compatibility, or general user reachability for default-off Axis Guarded and
Dynamic Pivot paths.

## Reproducible gate

Run from the project root:

```powershell
npm.cmd run verify:beta1
```

The command intentionally does not invoke Electron Builder distribution tasks
and does not create an installer or portable package. It runs the full MVP
verification, performance budgets and the production-build Now smoke.

## Verified result

- 210 test files and 774 tests passed.
- TypeScript strict checking and the formal production build passed.
- Electron native dependencies matched the active Electron ABI.
- Offline production dependency audit reported zero vulnerabilities.
- Performance gate passed: 13 JavaScript chunks; largest worker 11.53 MiB;
  largest application chunk 4.18 MiB; initial load 1.72 MiB; total 22.61 MiB.
- Production-build Now smoke passed with trusted root/preload, locale `zh-CN`,
  title `Pivot`, desktop tray/shortcut presence, five Now sections and no
  legacy controls.
- `package.json`, lockfile, shared version identity and release-contract tests
  agree on `Beta-1.0.0` / `1.0.0-beta`.
- The repository contains the complete Apache License 2.0 text and includes
  `LICENSE` plus `THIRD_PARTY_NOTICES.md` in build resources.

## Remaining external-release prerequisites

1. Code-signing identity and signed artifact verification.
2. Hosted update-channel credentials and release metadata.
3. A real previous-version upgrade and rollback drill.
4. Packaged Electron E2E after packaging is explicitly authorized.
5. Reliable Git tracking and release traceability for the complete Pivot tree.

These are public/distribution prerequisites, not evidence that the internal
Beta-1.0 engineering gate failed. Default-off Guarded/Pivot capabilities and
the dedicated-Fixer security trigger remain separately scoped product work.
