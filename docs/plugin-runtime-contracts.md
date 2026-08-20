# Plugin and external runtime contract foundation

Status: external Runtime SDK foundation; Marketplace Wasm v1 is separately delivered locally  
Code baseline: Beta-2.0.20

Pivot keeps third-party implementations outside the product core. Shared code defines what a plugin or runtime may declare and what evidence it may emit; Electron Main remains the only authority that can issue a runtime grant.

## Contract ownership

| Contract | Owner | Purpose |
|---|---|---|
| `PluginManifest` | shared, parsed by Main | Identity, compatibility, free distribution, declared capabilities, artifact types, source and license provenance |
| `RuntimeAdapterManifest` | shared, parsed by Main | Transport, health timeout, cancellation behavior, environment variable names and requested capabilities |
| `CapabilityGrant` | issued and verified by Main | Signed, short-lived, revocable permission bound to one plugin, runtime, run, session and task |
| `ExternalRunEvent` | shared | Strict started/progress/evidence/artifact/attention/usage/terminal messages without arbitrary secret fields |
| `LicenseEntry` | shared | Immutable source commit, license/NOTICE locations, modification record and dependency review state |

The schemas live in `src/shared/plugin-runtime-contracts.ts`. Main grant issuance and verification live in `src/main/services/plugin-capability-grant-service.ts`.

## Security invariants

- A manifest declares possible needs; it never grants authority.
- Unknown fields are rejected instead of being silently preserved.
- Filesystem scopes are project-relative and reject absolute paths and `..` traversal.
- Network scopes use exact hosts; wildcard hosts and URL-shaped host declarations are rejected.
- Remote HTTP runtime endpoints are rejected. Plain HTTP is permitted only for loopback.
- Runtime manifests carry environment variable names, never environment values.
- Distribution is always `free: true`; commerce fields are rejected by strict parsing.
- Grants are HMAC signed by Main, expire within 24 hours, can be revoked, and are bound to one execution context.
- Main only grants capabilities present in both the plugin declaration and runtime adapter request.
- A grant is not issued until every license entry has a `reviewed` transitive dependency status.
- External events have bounded, typed payloads; unknown fields such as API keys are rejected.

## Current limitations

This slice intentionally does not provide:

- installation, update, uninstall or catalog lifecycle;
- a Renderer or IPC path for requesting grants;
- a secret broker or credential injection mechanism;
- an external process/container launcher;
- persistent revocation storage across application restarts;
- runtime event persistence or contiguous stream aggregation;
- Plugin/Runtime settings UI;
- actual Serena, Scrapling, Strix, RD-Agent, PentAGI or other adapters.

These omissions are fail-closed. A third-party runtime cannot become executable merely by placing a manifest in the repository.

Marketplace packages now have a deliberately smaller execution boundary:
`Beta-2.0.20` can activate and invoke capability-free Wasm v1 entrypoints in a
resource-limited Main-owned Worker. That boundary does not issue the broader
grants above, launch external processes, expose secrets, or turn this document's
external Runtime Adapter foundation into a delivered SDK. Official Plugin
catalog publication remains blocked pending independent review of the Wasm ABI.

## Verification

- `tests/shared/plugin-runtime-contracts.test.ts`
- `tests/shared/plugin-runtime-boundaries.test.ts`
- `tests/main/plugin-capability-grant-service.test.ts`

The tests cover valid contracts, commerce-field rejection, path and network boundaries, endpoint policy, secret-field rejection, source provenance, grant scope, signature tampering, execution binding, expiry and revocation.
