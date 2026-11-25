# 0004 — Distinct failure events

Status: accepted (Phase 0)

## Context

Notifications fired only when a status changed. If a source stayed red while a new failure occurred — for example a
second failed GitHub workflow run — the user was never notified. Every observer already returns a source-specific
`error.id` (run ID, pipeline UUID, alert ID, event ID, build timestamp).

## Decision

`NotificationManager` compares the source failure ID when both the previous and current status are `FAILURE`. A
different non-empty ID is a new failure event and produces a notification. The same ID is not re-notified. Status-change
notifications remain unchanged, including muted observers.

A missing source ID falls back to status-change behavior only; it cannot prove a new event.

## Consequences

- Users can be notified while the radiator is already red, which is the intended behavior change.
- Source adapters must keep `error.id` stable per event and distinct across events.
- Duplicate notifications are possible on upgrade when a previous state had no ID; this is acceptable and self-corrects
  on the next cycle.
- This is not incident management: there is no dedupe store beyond the previous state, no grouping and no
  acknowledgement workflow.
