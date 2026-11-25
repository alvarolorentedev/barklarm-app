# 0006 — Evidence identity and lifecycle

Status: accepted (Phase 1)

## Context

An observer can stay red while a new failure occurs, and GitHub reruns a workflow under the same run ID with a new
attempt. Display names, aliases and array positions are not identities. Evidence must belong to the exact failure and
must not be replaced by a stale collection.

## Decision

The evidence key is `observerId + diagnosticScope + failureId`.

- `observerId` is the persistent configuration ID.
- `diagnosticScope` is source-defined. GitHub uses `github.com/<owner>/<repo>/workflows/<workflowId>`; alias, mute and
  credential changes do not invalidate evidence, while repository/workflow changes do.
- `failureId` is the source event identity. GitHub uses `<run_id>:<run_attempt>` and exposes it as `State.error.id`.
  A rerun attempt is a distinct failure event.

The manager keeps one current failure per observer. It collects on every observed failed state (covering startup and
observers that remain red), deduplicates by key, aborts superseded work and accepts a result only if the key is still the
current failure. Resolution, observer removal, configuration scope change, timeout, disable and shutdown abort or discard
pending work.

## Consequences

- The GitHub `error.id` value gains an `:attempt` suffix. The issue webhook schema is unchanged; consumers must treat the
  ID as opaque. Notifications remain correct for reruns without a new field.
- No incident history: old failures are replaced or evicted, not accumulated.
- Evidence collection never changes operational state, notifications or the tray.
