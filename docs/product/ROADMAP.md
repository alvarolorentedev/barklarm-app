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

## Phase 2 — Local diagnosis (implemented, macOS arm64 validated)

Goal: explain a failure and recommend a next action using a local model.

- [x] Deterministic evaluation harness with sanitized fixtures and a held-out set.
- [x] Grounded recommendations with validated citations to evidence.
- [x] Explicit uncertainty and an insufficient-evidence policy.
- [x] Secret, destructive-command and prompt-injection checks.
- [x] Built-in llama.cpp runtime, verified GGUF download and custom OpenAI-compatible providers.
- [x] Opt-in settings, model management and analysis panel.
- [x] Recorded model selection: Qwen3-1.7B-Instruct Q4_K_M.

See [spec 0002](../specs/0002-local-intelligence-engine.md) and [the model report](../evaluations/0001-model-selection.md).
Other managed-runtime targets still need native smoke validation.

## Phase 2.1 — Intelligence hardening (implemented on the hardening branch)

Goal: make Phase 2 reliable, secure, bounded and demonstrably functional before expanding the product.

- [x] Native inference transport under the restrictive CSP; inference TLS isolated from observer compatibility.
- [x] SHA-256 destination consent/credential identity with revocation and atomic import disabling.
- [x] Full request-lifecycle deadlines/cancellation and bounded structured-output fallback.
- [x] Serialized native runtime lifecycle, identity-verified cleanup and active-inference protection.
- [x] Manifest-bound model records, activation-time hash and race-safe download/cancel/remove.
- [x] Unified evidence/analysis retention, stale-result protection and normalized context budgets.
- [x] Production-pipeline evaluations with model safety separated from application safeguards.
- [x] Opt-in real-runtime smoke test and a non-publishing release-candidate workflow.
- [ ] Full interactive inference qualification on every released platform (macOS arm64 validated; others remain work).

See [spec 0003](../specs/0003-intelligence-hardening.md).

## Phase 3 — Intelligent radiator experience (implemented; native interactive qualification partial)

Goal: make the tray the first surface and the full window the detailed surface.

- [x] One tray overlay toggled by a tray click; no separate right-click menu design on macOS/Windows.
- [x] Compact operational summary, prioritized failures, diagnosis and next action in the overlay.
- [x] Full Radiator page, failure detail, evidence citations and agent handoff.
- [x] Deterministic, sanitized, size-bounded coding-agent prompt with preview and explicit clipboard copy.
- [x] Contextual diagnostics and built-in intelligence activation without a wizard or restart.
- [x] Light/dark tokens, compact layouts, English/Spanish and accessible focus behaviour.
- [x] Deterministic mock scenarios and browser acceptance tests for the new experience.
- [ ] Interactive native validation on every released platform; macOS arm64 is recorded, other targets remain Phase 4 work.

See [spec 0004](../specs/0004-intelligent-radiator-experience.md).

## Phase 4 — Release qualification

Goal: qualify the frozen 4.0 experience on every released platform.

- Interactive native smoke on macOS, Windows and Linux; tray overlay, focus/blur, CSP, clipboard, citations,
  intelligence disablement and runtime cleanup.
- Signed/notarized release candidates and the remaining platform matrix work.
- Screen-reader, high-load and large-evidence checks.
- Correct platform qualification claims and close accepted risks or document the residual.
- Real-model evaluation evidence for the release candidate.

## Phase 5 — Product launch

Goal: publish the release and the public product story.

- README, website, screenshots, marketing, SEO and launch materials.
- Release notes and public communication.
- Post-launch feedback and support.

Functional scope is frozen after Phase 3. Later phases qualify and launch the experience; they do not add features.

## Explicit non-goals

Cloud accounts, hosted inference, incident management, on-call scheduling, team collaboration and a mandatory backend
are not on this roadmap.
