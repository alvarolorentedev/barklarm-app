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

## State boundaries

- **Operational status** (`Status` + `State`): what the user sees now.
- **Diagnostic evidence** (proposed, Phase 1): sanitized source context used to explain a failure.
- **AI analysis** (proposed, Phase 2+): a separate, evaluation-tested output with citations and uncertainty.

Do not merge these into one mutable object. Do not build incident management.

## Data boundaries

- Configuration is user data and may contain credentials. Do not log, export implicitly, or transmit it.
- Integration responses are untrusted input.
- Issue endpoints are user-configured and receive only allowlisted fields.
- Mock data is synthetic and must never read or write real configuration paths.
