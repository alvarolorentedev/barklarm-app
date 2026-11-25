# Spec template

Use this for product or architectural work that needs agreement before implementation. Small bug fixes and routine
chores do not need a spec. File specs under `docs/specs/NNNN-short-title.md`.

## Status

Proposed | Accepted | Implemented | Superseded by #

## Problem

What user or engineering problem exists? What is the evidence? Link issues.

## Goals

-

## Non-goals

-

## Requirements

Behavioral requirements, testable:

1.

## UX and operational impact

What changes for the user, the tray, notifications, configuration or performance?

## Data and evidence

What is captured, stored, transmitted or retained? What is explicitly not? Sanitization and size limits.

## Architecture and boundaries

Which layers change? Which invariants apply? Does this need an ADR in `docs/architecture/decisions/`?

## Security

Credentials, logs, exports, webhook payloads, untrusted input, native permissions. New risks and mitigations.

## Testing and evaluation

- Deterministic tests to add.
- Browser scenarios / Playwright journeys.
- Native checks.
- If AI is involved: fixtures, metrics, human review, and why standard CI stays deterministic. See
  `docs/engineering/AI_EVALUATION.md`.

## Rollout and rollback

Migration, backward compatibility, feature flags, release steps, rollback.

## Open questions

-
