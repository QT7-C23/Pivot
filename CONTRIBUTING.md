# Contributing to Pivot

Pivot is an open-source project licensed under Apache-2.0. Its canonical source
repository is `QT7-C23/Pivot`. Public visibility does not relax review,
security, release-signing or module-boundary requirements.

All changes must follow `AGENTS.md`: depend on narrow Ports, keep shared
contracts in `src/shared` with strict runtime validation, keep Renderer and
Worker away from Admin/file/database capabilities, write a failing behavioral
test first, and add structural tests for new boundaries. Do not weaken tests to
make a build pass.

Before review, run:

```powershell
npm.cmd test -- --run
npm.cmd run build
npm.cmd run verify:performance
```

Release, signing, entitlement, payment and trust-root changes require explicit
maintainer review and must not be introduced as scattered flags. Never commit
secrets, certificates, private keys, generated release artifacts or local
environment files.
