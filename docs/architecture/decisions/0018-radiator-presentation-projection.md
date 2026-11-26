# 0018 — Radiator presentation projection

## Status

Accepted.

## Context

Operational state, diagnostic evidence and validated analysis already exist as separate contracts owned by
`ObserverManager`, `EvidenceManager` and `AnalysisManager`. Phase 3 needs to present them together in a tray overlay
and a Radiator page without creating a second source of truth or a parallel state machine.

## Decision

Presentation is a read-only projection:

- `src/core/presentation/radiator.ts` derives counts, failure ordering, health state and failure rows from existing
  snapshots. It is pure and platform-neutral.
- `useRadiatorData` coordinates snapshot reads for failed observers in the presentation layer. It only reads; it never
  schedules collection, analysis, notifications or inference.
- Snapshots are accepted only when their observer/failure identity matches the current operational failure.
- One coordinator owns polling for transient states. Cards do not poll independently.
- The tray overlay and the full Radiator render the same projection. The overlay is a different shell, not a different
  model.

## Consequences

- No new global state library, evidence manager or analysis manager.
- Derived values can change without mutating operational state.
- Stale results are discarded in one place.
- A future client can reuse the projection without importing React or Tauri.
