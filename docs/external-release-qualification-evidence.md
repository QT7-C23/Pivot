# Beta-2.0.22 external release qualification evidence

Date: 2026-08-21
Version: Beta-2.0.22 (`2.0.22-beta`)
Scope: repository-owned release engineering only; no installer, portable package,
Git tag, GitHub release or Marketplace Catalog was produced.

## Repository-owned conditions completed

- External Windows publishing is a manual-only GitHub Actions workflow behind
  the protected `external-release` environment.
- Release configuration forces Authenticode signing, keeps executable resource
  editing enabled, emits Beta update metadata and creates only a draft release.
- The approved public Apache-2.0 source repository owns its signed GitHub
  Releases and update metadata. Installed clients embed no GitHub token.
- Certificate, password and publishing token are environment-only authority;
  repository configuration contains no secret value and ignore rules cover
  common private signing material.
- Repository preflight fails closed on missing secrets, missing Git
  traceability, dirty source, unsigned artifacts, missing update metadata and
  invalid Authenticode status.
- Apache-2.0 license, third-party notices, security reporting, support,
  contribution and changelog documents are present.

## Production icon evidence

- Figma file: `Pivot UI V2`
- Component: `Type=AppIcon`, node `1290:451`
- Exported vector SHA-256:
  `C0EE85F726C43B7C8666122CC2FEEF521EA79861FF4C66D76FA2B7C55649459B`
- The generator verifies this digest before composing the exact AppIcon
  geometry as a scalable release asset.
- electron-builder 26.15.3 Schema validation passed for both environment PFX
  and Azure Trusted Signing configurations.
- The official electron-builder icon converter accepted the generated SVG and
  produced a 256px ICO without fallback.

## Automated verification

- 360 test files / 1269 tests passed.
- Strict TypeScript and formal Electron/Vite production build passed.
- Performance gate passed: 1.73 MiB initial Renderer, 4.18 MiB largest
  application chunk, 11.53 MiB largest Worker and 23.31 MiB total JavaScript.
- Electron native dependency verification passed.
- Production-build Dashboard smoke passed in Chinese/light mode at 386 ms
  readiness. Separate Automations and Toolkit runs proved their empty-state
  actions navigate to the real Marketplace route.
- npm official production dependency audit: 0 known vulnerabilities across
  138 production dependencies.
- Repository-only external-release preflight passed.

## External conditions intentionally still blocked

The public source repository, remote traceability, short-lived same-repository
publishing authority and protected `external-release` review environment are
now present. The complete preflight correctly remains blocked until an operator
supplies:

1. either compliant PFX signing authority or Azure Trusted Signing authority;
2. approval of the exact clean release commit in the protected environment;
3. a first signed Beta baseline followed by a real signed previous-to-current
   update/interruption/rollback drill;
4. an independent decision on the Wasm Plugin sandbox before official Plugin
   content publication.

The installed Codex Security connector reported `not_granted` on this date, so
no Plugin sandbox audit was claimed. Enrollment or an external security reviewer
is an operator action.
