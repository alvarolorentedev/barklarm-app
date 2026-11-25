# 0008 — Collection concurrency and resource limits

Status: accepted (Phase 1)

## Context

Diagnostics add network requests and memory to an app whose main job is fast, predictable polling. Unbounded queues,
retries or log downloads would make a failing CI pipeline slow the radiator.

## Decision

- Two simultaneous evidence collections; at most one queued/in-flight collection per observer.
- One retry for transient/network failures; structured inaccessible/rate-limited results are not retried.
- 30-second collection timeout and 15-second per-request timeout through `AbortSignal`.
- 2 MiB response cap enforced while reading; 2 job pages of 100; 20 failed jobs; 5 job-log requests.
- 4,000 characters per item, 20,000 per envelope, 40 items.
- Requests stop on configuration change, removal, resolution, disable, timeout or shutdown.

Collection is scheduled after a refresh publishes states and is never awaited by the polling cycle.

## Consequences

- A slow or hostile source cannot create a polling backlog or unbounded memory.
- Very large workflows or logs produce `partial` evidence with explicit limitations instead of blocking.
- The limits are conservative defaults; changing them requires a measured reason and updated tests.
