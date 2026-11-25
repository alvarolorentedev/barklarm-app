# Engineering principles

These principles are specific to Barklarm. They resolve trade-offs; they are not slogans.

## Local-first, no hidden transmission

Status, evidence and configuration stay on the machine unless the user configures an external endpoint. New fields are
not transmitted by default. Any new outbound payload needs an allowlist and a test.

## Deterministic before clever

Agent feedback must not depend on a live GitHub run, a real token or wall-clock timing. Prefer fixed scenarios, injected
clocks/gates and explicit state transitions. If something cannot be deterministic, document how to reproduce it.

## Smallest complete change

Use the existing core, extension and component patterns before adding an abstraction. A new layer needs a concrete
second caller or an ADR. Deletion beats addition.

## Boundaries are enforced, not documented

Core and observer code do not import React or Tauri. Presentation does not own orchestration. ESLint, tests and
`bun run check` enforce the invariants in [../architecture/INVARIANTS.md](../architecture/INVARIANTS.md).

## Backward compatibility by default

Configuration is user data. Legacy configs migrate on load; import/export stays valid; observer IDs are additive. A
breaking configuration change requires explicit approval.

## Evidence, not guesswork

Operational status is separate from diagnostic evidence and future analysis. Do not collapse them into one type or one
screen. Preserve source-specific failure identifiers so distinct failures remain distinct.

## Fast, honest feedback

One command proves the repository is healthy. A red check is fixed at the root cause, never weakened, skipped or
decorated to pass. Unrun checks are reported as unrun.

## Security is a boundary, not a feature

Treat integration responses and logs as untrusted. Validate outbound URLs. Keep credential handling explicit. Accepted
risks are documented in [../engineering/SECURITY.md](../engineering/SECURITY.md).
