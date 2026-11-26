# Architectural invariants

These are review rules. Each has an enforcement mechanism where practical; a change that violates one needs an ADR and
explicit approval.

| #   | Invariant                                                                                                                                      | Enforcement                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | Core and observer/type code never imports React or Tauri.                                                                                      | ESLint `no-restricted-imports` overrides          |
| 2   | Only `src/mainview/desktop/**` and the runtime facade may import `@tauri-apps/*`.                                                              | ESLint override                                   |
| 3   | Observers retrieve status and source evidence; they do not persist, notify or render.                                                          | Code review; observer tests                       |
| 4   | Core owns orchestration, state transitions, identity, notification policy and outbound payloads.                                               | Code review; `src/core` coverage gate             |
| 5   | Every observer configuration has a persistent `id`, independent of alias, name or position. Legacy configs migrate on load.                    | `normalizeObservables` tests; manager tests       |
| 6   | Concurrent refreshes are coalesced; interval ticks during a refresh are skipped; results from a superseded configuration are discarded.        | `observer-manager` regression tests               |
| 7   | Notifications are emitted on status changes and on a new source-specific failure ID while already failed; never repeatedly for the same event. | `notification` tests                              |
| 8   | `State` carries operational status and minimal evidence only. Diagnostic evidence and future analysis get separate types and contracts.        | ADR + review                                      |
| 9   | Outbound issue payloads are allowlisted. Adding a field to `State` never adds it to the webhook. Endpoints must be HTTP(S).                    | `issue` payload tests                             |
| 10  | Integration responses and future evidence are untrusted: no execution, no secret expansion, bounded rendering.                                 | Security review; fixtures                         |
| 11  | The mock runtime implements `AppRPCClient`, imports no Tauri module, uses only namespaced localStorage and is absent from production bundles.  | `mock` tests; `check:mock-isolation`; build guard |
| 12  | Configuration formats stay backward compatible. Import/export remain valid JSON objects and unknown fields survive normalization.              | `config` tests; Rust store tests                  |
| 13  | Browser tests are deterministic: mock scenarios only, no arbitrary sleeps, fixed locale.                                                       | Playwright config and review                      |
| 14  | Native-only behavior is validated by Rust checks and CI; it is never simulated into a false pass.                                              | CI `rust` job; release builds                     |
| 15  | A behavior change updates the closest document; a boundary change adds an ADR.                                                                 | Pull request checklist                            |
| 16  | Diagnostic collection is opt-in, non-blocking and bounded; it never changes operational status, notifications or outbound payloads.            | `evidence-manager` tests; Playwright scenarios     |
| 17  | Desktop inference uses the injected Tauri HTTP transport; it never falls back to browser `fetch` and never inherits observer `sslDisabled`. | Transport tests; desktop client review |
| 18  | Managed runtime start/stop is serialized; a stale marker alone never authorizes signalling a process.                                           | Rust lifecycle/identity tests; native smoke |
| 19  | Model activation requires a manifest-bound record and a full SHA-256; lightweight status checks do not hash every refresh.                     | Rust verification tests; native smoke |
| 20  | Evidence expiry/eviction/recollection invalidates analysis; retention is pruned independently of UI reads.                                       | Evidence/analysis tests |

## State boundaries

- **Operational status** (`Status` + `State`): what the user sees now.
- **Diagnostic evidence** (`src/types/Diagnostics.ts`): bounded, sanitized source context for a specific failure. It is
  opt-in, in-memory and never enters `State` or the issue webhook.
- **AI analysis** (`src/types/Intelligence.ts`): a separate, validated, evaluation-tested interpretation with citations
  and uncertainty. It is memory-only and never enters `State` or the webhook.

Do not merge these into one mutable object. Do not build incident management.

Presentation is a fourth, derived view: it may combine the three contracts for display, but it owns no lifecycle,
persistence or outbound payload. The tray overlay and the full Radiator render the same projection.

## Data boundaries

- Configuration is user data and may contain credentials. Do not log, export implicitly, or transmit it.
- Integration responses are untrusted input.
- Issue endpoints are user-configured and receive only allowlisted fields.
- Diagnostic evidence is untrusted, sanitized, bounded and memory-only. It is sent only to the selected inference
  provider after opt-in; never persisted, exported, sent to telemetry or added to the webhook.
- Model output is untrusted. Render as text, never HTML or executable content; never follow generated commands or URLs.
- Inference transport is native (Tauri HTTP) under the production CSP; observer SSL compatibility never applies to inference.
- Managed runtime ownership is identity-verified; model activation is manifest-bound.
- Mock data is synthetic and must never read or write real configuration paths.
