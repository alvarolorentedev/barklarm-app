# 0017 — Evidence and analysis retention ownership

Status: accepted (Phase 2.1)

## Context

Evidence and analysis had separate TTL/cache maps. Evidence expiry or eviction did not always invalidate analysis, and
some analysis caches survived a diagnostics disable. A UI snapshot request was effectively part of expiration.

## Decision

- `EvidenceManager` owns evidence TTL, eviction and recollection. Expiry, eviction, observer removal and recollection
  emit `cleared`; intelligence consumes that as analysis invalidation.
- `AnalysisManager` owns its evidence copy, queue, snapshots and cache. Its `prune()` enforces TTL independently of UI
  reads. A snapshot is only returned when its fingerprint matches the current evidence revision.
- A new failure, diagnostics disable, intelligence disable, provider/config change or shutdown clears every associated
  collection and aborts active work.
- Execution identity (generation + key + execution number + controller) prevents stale completions from publishing.
- Queue overflow is bounded and retried once capacity returns. Retry of first-run blockers is rate-limited.
- The desktop shell runs a one-minute prune for both managers.

## Consequences

- Identical evidence revisions still reuse one inference; changed or expired evidence cannot display an old analysis.
- Evidence in NA/CHECKING states remains the last known failure until SUCCESS or a new failure, as documented in the
  evidence ADRs. Expired evidence is removed even if the observer has not refreshed.
