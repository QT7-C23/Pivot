# Marketplace package manifest and installation foundation

Pivot treats a signed package, its embedded manifest, every extracted file and
every requested capability as separate evidence. No single one grants install
authority. The original Main-only foundation spans `Beta-2.0.8` through
`Beta-2.0.12`; production delivery, activation, resource consumption, update
rollback and the local Wasm v1 sandbox were added through `Beta-2.0.20`.

## Strict embedded manifest

Every archive must contain a regular `pivot-package.json` no larger than 256
KiB. The Shared schema rejects unknown fields and requires:

- exact source, resource kind, resource ID and version identity;
- one publisher ID;
- one declared payload entrypoint;
- an exact path, byte length and SHA-256 declaration for every payload file;
- a unique bounded capability list.

Manifest paths reuse the archive portable-path contract. The manifest cannot
list itself as payload. File paths and capabilities are unique, including
case-folded path collisions. Main reads the file through a stable regular-file
inspection Adapter and requires its length and digest to match extraction
evidence.

## Evidence cross-binding

`VerifiedMarketplacePackageBindingAdapter` forms a bound package only when all
of the following agree exactly:

1. the verified Catalog entry and package signature Key ID;
2. the signed archive descriptor;
3. the embedded manifest identity and publisher;
4. the extracted `pivot-package.json` evidence;
5. every declared payload path, length and SHA-256 in order.

Absolute real-directory validation is delegated to a narrow Main Port and a
Node Adapter. The policy contains no filesystem implementation dependency.
The resulting `MarketplaceBoundPackagePort` retains only immutable evidence,
the Main-owned root and its cleanup capability.

## Capability review v1

Capability review is default-deny. A capability-bearing package remains
`requires-approval` until every declared capability is explicitly approved.
Approvals not declared by the package are rejected.

- Prompt and Theme packages receive no runtime capability.
- Skill packages may request only `workspace.read`.
- Plugin packages may request bounded UI, workspace, network and MCP
  capabilities.
- `process.spawn` and `secrets.read` are globally rejected for Marketplace v1.

Review evidence binds exact package identity, declarations, approvals, risk,
decision and time. Installation accepts only an exact `approved` decision.

## Transactional installation

The installation coordinator depends only on Storage and Registry Ports.
The Node Storage Adapter:

- owns an existing canonical private Main installation root;
- derives an opaque SHA-256 storage key from strict package identity;
- creates an exclusive random partial directory;
- rechecks source ancestors, regular-file identity, byte length and SHA-256;
- creates private destination files and directories;
- atomically renames complete staging into its final identity directory;
- removes only identity-bound final/partial directories.

The SQLite Registry Adapter owns a versioned migration and optimistic revision
state machine: `installing -> installed -> removing`, with explicit `failed`
evidence. Duplicate identities, stale revisions, invalid transitions and
corrupted persisted JSON fail closed.

If storage or registry commit fails, the coordinator removes staged/committed
bytes and records failure. Cleanup errors are surfaced as aggregate failures.

## Uninstall and restart recovery

Uninstall requires the exact installed revision before transitioning to
`removing`. Bytes are removed before the registry record is deleted. A cleanup
failure becomes durable `failed` evidence instead of a false success.

At Main startup, the recovery Port can reconcile persisted transitional state:

- interrupted `installing` storage is removed and recorded as failed;
- interrupted `removing` storage is removed and the record is deleted;
- failed-record storage residue is removed while the audit record remains.

This is tested through real SQLite close/reopen and real partial/final
directories, including corrupted recovery state.

## Current boundary

`Beta-2.0.20` production-wires verified package download, archive preparation,
manifest/binding review, capability confirmation, transactional install,
exact-revision uninstall, activation/deactivation, restart restoration and
two-phase update/finalize/rollback. Installed manifest and payload bytes are
re-verified before activation, so post-install replacement or modification
fails closed.

Prompt and Skill instructions reach the Agent only after explicit activation.
Themes inject only the strict semantic token set. Plugins accept only bounded
WebAssembly v1 modules with no memory, table, start section or ambient host
capability; execution occurs in a resource-limited Worker with a hard timeout.
Renderer receives only strict IPC DTOs and never receives paths, storage keys,
database handles, trust keys, filesystem Ports or Admin Ports.

The UI exposes Install, explicit capability approval, Activate/Deactivate,
Update, Rollback/Keep update and local Plugin Run. Main resolves resource
identity from the verified Catalog before network access. Startup recovery
restores installations and activation evidence before serving operations, then
replays a durable ready update selection.

This is a locally qualified Marketplace runtime, not an official public
Marketplace release. Publication qualification still blocks Plugin catalogs
until an independent security review approves the Wasm v1 ABI. The official
signed `catalog.json` and packages must also be produced by the offline
private-key workflow and published to the Marketplace repository. Pivot does
not read or store that private key, and it does not silently fall back to an
unsigned or unavailable Catalog.
