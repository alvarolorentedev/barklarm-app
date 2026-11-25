# 0003 — Non-overlapping observer refreshes

Status: accepted (Phase 0)

## Context

`setInterval` invoked `refreshState` without an in-flight guard. A source slower than the refresh interval caused
overlapping cycles, duplicated fetches and races where an older response could publish after a configuration change.

## Decision

- Only one refresh cycle runs at a time. Concurrent `refreshState` calls return the in-flight promise.
- Interval ticks that arrive during a cycle are skipped, not queued. A refresh longer than the interval therefore
  reduces the effective frequency instead of creating a backlog.
- A generation counter increments on every configuration change. Results captured for an older generation are discarded
  before notification or presentation.
- An explicit configuration change waits for the in-flight cycle, then refreshes the new configuration.

## Consequences

- Slow integrations cannot pile up work or overwrite newer configuration.
- Users may see fewer refreshes than the configured interval while a source is slow; this is preferred to overlapping
  requests.
- Observers remain responsible for their own request timeouts; the manager does not abort them.
- Regression tests cover overlap, interval ticks during a refresh, and a config change mid-refresh.
