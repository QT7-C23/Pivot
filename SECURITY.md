# Security policy

## Supported versions

The latest published Beta-2.x release receives security fixes. Older internal
builds and unpublished development snapshots are not supported distribution
channels.

## Reporting a vulnerability

Use GitHub private vulnerability reporting in the official public source
repository, `QT7-C23/Pivot`. Do not open a public issue for a suspected
vulnerability and do not include API keys, private files, tokens, certificates
or exploit data in public discussions.

Include the affected version, operating system, impact, minimal reproduction
steps and any relevant sanitized logs. Maintainers will acknowledge a valid
private report, coordinate remediation and publish an advisory when users have
a safe update path.

Marketplace package concerns should identify the catalog revision, package ID,
version and artifact SHA-256. Never send the Marketplace private signing key.

## Release integrity

Official Windows releases are Authenticode-signed and distributed through the
`QT7-C23/Pivot` GitHub Releases channel. Treat unsigned installers, unexpected
publishers or mismatched SHA-256 values as untrusted.
