# Changelog

All notable Pivot changes are recorded here. Versions use legal SemVer in
package metadata and the `Beta-x.y.z` display form in the application.

## [2.0.22-beta] - 2026-08-21

### Added

- Figma V2 dashboard, profile, shared project studio, automation, database,
  Toolkit, Marketplace detail, provider-state, onboarding and navigation
  surfaces backed by owned runtime state or explicit unavailable states.
- A strict local profile-preferences contract with bounded runtime validation.
- A prominent README notice that the public build remains Beta testing
  software and is not a stable production release.

### Changed

- Updated the Figma screen manifest, semantic styling, brand asset, navigation
  hierarchy and production smoke selectors to the current UI design.
- Removed placeholder provider usage, marketplace reviews, automation records
  and database content where no production-owned source exists.

### Fixed

- Persisted onboarding completion across restarts and removed a duplicate
  design-system stylesheet import.
- Restored real empty-state navigation checks instead of treating hard-coded
  E2E booleans as successful Marketplace navigation.

### Known Beta limitations

- Database, Model Hub and Automation creation remain explicitly unavailable
  until their production capability contracts are connected.
- This Beta release is not a stable production release; users should back up
  important work before testing it.

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
