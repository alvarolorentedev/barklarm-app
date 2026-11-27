# 0018 — Radiator presentation projection

## Status

Accepted. Superseded in part by [0020 — Dedicated tray window with a main-owned state bridge](0020-dedicated-tray-window.md)
for window ownership.

## Context

Operational state, diagnostic evidence and validated analysis already exist as separate contracts owned by
`ObserverManager`, `EvidenceManager` and `AnalysisManager`. Phase 3 needs to present them together in a tray overlay
and a Radiator page without creating a second source of truth or a parallel state machine.

## Decision

Presentation is a read-only projection:

- `src/core/presentation/radiator.ts` derives counts, failure ordering, health state and failure rows from existing
  snapshots. It is pure and platform-neutral.
- The overview (tray and full Radiator) reads only `State` and renders counts plus observer rows. It does not read
  evidence or analysis.
- Failure detail coordinates snapshot reads for its selected failure in the presentation layer. It only reads; it never
  schedules collection, analysis, notifications or inference.
- Snapshots are accepted only when their observer/failure identity matches the current operational failure.
- Failure detail owns polling for transient states. The overview does not poll snapshots.
- The tray overlay and the full Radiator render the same projection. The overlay is a different shell, not a different
  model.

## Consequences

- No new global state library, evidence manager or analysis manager.
- Derived values can change without mutating operational state.
- Stale results are discarded in one place.
- A future client can reuse the projection without importing React or Tauri.

## Amendment

The overview is summary plus observer rows; top-level diagnosis and its shared snapshot coordinator were removed.
Evidence/analysis reads and polling are scoped to the failure detail. The projection and its identity rules are
unchanged. ADR 0020 moves the tray into a dedicated window; the tray reaches this projection through the main-owned
RPC bridge rather than a second set of managers.
