# Pivot module boundary contract

Pivot uses Ports and Adapters to prevent feature work from turning the application into a coupled graph of implementation details.

## Dependency direction

```text
Renderer / Main use cases
          ↓ depend on
       Port interfaces
          ↓ implemented by
Infrastructure adapters (SQLite, process, network, provider)

Shared contracts define values and protocols.
Shared contracts never import Main, Renderer or infrastructure.
```

## Required separation

| Concern | Contract | Implementation |
|---|---|---|
| Blackboard | Reader/Writer/Admin Ports | SQLite store |
| Plugin permission | Capability Grant contract | Main HMAC grant service |
| Provider execution | Agent/Provider Port | AI SDK or CLI adapter |
| Agent run evidence | Run Event Writer/Reader/Lifecycle Ports | SQLite append-only adapter |
| File mutation | Safe write/checkpoint Port | Main filesystem adapter |
| Future billing | Entitlement Port | Payment/account adapter |

Consumers may know the contract and Port. They must not know the concrete implementation, database schema, process manager, payment vendor or secret storage mechanism.

## Capability narrowing

Do not pass one large service everywhere. Split capabilities:

- Reader versus Writer;
- task-scoped versus run-scoped;
- ordinary use versus Admin lifecycle;
- declaration versus runtime grant;
- planning versus execution authority.

The composition root creates an implementation and hands each consumer the narrowest interface. This makes forbidden operations unavailable by construction.

## Regression enforcement

Each new boundary requires:

1. a behavior test for valid use;
2. a failure test for unauthorized or malformed use;
3. a structural test for forbidden imports/dependencies;
4. a restart or persistence test when state is durable;
5. an explicit production wiring test before the feature is called delivered.

Repository-level instructions are recorded in `AGENTS.md`.

## Lifecycle and deletion boundaries

- Session capability revocation is one asynchronous Port. Soft deletion, permanent deletion, Renderer disposal and application shutdown must not maintain separate cleanup lists.
- Watcher disposal is complete only after the underlying watcher `close()` promises settle. Runtime shutdown must await capability disposal before closing databases.
- Permanent deletion accepts only an already soft-deleted Session. It revokes capabilities, cleans Lease evidence, unbinds project ownership, deletes idempotent owned records and deletes the Session record last.
- A failed deletion must leave a soft-deleted, capability-free Session that can be retried. It must not leave an active Session with partial owned-data deletion or a deleted Session with a live binding.
- Agent response text, including tool results, passes the aggregate response budget before `stream:delta` is emitted.
- Agent Runtime receives only `AgentRunEventWriterPort`. Renderer and Worker do not receive the event Reader, lifecycle capability, SQLite Adapter or database handle. Permanent deletion receives only the lifecycle Port.
- Durable tool-start evidence must succeed before a tool executes, and a successful run must persist its terminal fact before reporting completion. See `docs/agent-run-event-foundation.md`.

## Structural growth gates

- Every `src/**/*.ts` and `src/**/*.tsx` file has an 800-line hard ceiling enforced by `tests/shared/source-size-boundary.test.ts`.
- Files above the 400-line review target require explicit inclusion in the reviewed allowlist. New large files fail the structural test until their responsibility boundary is reviewed.
- Composition roots may construct concrete Adapters, but business orchestration, deletion sequencing and resource shutdown belong in focused coordinators behind narrow Ports.
- Audit source snapshots are not production source. `pivot-security-audit/src` and `pivot-security-audit/tests` are excluded from Git and production source discovery so analysis tools do not confuse them with current implementation.
