# Roadmap

Status: directional, not a release commitment. Product scope changes require human approval.

## Phase 0 — Agentic readiness (completed)

Goal: make the repository safe and efficient for autonomous agents.

- Reproducible Bun install and a documented quality gate.
- Browser mock runtime with deterministic scenarios and Playwright acceptance tests.
- Stable observer identity, non-overlapping refreshes, distinct failure events.
- Explicit architectural, security and documentation boundaries.
- CI parity across TypeScript, browser and Rust checks.

Exit criteria are recorded in the Phase 0 pull request and the repository definition of done in
[../../AGENTS.md](../../AGENTS.md).

## Phase 1 — Evidence model (implemented)

Goal: capture enough source-specific context to explain a failure without guesswork.

- A typed, bounded evidence envelope separate from `State`; see
  [spec 0001](../specs/0001-diagnostic-evidence-engine.md).
- GitHub Actions collection for the exact run attempt: failed jobs, steps and bounded log excerpts.
- Sanitization, memory-only retention, size limits and an opt-in setting, disabled by default.
- Minimal Observers UI, desktop/mock runtime support and deterministic fixtures.
- Notifications and the issue webhook remain compatible with 3.x; GitHub failure IDs now include the attempt.

Phase 1 does not infer causes. It collects and presents trustworthy evidence.

## Phase 2 — Local diagnosis (next)

Goal: explain a failure and recommend a next action using a local model.

- Deterministic evaluation harness with sanitized fixtures.
- Grounded recommendations with citations to evidence.
- Explicit uncertainty when evidence is insufficient.
- Secret and prompt-injection resistance tests.

Phase 1 evidence, fixture IDs and completeness/limitations signals are the inputs. No model vendor, download mechanism
or runtime dependency is chosen.

## Phase 3 — Evaluated assistance

Goal: ship diagnosis only when evaluations show it is correct, grounded and safe.

- Offline and opt-in evaluation runs; no real models in standard CI.
- Human review of failures and regressions.
- Measured diagnostic correctness, actionability and hallucination resistance.

Not started.

## Explicit non-goals

Cloud accounts, hosted inference, incident management, on-call scheduling, team collaboration and a mandatory backend
are not on this roadmap.
