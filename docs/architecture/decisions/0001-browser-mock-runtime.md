# 0001 — Browser mock runtime

Status: accepted (Phase 0)

## Context

The renderer statically imported the desktop RPC client, which initializes every Tauri plugin at module load. Outside
Tauri `invoke()` rejects, observer loading never completes, and coding agents cannot run, inspect or test the real React
app without a native window, Rust toolchain and platform webview.

## Decision

Keep one React application and one `AppRPCClient` contract. `src/mainview/rpc-client.ts` is a facade that dynamically
imports either the desktop runtime or `src/mainview/runtime/mock.ts`. Mock mode is selected only by
`import.meta.env.DEV && import.meta.env.MODE === 'mock'` (`bun run dev:mock`).

The mock runtime implements the same interface with deterministic scenarios, derives states from stored observer
configuration, and persists only to `localStorage` under `barklarm.mock.v1.<scenario>`. It never imports Tauri, calls
the network, or reads the real config path. A production build tree-shakes the mock branch; `check:mock-isolation`
verifies the bundled JavaScript.

## Consequences

- Agents get a real browser app with deterministic config, status and persistence paths.
- Mock import/export are intentionally unsupported (return `false`); native dialogs are not simulated.
- Scenarios exercise the UI and client interface, not real integration HTTP parsing; observer units and Playwright cover
  those separately.
- Any future runtime (for example a remote demo) must implement `AppRPCClient`, not fork the UI.

## Alternatives rejected

- Mocking `fetch` only: does not solve Tauri initialization.
- A separate demo app: drifts from the real UI.
- Running the native app headlessly: requires native dependencies and cannot be inspected reliably.
