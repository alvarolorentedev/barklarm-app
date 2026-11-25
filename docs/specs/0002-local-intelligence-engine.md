# 0002 — Local intelligence engine

## Status

Implemented for macOS arm64 (Phase 2). Other managed-runtime targets are packaged but require native smoke validation. Phase 2
is implemented but not release-ready until cross-platform runtime execution, signed bundles and the remaining evaluation
work are complete.

## Implementation checklist

- [x] Intelligence contracts, analysis lifecycle and evidence-to-analysis boundary (ADR 0009).
- [x] Deterministic context assembler, versioned prompt, output validation and citation checks.
- [x] Provider-independent inference contract and OpenAI-compatible adapter.
- [x] Endpoint classification, remote/private consent and credential handling (ADR 0010).
- [x] Deterministic evaluation harness and expanded fixtures.
- [x] Candidate model evaluation, comparison report and default model selection (ADR 0013).
- [x] Managed llama.cpp runtime, model manifest, verified downloads and lifecycle (ADRs 0011–0012).
- [x] Intelligence settings, model management, provider configuration and analysis panel.
- [x] Deterministic mock scenarios and browser acceptance tests.
- [x] Security review, CSP, documentation and full validation.

## Problem

Barklarm can collect trustworthy diagnostic evidence for a failed GitHub Actions run, but the user must still read the
logs and infer what happened. Phase 2 must explain the failure, cite the supplied evidence, separate facts from
hypotheses and recommend a next action without making cloud inference, accounts or an external AI application mandatory.

## Goals

- A separate, serializable analysis contract with an explicit lifecycle.
- Deterministic, bounded evidence-to-context assembly with preserved evidence IDs.
- A versioned prompt that treats evidence as untrusted data and produces strict JSON.
- A provider-independent inference boundary with a managed local runtime and custom OpenAI-compatible endpoints.
- Strict validation before any model output reaches the UI.
- Evaluation before selecting any default model.
- Opt-in intelligence, disabled by default; no automatic remediation.
- Existing monitoring, notifications and issue webhooks remain independent of inference.

## Non-goals

- Additional diagnostic integrations beyond Phase 1.
- Cross-source correlation, incident history, persistent analysis or a database.
- Agent tools, shell execution, MCP, coding-agent monitoring or automated fixes.
- Cloud accounts, telemetry, a hosted backend or a model marketplace.
- A complete radiator redesign.

## Requirements

1. Analysis is a separate contract from `State` and `DiagnosticEvidence`. It never enters the issue webhook.
2. Analysis lifecycle: `disabled`, `waiting_for_evidence`, `runtime_unavailable`, `queued`, `analyzing`, `available`,
   `insufficient_evidence`, `failed`, with a normalized reason for unavailable states.
3. Evidence is analyzed automatically when intelligence is enabled, deduplicated by a cache identity derived from
   observer, failure, evidence fingerprint, model, prompt version and inference configuration. Collection timestamps and
   credentials are excluded.
4. Context assembly is deterministic: priority order, deduplication, bounded items/content, preserved IDs, re-sanitized
   text, excluded source URLs and filtered metadata. It records selected, omitted and truncated IDs without logging
   content.
5. The prompt separates trusted instructions from JSON-serialized untrusted evidence. The model receives no tools,
   filesystem, shell or credentials.
6. Output is JSON matching a fixed schema: summary, findings, likely causes with `supported`/`hypothesis`, recommendations
   with `investigate`/`potential-fix`/`verify`, evidence sufficiency and uncertainty. No numerical confidence.
7. Every cited evidence ID must exist in the assembled model input. Unknown or omitted IDs invalidate the response.
   At most one bounded repair request is allowed; otherwise analysis is unavailable.
8. Generated content is rendered as text. Commands and URLs are never executed or auto-opened. Secret-like output is
   rejected.
9. Inference is opt-in. Built-in local AI is the recommended mode once enabled. A custom OpenAI-compatible endpoint is
   available without the managed runtime.
10. Managed inference uses a pinned llama.cpp sidecar, a verified GGUF model, loopback-only binding, ephemeral
    authentication and explicit resource limits. No external AI application is required.
11. Remote inference requires explicit per-destination consent stored outside the imported configuration. HTTPS is
    required for non-loopback endpoints. Redirects are rejected. Connectivity tests never include evidence.
12. API keys use OS credential storage and never appear in configuration, exports, prompts, logs or fixtures.
13. Model downloads require explicit consent, show size, verify SHA-256 and size, use temporary files and atomic
    promotion, and never execute downloaded content.
14. Observer polling, evidence collection, notifications and the tray work identically when inference is disabled,
    unavailable or failed.
15. Standard CI is deterministic and requires no model. Real-model evaluations are explicit and recorded.

## UX and operational impact

General gains an Intelligence group with three modes: Disabled (default), Built-in local AI (recommended) and Custom
provider. The built-in flow presents the model, requirements, size and license, then download/progress/verify/remove and
runtime status. The custom flow presents endpoint, model, optional key, destination disclosure and remote/private
consent.

A failed observer's diagnostic panel gains a clearly separated AI analysis section: status, provider/model, summary,
findings, causes, recommendations, cited evidence, uncertainty, limitations and reanalysis. Evidence remains inspectable
and visually distinct from interpretation. Analysis failures never change operational status.

## Data and evidence

Sent to the selected provider: sanitized failure evidence, completeness and limitations, prompt instructions and output
schema. Not sent: observer credentials, application configuration, issue endpoints, unrelated observers, raw API
responses or source URLs not required for diagnosis.

Analysis and context are memory-only, bounded by the evidence TTL and cache limits. No database, incident history or
telemetry. API keys live in the OS credential store. Consent records live outside the config file. Model files live in
the application data directory.

## Architecture and boundaries

- Contracts: `src/types/Intelligence.ts`.
- Core pipeline: `src/core/intelligence/` (context, prompt, validation, manager, providers, endpoint policy).
- Evidence event: additive callback on `EvidenceManager`; no polling coupling.
- Presentation: `src/mainview/components/Diagnostics/` and General settings.
- Runtime contract: `AppRPCClient` plus desktop and mock implementations.
- Native: `src-tauri/src/intelligence/` owns processes, files, downloads, credential storage and hardware checks.
- ADRs: 0009 (boundary), 0010 (provider trust/consent), 0011 (managed runtime), 0012 (artifact supply chain),
  0013 (evaluation and model selection).

## Security

See `docs/engineering/SECURITY.md`. Threat model adds prompt injection, hallucination, secret reproduction, external
destinations, endpoint manipulation, process injection, loopback exposure, runtime supply chain, corrupted model files,
unsafe output rendering, resource exhaustion and imported configurations. The Tauri CSP must be tightened before
release-ready status. Pattern redaction and output scanning are safety nets, not proofs.

## Testing and evaluation

- Unit: contracts, fingerprints, assembler budgets/order/dedup, prompt versioning, endpoint policy, parser, citations,
  secret scan, repair, lifecycle, dedupe, cache, stale rejection, cancellation, timeout, disablement, observer removal.
- Native: argument allowlist, loopback/port/token, manifest validation, GGUF header/verification, path traversal,
  model-size checks and process helper lifecycle. Full download-network and live process cancellation remain native
  smoke/manual checks; see the runtime matrix.
- Browser: 13 intelligence scenarios and the full setup/analysis journeys.
- Evaluation: deterministic mock command in CI; explicit local command with a real model, repeated runs, recorded
  hardware, latency, memory, validation and rubric scores. Thresholds are not lowered to declare success.

## Rollout and rollback

All new config fields are optional; existing configs normalize to intelligence disabled. Built-in inference requires a
model download; no upgrade is automatic. Rollback disables the mode and removes the model/runtime. Evidence and analysis
are memory-only, so no data migration is required. Managed runtime support is enabled per platform only after a native
smoke test; other platforms keep monitoring and custom-provider support.

## Validation evidence

Recorded on this branch (macOS arm64, 16 GB, Bun 1.4.5, Rust 1.99):

```text
bun run check                  466 unit/component tests, coverage gates, renderer build, mock isolation, deterministic evals: passed
bun run test:e2e               23 Playwright tests (16 existing + 7 intelligence): passed
bun run audit                  no high/critical production vulnerabilities
bun run rust:fmt               passed
bun run rust:clippy            passed
bun run rust:test              9 tests passed
bun run test:evals:mock        16/16 cases passed
bun run test:evals:local       16/16 automatic checks on three repeated Qwen3 runs after destructive-command redaction
bun run build                  native macOS arm64 app and dmg built; bundled sidecar and libraries verified
```

GitHub Actions run `45726980639` passed Quality gate, Browser end-to-end, Rust native checks, Native sidecar and Production
dependency audit.

Coverage: 86.91% lines/statements, 86.05% branches, 87.09% functions overall; core thresholds passed. Real-model
quality: 15/16 accepted cases on human review (93.75%) for correctness and actionability. See
[the model report](../evaluations/0001-model-selection.md) and [runtime matrix](../evaluations/0002-runtime-platform-matrix.md).

Not validated here: managed-runtime execution on macOS x64, Linux x64/arm64 and Windows x64; signed/notarized release
artifacts; full in-app diagnosis against a real failed GitHub run (no credentials were used).

## Open questions

- Whether the smallest evaluated model meets the 85% correctness and actionability thresholds on held-out cases.
- Whether the pinned llama.cpp binary and dynamic libraries package and launch on every existing release target.
