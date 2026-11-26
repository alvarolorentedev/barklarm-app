# 0015 — Managed runtime lifecycle and process ownership

Status: accepted (Phase 2.1)

## Context

Phase 2 registered runtime ownership only after startup, so concurrent `ensure` calls could each spawn a process. Stale
cleanup matched `llama-server` by name, which could terminate another instance after PID reuse.

## Decision

- One async operation lock serializes start, stop and restart. Concurrent ensures coalesce on the ready runtime.
- An epoch counter is the cancellation authority. `stop` increments it before waiting, so a startup loop notices and
  kills its own child instead of publishing a stale endpoint.
- Explicit status: `stopped`, `starting`, `ready`, `stopping`, `failed`.
- A runtime whose child exited is invalidated; the next status read reports `failed` and clears the endpoint.
- Startup is bounded (90 s), retries a port collision at most three times, and is rate-limited after failure.
- Active inference is tracked separately from idle time. Idle reaping never stops a runtime with active work and uses a
  bounded lease to recover from a crashed renderer.
- The ownership marker contains PID, process start identity, executable path, instance nonce and owner identity. Markers
  are per instance (`runtime-<instance>.pid`), and startup scans them all. Cleanup only signals when the executable and
  process start identity still match and the owner is not a live concurrent Barklarm instance. A stale marker alone is
  never authorization, and one instance never overwrites another's marker.
- Tokens use an exclusively created mode-0600 file, are never passed as arguments, and are removed on success, cancel
  and failure. Failed writes remove the partial file; startup sweeps only abandoned token files older than an hour.
  Managed child processes inherit `NO_PROXY` for loopback and have proxy variables removed.
- Activation hashing is cooperative: stop sets a cancellation flag and the hash aborts per MiB instead of blocking quit
  for the full file.
- Health verification requires authentication rejection, the expected model alias, and (where the OS exposes it) that the
  listening PID is the spawned child.

## Consequences

- Abrupt termination can still leave a process on platforms without durable process handles; the next start verifies
  identity before cleanup. Unverifiable markers are discarded without signalling.
- Concurrent instances intentionally leave each other's runtime alone; each instance owns its own child.
- Full lifecycle concurrency is covered by state/identity tests plus the opt-in real-runtime smoke test.
