# Changelog

All notable Pivot changes are recorded here. Versions use legal SemVer in
package metadata and the `Beta-x.y.z` display form in the application.

## [2.0.21-beta] - 2026-08-21

### Added

- Figma Variables-derived semantic UI tokens and reusable control variants.
- Responsive Marketplace filters and settings navigation aligned to Pivot UI
  V2.
- Fail-closed Windows external-release configuration, protected manual GitHub
  workflow, release preflight, Authenticode artifact qualification and operator
  runbook.
- Explicit environment-PFX and Azure Trusted Signing release profiles with
  independent fail-closed authority checks.
- Reviewed Figma AppIcon source with deterministic high-resolution rendering.

### Changed

- Windows executables now retain application icon/metadata editing and signing
  support. External release builds force a valid signature and publish only to
  a draft Beta channel.

### Security

- Added release-secret ignore rules and public security/support boundaries.
- Kept source publication separate from the public binary update repository.
