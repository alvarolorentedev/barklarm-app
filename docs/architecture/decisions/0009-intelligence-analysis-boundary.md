# 0009 — Intelligence analysis boundary

Status: accepted (Phase 2)

## Context

Phase 1 established `State` for operational status and `DiagnosticEvidence` for sanitized source context. Phase 2 adds
model interpretation. Mixing interpretation into either type would leak generated text into notifications and the issue
webhook, and would make evidence collection depend on inference health.

## Decision

`DiagnosticAnalysis` and `AnalysisSnapshot` are separate contracts in `src/types/Intelligence.ts`. A dedicated
`AnalysisManager` consumes evidence events, owns queueing, cancellation, fingerprints and a bounded memory cache, and
emits validated analyses. It never mutates `State` or evidence.

Evidence IDs remain the citation unit. Analysis cites only IDs included in the assembled model input. The same evidence
content plus model, prompt and inference configuration produces the same cache identity; collection timestamps are
excluded.

## Consequences

- The UI composes status, evidence and analysis but stores them separately.
- Analysis can be unavailable without affecting polling, tray, notifications or webhook behavior.
- No persistent analysis history or database is introduced.
- New fields on `State` do not become outbound fields automatically.
