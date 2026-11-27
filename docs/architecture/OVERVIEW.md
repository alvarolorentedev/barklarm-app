# Architecture overview

Status: implemented behavior of Barklarm 4.0, including Phase 1 diagnostic evidence and Phase 2 local intelligence.

## Runtime shapes

```text
Native (bun run dev / packaged app)
  React (src/mainview)
    -> rpc-client facade (dynamic runtime selection)
       -> desktop/client -> ObserverManager -> extensions/<name>/observer -> fetch-adapter -> Tauri HTTP
                          -> NotificationManager -> Tauri notification plugin
                          -> TrayPresenter -> Tauri tray APIs -> one compact overlay window mode
                          -> Tauri invoke -> src-tauri/src/store.rs -> config.json
       -> desktop/client -> EvidenceManager -> extensions/<name>/diagnostics -> fetch-adapter -> Tauri HTTP
                          -> AnalysisManager -> context/prompt/validator -> managed or custom provider
                             -> Tauri HTTP transport (inference TLS isolated from observer sslDisabled)
                          -> Tauri invoke -> serialized runtime lifecycle, verified model store, credentials
  StrictMode + HashRouter; the tray overlay is the primary surface. The full window is a second mode of the same
  renderer, so there is one ObserverManager, EvidenceManager and AnalysisManager.

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
| `src/core/intelligence`           | Context assembly, prompt, validation, provider adapters, analysis lifecycle       | Native processes, files, credentials  |
| `src-tauri/src/intelligence`      | Runtime supervision, model files/downloads, consent and credential storage        | React, observer policy                |
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

## Phase 3 presentation and handoff

- The default full-window route is `/radiator`; `/radiator/observer/:id` is the failure detail, `/observers` and
  `/settings` remain. `/general` redirects to `/settings`.
- Clicking the tray icon toggles a dedicated `tray` window (`/tray`, `/tray/observer/:id`, `/tray/handoff/:id`). It is
  a separate 380 px borderless webview, content-sized between 200 and 520 px, with the original Barklarm tray visuals.
  The `main` window stays decorated and never becomes the tray.
- The `main` window owns polling, evidence, analysis, notifications and the tray icon. The tray window uses an
  allowlisted local RPC bridge to read that state and invoke actions; it never creates a second manager or runtime.
  Closing either window hides it.
- The tray and full Radiator overview read only `State`; failure detail loads its own evidence/analysis snapshots,
  discards stale results by observer/failure identity and polls only transient states. Reads never schedule collection
  or analysis.
- `src/core/presentation/radiator.ts` derives counts, deterministic ordering and health state from existing contracts.
- `src/core/handoff.ts` composes a deterministic, sanitized, bounded prompt. Trusted instructions and untrusted
  evidence are separated; stale analysis is never included. The desktop runtime exposes clipboard writes behind
  `AppRPCClient`; React never imports Tauri.
- The tray window has Settings/Quit/Open issue/Open source actions, so there is no second native menu view on macOS
  or Windows. Linux keeps a minimal native-menu fallback because Tauri does not emit tray click events there.
- The tray icon and operational colours remain derived from `State` only; analysis never changes them.

## State contract

`State` is the presentation contract: `id`, `name`, `status` (`SUCCESS`, `FAILURE`, `CHECKING`, `NA`), `link`, optional
`muted`, `issueEndpoint`, and optional `error.id` / `error.description` / `error.actions`. Source-specific failure IDs
already exist for every integration and drive distinct failure notifications. GitHub IDs include the run attempt.

## Diagnostic evidence (Phase 1)

- An observer may expose a `DiagnosticProvider` and a source scope. The provider owns API calls and credentials; it
  returns a bounded draft. Missing providers report `unsupported`.
- `EvidenceManager` schedules collection after a refresh publishes states, never inside the polling cycle. It keys
  evidence by `observerId + diagnosticScope + failureId`, deduplicates concurrent work, retries transient failures once,
  and cancels on diagnostic scope change, removal, SUCCESS resolution or shutdown. NA/CHECKING retain the last failure.
- Evidence is in-memory only: 25 failures, 30-minute TTL, 40 items, 20,000 content characters and 4,000 content
  characters per item; other fields have separate caps. A seen marker prevents cache eviction from causing a request
  storm.
- `normalizeEvidence` strips control sequences, redacts recognizable credentials and enforces size limits before the
  runtime exposes the envelope. Evidence content is untrusted data rendered as text.
- The UI shows a Diagnostic evidence panel inside an expanded failed observer. The setting is opt-in and defaults to
  off. The webhook, tray, notifications and operational status are unchanged.
- Analysis is a separate in-memory contract. `AnalysisManager` consumes evidence events, assembles a deterministic
  bounded context, calls a provider, validates schema/citations/secrets and exposes an `AnalysisSnapshot`. It never
  changes `State` or the webhook.
- Intelligence is disabled by default. Managed mode uses a pinned llama.cpp sidecar under a serialized native lifecycle
  and a manifest-bound verified GGUF model. Custom mode uses an OpenAI-compatible endpoint. Remote/private destinations
  require SHA-256-bound consent stored outside the config; the renderer uses the Tauri HTTP transport and never falls
  back to browser fetch. Connectivity tests never include evidence.
- Model output is rendered as text, never executed. Unknown citations, invalid JSON, secrets and destructive commands
  reject the response. See [INTELLIGENCE.md](../engineering/INTELLIGENCE.md).
- Managed-runtime support is per platform; see [the runtime matrix](../evaluations/0002-runtime-platform-matrix.md).

## Build and test surfaces

- Renderer build: `bun run build:renderer` -> `dist/mainview/` (`index.js` entry, `client.js` desktop chunk, CSS
  assets).
- Native build: `bun run build` -> `src-tauri/target/release/bundle/`.
- Unit/component tests: Vitest + jsdom, coverage gates in `vitest.config.ts`.
- Browser acceptance: Playwright against `dev:mock`, artifacts in `test-results/`.
- Deterministic evaluations: `bun run test:evals:mock` runs in `bun run check` without a model.
- Real-model evaluations: explicit `bun run test:evals:local`; results stay under gitignored `evals/results/`.
- Native checks: cargo fmt, clippy, tests in CI; the sidecar job fetches and check-tests the pinned runtime; the
  opt-in `sidecar:smoke:runtime` verifies model hash, loopback binding, auth rejection, real structured inference,
  production validation and cleanup. A manual release-candidate workflow packages all five targets without publishing.

Decisions that changed this shape are recorded in [decisions/](decisions/).
