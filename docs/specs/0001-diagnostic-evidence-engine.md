# 0001 — Diagnostic evidence engine

## Status

Implemented (Phase 1). AI analysis is not part of this spec.

## Implementation checklist

- [x] Typed evidence envelope, provider capability and opt-in setting.
- [x] GitHub Actions evidence for the exact run attempt, jobs, steps and bounded logs.
- [x] Sanitization, limits and in-memory evidence lifecycle.
- [x] Desktop and mock runtime access, minimal Observers UI and English/Spanish copy.
- [x] Eight deterministic mock scenarios and seven AI-evaluation fixtures.
- [x] Unit, component, browser and fixture-driven tests; existing gates preserved.
- [x] ADRs 0005–0008 and synchronized architecture, security, testing and roadmap docs.

## Problem

Barklarm reports that a GitHub Actions workflow failed, but not which job or step failed or what the source said about
it. The user must leave the radiator and open the workflow to understand the failure. Phase 2 will need trustworthy,
bounded, sanitized source evidence; adding that later without a contract would force a second architecture.

Evidence 1: the GitHub observer returns only `error.id` (run ID) and a generic description. Evidence 2: `State` and the
issue webhook are deliberately minimal, so diagnostic context cannot live there.

## Goals

- A typed, bounded evidence envelope separate from `State`, with stable evidence IDs.
- An optional diagnostic provider capability; existing observers keep working unchanged.
- GitHub Actions collection for the exact failed run attempt: execution metadata, failed jobs, failed steps, bounded
  error/log excerpts, source links.
- Deterministic extraction, sanitization and size limits.
- Automatic, non-blocking collection for distinct failures; deduplicated and bounded concurrency.
- Opt-in setting, disabled by default for existing installations.
- Inspectable evidence in the existing Observers UI and both runtimes.
- Deterministic mock scenarios and reusable synthetic fixtures for Phase 2.

## Non-goals

- LLM inference, Ollama, model downloads, prompts, root-cause analysis, recommendations, coding-agent handoff, MCP.
- Cross-source correlation, incident history, analytics, databases or durable raw-log storage.
- New diagnostic integrations beyond GitHub Actions.
- Adding evidence to `State` or the issue webhook.
- A major UI redesign.

## Requirements

1. `DiagnosticEvidence` carries `schemaVersion`, `observerId`, `failureId`, `sourceType`, `collectedAt`, `completeness`,
   `summary`, `items` and `limitations`. Items carry a stable ID, category, title, sanitized content, optional source
   reference, timestamp, metadata and truncation information.
2. Completeness is `complete | partial | unavailable`. `complete` describes collection coverage for the requested
   failure, not certainty about a root cause. `partial` includes inaccessible components, truncation, redaction or no
   error signal. `unavailable` means no usable evidence.
3. Observers optionally expose a `DiagnosticProvider` and a diagnostic scope. Missing providers are `unsupported`.
4. GitHub collection uses the exact run attempt, list-jobs pagination, and job-specific log endpoints. It never uses the
   latest-run endpoint to infer the failure.
5. Failed jobs and failed steps are extracted deterministically. Log extraction selects explicit annotations, errors,
   test failures, compilation/dependency failures, exit codes and stack frames with context; it does not assume the last
   line is the error.
6. Collection is optional, automatic when enabled, non-blocking relative to polling, deduplicated by
   `observerId + diagnosticScope + failureId`, retried at most once for transient failures, and cancelled on
   configuration change, removal, resolution or shutdown.
7. Evidence is in-memory only: 25 failures, 30-minute TTL, 20,000 characters and 40 items per envelope. A resolved
   failure clears its evidence. No raw log persistence.
8. Sanitization strips control sequences and redacts recognizable authorization values, GitHub tokens, API keys,
   passwords, URL credentials, private keys and configured integration credential values. Pattern-based redaction is not
   a guarantee; residual risk is documented.
9. Evidence text is untrusted data. It is rendered as text, never HTML or executable content. No outbound transmission.
10. `AppRPCClient` exposes the evidence snapshot, manual recollection and safe external-link opening. The setting is a
    normal config field, default `false`.
11. GitHub failure identity includes the run attempt: `error.id = "<run_id>:<run_attempt>"`. This is the source event
    identity used by notifications and evidence; the webhook schema is unchanged.
12. Mock scenarios and AI-evaluation fixtures are deterministic and synthetic; standard CI needs no credentials.

## UX and operational impact

- General gains a Diagnostics group with an opt-in switch and a short residual-risk notice.
- Expanding a failed observer shows a Diagnostic evidence panel: status, completeness, summary, limitations, execution,
  jobs, steps, error/log excerpts, source links and a recollection action.
- The traditional radiator, tray menu, notifications and webhook behavior remain unchanged. Diagnostics off means no
  extra requests.
- Collection failures never change an observer's operational status.

## Data and evidence

Captured: workflow/repository/run/attempt/conclusion/branch/SHA/timestamps/links, failed job and step metadata, bounded
log excerpts, extracted error signals, completeness and limitations. Not captured: full raw logs, actor identity, email,
tokens, runner hostnames, unrelated jobs, workflow archives. Redaction is applied before caching and before runtime
exposure. No disk, database, telemetry or webhook transmission.

## Architecture and boundaries

- Contracts in `src/types/Diagnostics.ts`; core orchestration, sanitization and lifecycle in
  `src/core/diagnostics/`.
- GitHub-specific I/O and extraction in `src/extensions/github/diagnostics/`.
- React presentation in `src/mainview/components/Diagnostics/`; runtime contract in `src/mainview/runtime/`.
- No Tauri/Rust change: the existing HTTP and runtime abstractions are sufficient.
- ADRs: `0005-diagnostic-provider-boundary`, `0006-evidence-identity-lifecycle`,
  `0007-evidence-retention-sanitization`, `0008-collection-concurrency-resource-limits`.

## Security

- Treat API responses, logs, error text, metadata and links as untrusted.
- API requests do not follow redirects; log redirects are HTTPS-only, host-allowlisted and do not receive the GitHub
  Authorization header.
- Bound response bytes while reading, not only after loading.
- Redact known configured credentials exactly and recognizable patterns generically.
- Mock and fixture data are synthetic. Screenshots use mock data only.
- Residual: pattern redaction cannot prove removal of every possible secret; encoded or unusual secrets may survive.
  No model-level prompt-injection resistance is claimed.

## Testing and evaluation

- Unit: contracts, sanitization, truncation, limits, IDs, completeness, GitHub validation, jobs/steps/log extraction,
  rate limits, redirects, empty/unavailable logs, retries, timeout, dedupe, stale results, eviction, TTL, unsupported.
- Integration: observer manager wiring, non-blocking behavior, resolution/removal/config change, webhook unchanged.
- Browser: settings persistence, complete/partial/unavailable/collecting/unsupported/disabled/secret scenarios,
  recollection, existing flows.
- Fixtures: seven `fixtures/ai-eval/github-actions/*` cases with synthetic responses, expected evidence references,
  forbidden strings and future rubric metadata. No model in CI.

## Rollout and rollback

`diagnosticsEnabled` is optional and defaults to `false`; old configs normalize without loss and exports remain JSON.
Rollback is deleting the new setting and UI; evidence is memory-only, so no data migration is needed. The GitHub
`error.id` value gains an `:attempt` suffix; the webhook schema is unchanged, and consumers must treat the ID as opaque.

## Validation evidence

Recorded on the Phase 1 branch:

```text
bun install --frozen-lockfile   no changes (681 installs, 660 packages)
bun run check                   format, lint, tsc, coverage, renderer build, mock isolation: passed
bun run test:e2e                15 Playwright acceptance tests: passed
bun run audit                   no high/critical vulnerabilities (32 packages checked)
```

Coverage: overall 87.42% lines/statements, 87.43% branches, 85.97% functions; `src/core/**` 93.27% lines/statements,
91.91% branches, 91.3% functions. No native Rust code changed, so Rust checks were not required for this branch.

Screenshots: `docs/media/diagnostics-complete.png` and `docs/media/diagnostics-partial.png`, captured from
`bun run dev:mock` with synthetic scenarios.

## Open questions

None blocking Phase 1. Phase 2 must decide the local model, prompt/context assembly, citation validation and evaluation
thresholds before claiming diagnosis quality.
