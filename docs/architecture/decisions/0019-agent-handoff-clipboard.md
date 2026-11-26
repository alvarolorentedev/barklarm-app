# 0019 — Agent handoff and clipboard boundary

## Status

Accepted.

## Context

Phase 2 produces validated, cited analyses of sanitized diagnostic evidence. A major Phase 3 capability is handing a
self-contained failure context to a coding agent. That is a user-mediated data-egress boundary and must not require a
second model inference, silently transmit data or mix log content with instructions.

## Decision

- `src/core/handoff.ts` composes the prompt deterministically from one observer's failure, sanitized evidence and
  validated analysis. It has no React, Tauri, network or model dependency.
- Trusted instructions are separated from a clearly delimited untrusted-evidence block. Model output is a separate,
  unverified section. Evidence is never rendered or labelled as instructions.
- The composer reuses the existing sanitizer, excludes configuration/credentials/runtime tokens/unrelated observers,
  checks source URLs and enforces deterministic item/character limits with visible truncation.
- Analysis is included only when its status is available and its observer/failure identity matches the evidence and
  current failure. Stale analysis is never copied.
- The UI previews the exact outgoing text, states whether AI interpretation is included, and requires an explicit copy
  action. No agent is launched and nothing is transmitted automatically.
- Clipboard access is exposed through `AppRPCClient.writeClipboard`; React never imports Tauri. The desktop
  implementation uses the narrow native `clipboard-manager:allow-write-text` capability and leaves the preview
  selectable if the write fails. No read capability is added.
- Pattern-based redaction is documented as a safety net, not a guarantee.

## Consequences

- Handoff works with evidence alone when intelligence is disabled.
- The boundary is independently testable without a model or a browser.
- A future native clipboard capability can replace the implementation behind the same contract without touching React.
