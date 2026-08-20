# ADR 0002: Use capability-free WebAssembly for Marketplace Plugin v1

Date: 2026-08-21  
Status: Accepted for local Beta execution; official Plugin publication remains security-review blocked

## Context

Pivot cannot treat a Node.js Worker, Electron utility process, or `vm` context as
a security boundary for arbitrary third-party JavaScript. Those environments can
inherit operating-system, Node.js, filesystem, process, network, native-addon or
secret access that is broader than a Marketplace capability grant.

## Decision

Marketplace Plugin v1 accepts only a bounded WebAssembly entrypoint using the
`.wasm` format and the `pivot-wasm-v1` ABI:

- untrusted JavaScript is never evaluated;
- modules may export only executable functions and must provide
  `pivot_plugin_version` and `pivot_run`;
- imports are limited to the explicit `pivot.emit_code(i32)` function;
- memory, table and start sections are rejected;
- package size, output count, worker heap/stack and wall-clock execution are
  bounded;
- non-cooperative execution terminates with its Worker;
- no filesystem, network, MCP, process or secret broker is exposed in v1.

The fixed Worker bootstrap is Pivot-owned code. Plugin bytes are compiled as
WebAssembly and cannot access Node globals or Electron APIs through the ABI.

## Consequences

Zero-capability Wasm plugins can be installed, explicitly activated, invoked and
deactivated locally. Packages requesting runtime capabilities remain rejected.
Prompt, Skill and Theme resources use separate strict JSON consumers.

Official Catalog publication of Plugin entries remains blocked until an
independent security review approves this ABI and implementation. Runtime tests
alone do not grant publication authority. Future capability brokers require a
new ADR, explicit Shared contracts and default-deny Main-owned enforcement.
