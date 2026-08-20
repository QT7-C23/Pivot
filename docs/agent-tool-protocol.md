# Agent Tool Protocol

Pivot adapters never read or write workspace state directly. They emit tool requests, and the main process owns permission, execution, checkpoints, and renderer signals.

## CLI Adapter NDJSON

CLI adapters write one JSON object per line to stdout. Stderr is always treated as diagnostic text and can never request tools or permissions. Plain stdout lines remain assistant text.

```json
{"type":"tool","toolName":"fs.readText","input":{"filePath":"D:\\Project\\Tiny Agent Code\\README.md"}}
{"type":"tool","toolName":"fs.search","input":{"rootPath":"D:\\Project\\Tiny Agent Code","query":"agent","limit":20}}
{"type":"tool","toolName":"fs.safeWrite","input":{"filePath":"D:\\Project\\Tiny Agent Code\\notes.txt","content":"hello"}}
{"type":"tool","toolName":"term.run","input":{"command":"npm.cmd","args":["test"],"cwd":"D:\\Project\\Tiny Agent Code","timeoutMs":30000}}
```

Supported tool names:

- `fs.readText`: reads a small UTF-8 text file.
- `fs.search`: searches project file paths while ignoring heavy folders.
- `fs.safeWrite`: writes text through checkpoint-backed safe write.
- `term.run`: runs a non-interactive command through `CommandRunner`.

## Local Runtime Simulation

When no CLI adapter is configured, the local runtime can simulate the same tool events from a chat message:

```text
@pivot-tool fs.readText {"filePath":"D:\\Project\\Tiny Agent Code\\README.md"}
@pivot-tool fs.search {"rootPath":"D:\\Project\\Tiny Agent Code","query":"agent","limit":20}
@pivot-tool term.run {"command":"npm.cmd","args":["test"],"cwd":"D:\\Project\\Tiny Agent Code","timeoutMs":30000}
```

This is an internal beta affordance. It exercises the same runtime path as CLI tools: permission request, tool executor, and stream output.

## Execution Boundary

The flow is:

```text
Adapter event -> AgentRuntime -> PermissionManager -> AgentToolExecutor -> domain service -> renderer signal
```

Important boundaries:

- Adapters express intent only.
- Runtime owns permission ordering and stream phases.
- Tool executor owns tool input validation.
- File writes must use `SafeFileWriter`.
- Non-interactive commands must use `CommandRunner`, not the PTY terminal.
- Only successful writes emit `file:changed`.
