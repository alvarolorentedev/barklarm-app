# Architecture overview

Status: implemented behavior of Barklarm 3.x plus Phase 1 diagnostic evidence. Proposed future capabilities are
labelled below and are not part of the current code.

## Runtime shapes

```text
Native (bun run dev / packaged app)
  React (src/mainview)
    -> rpc-client facade (dynamic runtime selection)
       -> desktop/client -> ObserverManager -> extensions/<name>/observer -> fetch-adapter -> Tauri HTTP
                          -> NotificationManager -> Tauri notification plugin
                          -> TrayPresenter -> Tauri tray/menu APIs
                          -> Tauri invoke -> src-tauri/src/store.rs -> config.json
       -> desktop/client -> EvidenceManager -> extensions/<name>/diagnostics -> fetch-adapter -> Tauri HTTP
  StrictMode + HashRouter; tray remains the primary surface when the window is closed.

Browser mock (bun run dev:mock)
  React (same components and pages)
    -> rpc-client facade
       -> runtime/mock -> deterministic scenario states, evidence and namespaced localStorage
  No Tauri imports, network calls, credentials or real user configuration.
```

The facade in `src/mainview/rpc-client.ts` is the only place that chooses a runtime. `import.meta.env.DEV` and
`MODE === 'mock'` gate the mock branch. Desktop modules are loaded through a dynamic import; the production renderer
contains a separate `client.js` chunk but no mock code.

## Layers and responsibilities

| Layer                             | Owns                                                                             | Must not own                          |
| --------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| `src/extensions/<name>/observer`  | Source-specific I/O and status extraction                                        | Persistence, notifications, rendering |
| `src/extensions/<name>/diagnostics` | Optional source-specific evidence provider and extraction                     | Cache, lifecycle, sanitization policy |
| `src/extensions/<name>/component` | Configuration form fields                                                        | Network calls, app state              |
| `src/core`                        | Identity, config normalization, orchestration, notifications, evidence lifecycle, sanitization, payload allowlists | React, Tauri, DOM |
| `src/core/diagnostics`            | Evidence manager, limits, sanitization and normalization                         | Source API details                    |
| `src/mainview`                    | Presentation, interaction, contexts, desktop shell                               | Source-specific fetch logic           |
| `src/mainview/runtime`            | Shared RPC contract and deterministic browser mock                               | Tauri imports, real config            |
| `src/mainview/desktop`            | Tray, dialogs, notifications, autostart, Tauri bridge                            | Core policy decisions                 |
| `src-tauri`                       | Native window/tray/menu, config file I/O, import/export                          | Observer behavior                     |

## Observer lifecycle

1. Configuration is loaded and normalized: every observer gets a persistent `id`.
2. `ObserverManager.setConfigs` builds observers from `ObserversBuildersMap`; build failures are logged and skipped.
3. `refreshState` runs all observers concurrently with a single in-flight cycle. A tick that arrives during a refresh is
   skipped. A configuration change increments a generation; results from the old generation are discarded.
4. Each state is stamped with its configuration `id`. Notifications compare ID and failure event ID, not alias or array
   position.
5. The presenter updates the tray icon/menu; the renderer polls `getObserverStates` every five seconds and maps state by
   observer ID, falling back to array position for legacy test fixtures.

## Configuration and persistence

- Rust owns the config file. On macOS/Linux it lives under the app data directory (`config.json`, mode `0600`); debug
  builds and an existing `canary/config.json` use a canary directory. Legacy locations are copied forward by
  `src-tauri/src/store.rs`.
- TypeScript normalizes on load and before save: defaults are merged, observer IDs are assigned to legacy entries,
  duplicate IDs are replaced, and import/export formats remain JSON objects.
- Import replaces the config file after validating it is a JSON object; export writes the current file. Both can contain
  integration tokens; this is documented in the security guide.

## Extension model

Each integration ships four parts: `type` (configuration shape), `observer` (I/O and state), `component` (form), and
registrations in `observerBuiderMap`, `observersComponentBuilderMap`, `observersTitleBuilderMap` and `observersList`.
New integrations follow that shape; they do not add switches to core.

## State contract

`State` is the presentation contract: `id`, `name`, `status` (`SUCCESS`, `FAILURE`, `CHECKING`, `NA`), `link`, optional
`muted`, `issueEndpoint`, and optional `error.id` / `error.description` / `error.actions`. Source-specific failure IDs
already exist for every integration and drive distinct failure notifications. GitHub IDs include the run attempt.

## Diagnostic evidence (Phase 1)

- An observer may expose a `DiagnosticProvider` and a source scope. The provider owns API calls and credentials; it
  returns a bounded draft. Missing providers report `unsupported`.
- `EvidenceManager` schedules collection after a refresh publishes states, never inside the polling cycle. It keys
  evidence by `observerId + diagnosticScope + failureId`, deduplicates concurrent work, retries transient failures once,
  and cancels on configuration change, removal, resolution or shutdown.
- Evidence is in-memory only: 25 failures, 30-minute TTL, 40 items, 20,000 characters and 4,000 characters per item.
- `normalizeEvidence` strips control sequences, redacts recognizable credentials and enforces size limits before the
  runtime exposes the envelope. Evidence content is untrusted data rendered as text.
- The UI shows a Diagnostic evidence panel inside an expanded failed observer. The setting is opt-in and defaults to
  off. The webhook, tray, notifications and operational status are unchanged.
- Local analysis with citations and uncertainty is still proposed (Phase 2), not implemented. Do not add it to `State`
  or the webhook.

## Build and test surfaces

- Renderer build: `bun run build:renderer` -> `dist/mainview/` (`index.js` entry, `client.js` desktop chunk, CSS
  assets).
- Native build: `bun run build` -> `src-tauri/target/release/bundle/`.
- Unit/component tests: Vitest + jsdom, coverage gates in `vitest.config.ts`.
- Browser acceptance: Playwright against `dev:mock`, artifacts in `test-results/`.
- Native checks: cargo fmt, clippy, tests in CI; release tagging builds all five bundles.

Decisions that changed this shape are recorded in [decisions/](decisions/).
