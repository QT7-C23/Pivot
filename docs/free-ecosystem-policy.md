# Pivot free ecosystem policy

Pivot is an all-free, open ecosystem. Every plugin, Skill, theme, prompt, and workflow distributed through Pivot is free to install and use.

## Distribution contract

- No price, purchase, subscription, trial, license tier, or revenue-share field is permitted in Pivot ecosystem manifests or catalog APIs.
- The official catalog may provide discovery, reviews, signatures, compatibility data, updates, and security reports, but it may not process payments.
- Local installation and sideloading remain first-class workflows.
- Self-hosted private catalogs are supported as a free deployment option; they do not create an enterprise edition or unlock extra product capabilities.
- Authors may link to voluntary sponsorship pages, but sponsorship never gates downloads, updates, documentation, support channels, or functionality.
- Pivot does not reserve closed premium APIs for selected authors. SDK and sandbox contracts are the same for every plugin.

## Enforcement

The application must not expose checkout, purchase, subscription, trial, or paid-tier UI. Future catalog schemas must reject commerce fields during validation. Any proposal that introduces a paid ecosystem tier requires an explicit replacement of this policy and a new ADR; it may not be added as an incidental roadmap item.

As of 0.1.34, the first code-level enforcement exists in `PluginManifestSchema`: `distribution.free` must be `true`, and strict parsing rejects undeclared commerce fields. This is a contract foundation, not evidence that the Plugin SDK or catalog has been delivered.
