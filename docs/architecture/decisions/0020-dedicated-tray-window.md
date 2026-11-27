# 0020 — Dedicated tray window with a main-owned state bridge

## Status

Accepted.

## Context

The first radiator implementation resized and redecorated one Tauri window to switch between the tray overlay and the
main app. That produced a third visual state when the window was restored to main dimensions while `/tray` was still
active. A native-popover skin reduced the visual mismatch but did not satisfy the product requirement: the tray must
keep its original Barklarm visuals and must not be the same window as the main app.

The renderer currently owns `ObserverManager`, `EvidenceManager`, `AnalysisManager`, polling and notifications. A
second webview cannot share those JavaScript objects.

## Decision

- Create two Tauri windows: `main` and `tray`.
- `main` starts hidden, remains decorated and owns all operational managers, evidence, analysis, notifications and the
  tray icon. Closing it hides it rather than destroying it.
- `tray` starts hidden, is a 380 px borderless window and renders only the tray routes with the original Barklarm
  visuals. It never creates operational managers.
- The tray uses an `AppRPCClient` proxy. Requests carry a correlation id and travel over local Tauri events to an
  allowlisted bridge in `main`; responses return to the originating tray request. Window-local tray actions call Rust
  directly.
- External links and issue actions from the tray execute in `main`, preserving the configured browser policy and the
  existing issue allowlist.
- Both windows share React components and the pure radiator projection, but not a webview, JS context or state owner.

## Consequences

- The main window never changes size, decorations or route to become a tray panel, so the third-window leak is gone.
- Browser selection, tray tooltips, CCTray aggregation and all existing main-window behavior remain in the main owner.
- There are two React roots and a local IPC bridge. The bridge has explicit timeouts and a ready/hello handshake.
- The tray depends on `main` staying alive. Normal close hides `main`; a main-process failure leaves the tray without
  state and must be handled as an unavailable owner.
- No orchestration moves to Rust, no manager is duplicated, and the browser mock keeps using its existing client.
