# Pivot engineering guardrails

These rules apply to every human or AI change in this repository.

## Module contracts

- Depend on interfaces, not implementations.
- Put cross-process and cross-module data contracts in `src/shared`.
- Name capability boundaries as `*Port`; name infrastructure implementations as `*Adapter`, `*Store`, or `*Registry`.
- A consumer receives only the narrowest Port it needs. Do not pass an Admin service to a Worker or Renderer.
- Only the application composition root may construct concrete infrastructure adapters.
- Do not read or mutate another module's private state, Zustand store, database handle, cache, or global object.
- Do not import Main or Renderer code from `src/shared`.
- Do not import Main implementation files from Renderer code.
- Compatibility logic belongs in an Adapter, not in domain contracts or business policies.

## State and persistence

- Use immutable values across module boundaries.
- Use explicit ownership fields and binding objects for run/session/task state.
- Use optimistic revisions or transactions for concurrent mutable state.
- Database schema changes require a versioned migration and recovery test.
- External processes, plugins and model output are untrusted input and must pass strict runtime validation.

## Tests as architecture enforcement

- Write the capability and regression test before implementation.
- Add a structural test for every new dependency boundary.
- Test authorization, ownership, stale revisions, malformed input, restart recovery and failure paths.
- Never make a test green by weakening the asserted contract.
- A type, service, or Figma screen alone is not a delivered feature; require production wiring, user reachability and real behavior tests.

## Change discipline

- Keep modules focused and below 800 lines; prefer 200–400 lines.
- Do not add payment, entitlement, plugin execution or external runtime behavior as scattered flags.
- Material product-policy changes require an ADR and a single owned contract boundary.
- Run the relevant targeted tests, the full test suite, TypeScript build and performance budget before declaring completion.

