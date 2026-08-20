# Unified Work Model

Pivot UI V2 displays work through explicit `TaskRecord`, `RunRecord`, `ArtifactRecord`, `ArtifactReviewRecord`, and `AttentionItem` contracts in `src/shared/types/domain.ts`.

## Ownership

- Session persistence remains owned by `SessionRegistry`.
- Plan persistence remains owned by `PlanRegistry`; `plan:list-all` is the read-only cross-session query used by the Work center.
- Live run state remains owned by the Agent and Chat stores.
- Permission state remains owned by the Permission store.
- Code review state remains owned by the File Review store.
- `projectLegacyWorkItems` is the only compatibility boundary that combines these sources for UI V2. It is pure and must not write to any store.

Renderer components consume `WorkItemSnapshot`; they do not reconstruct task or run state by reading unrelated stores directly.

## Status precedence

The compatibility projection resolves competing legacy states in this order:

1. waiting permission;
2. recoverable runtime failure;
3. active local or remote run;
4. background execution;
5. artifact review ready;
6. paused, delivered, or cancelled plan;
7. plan ready;
8. draft.

This ordering prevents a pending permission or failure from being hidden by a generic running state.

## Migration boundary

Deterministic IDs such as `task:<sessionId>` and `artifact:<reviewId>` are compatibility IDs, not a final persistence schema. A future Task/Run registry can replace the adapter without changing Work-center component inputs. Runtime identity for historical legacy plans is intentionally marked `legacy-unrecorded` when it was not persisted at execution time.
