# Agent Run Event foundation

Status: production-wired evidence foundation in `Beta-2.0.0`; it is not a replacement for Session messages, Axis Run state, Checkpoints, or a user-facing replay feature.

## Purpose

Pivot records a bounded, append-only fact stream for each Agent Runtime run. The stream makes runtime, permission, tool, failure and abort behavior inspectable across application restart without giving the Worker or Renderer a database capability.

The composition root constructs `SqliteAgentRunEventAdapter` and injects only `AgentRunEventWriterPort` into `AgentRuntime`. Permanent Session deletion receives only `AgentRunEventLifecyclePort`; diagnostics may later receive `AgentRunEventReaderPort`. No IPC currently exposes the reader.

## Contract

The strict Shared discriminated union accepts:

- `run-started` with the exact Adapter/Profile and tool policy;
- non-null `phase-changed` facts;
- `permission-resolved` decisions;
- paired `tool-started` and `tool-finished` facts with bounded output size;
- exactly one `run-finished` terminal fact: completed, aborted, or failed.

Identifiers, timestamps, byte counts, enums and unknown fields are validated at runtime. SQLite assigns one contiguous sequence per Session inside the append transaction. A Run cannot emit facts before start, change Session ownership, start twice, append after its terminal event, or conceal a corrupt persisted payload.

Durable tool-start evidence is written before tool execution. If that write fails, the tool is not executed. A completed Runtime response is not reported before its terminal event is durable. Partial output bytes and the error class are retained for failed Runs.

## Lifecycle

- The SQLite migration is versioned independently at schema version 1.
- Close/reopen restores the ordered event stream.
- Permanent Session deletion removes the Session-owned event facts through the lifecycle Port before deleting the Session record.
- Application shutdown closes the concrete Adapter through the centralized runtime shutdown coordinator.

## Deliberate non-goals

This slice does not make the event stream the canonical chat/model history, expose a Renderer history API, replay tool calls, store prompts/tool inputs/tool outputs, or unify every execution mechanism. Those require separate privacy, retention, capability and replay contracts.

The next compatible slice is a unified Tool Execution Pipeline that consumes narrow execution and evidence Ports. It must not bypass existing permission, Axis authority, File Lease, Checkpoint, Guarded Safe Write, resource-limit, or terminal gates.
