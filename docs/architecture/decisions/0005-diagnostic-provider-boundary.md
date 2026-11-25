# 0005 — Diagnostic provider boundary

Status: accepted (Phase 1)

## Context

Observers already own source-specific I/O and credentials. Diagnostics need source-specific API calls (jobs, steps,
logs) but must not turn the core into a GitHub client or create a second authentication path. Not every integration can
provide diagnostics.

## Decision

An observer may optionally expose `getDiagnosticProvider()` and `getDiagnosticScope()`. The provider interface lives in
`src/types/Diagnostics.ts` and receives a failure reference plus an `AbortSignal` and explicit limits. It returns a
bounded, unsanitized draft; the core normalizes, sanitizes and owns the envelope, cache and lifecycle.

Providers reuse the observer's configuration and the existing fetch adapter. Missing provider methods mean `unsupported`
and existing observers are untouched.

## Consequences

- Source-specific API knowledge stays in `src/extensions/<name>/diagnostics/`.
- Core never sees integration tokens beyond the existing trusted config boundary used for exact redaction.
- A new diagnostic integration implements one provider, not a new notification, runtime or persistence layer.
- Provider drafts are not exposed to the UI before sanitization and normalization.
