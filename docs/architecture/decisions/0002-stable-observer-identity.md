# 0002 — Stable observer identity

Status: accepted (Phase 0)

## Context

Observer configuration had no identity. States were matched to configuration by array position, and notifications
matched previous states by display name. Renaming, reordering, duplicate aliases or a failed observer builder could
associate a status with the wrong source or suppress a notification.

## Decision

- Add an optional `id` to `ObserverConfiguration`, assigned by `normalizeObservables` at trust boundaries (config load,
  save, import, mock seed).
- Preserve valid existing IDs; regenerate duplicates and missing IDs. Migration is persisted on the next save.
- `ObserverManager` stamps the configuration ID onto every returned `State`.
- Notifications match by ID when both sides have one; display name remains a fallback for legacy test data.
- The observers list resolves status by ID with positional fallback.

IDs are opaque strings (`crypto.randomUUID` when available). They are not derived from aliases, URLs, positions or
source fields.

## Consequences

- Exported configs gain an `id` field; older Barklarm versions ignore unknown fields.
- Existing configs migrate automatically without data loss.
- An observer whose builder fails is skipped by the manager and shows no status; the UI reports it as unavailable rather
  than assigning another observer's state.
- Configuration compatibility remains JSON-object based; no breaking format change.
