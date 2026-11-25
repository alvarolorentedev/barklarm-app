# Pull request

## Objective

<!-- What user or engineering problem does this solve? Link the issue. -->

Closes #

## Context

<!-- Constraints, prior art, and anything a reviewer must know before reading the diff. -->

## Changes

<!-- Bullet the meaningful changes. Keep generated or mechanical churn out of this list. -->

## Non-goals

<!-- What was deliberately left out? -->

## Validation

<!-- Paste real commands and results. Do not claim unexecuted checks. -->

- [ ] `bun run check`
- [ ] `bun run test:e2e` (UI, runtime or configuration changes)
- [ ] `bun run rust:fmt && bun run rust:clippy && bun run rust:test` (native changes)

```text
# command output summary
```

## Risk and rollback

<!-- User data, configuration compatibility, externally transmitted payloads, native behavior. -->

## Documentation

- [ ] Relevant docs under `docs/` updated, or no behavior changed
- [ ] `AGENTS.md` / `CONTRIBUTING.md` remains accurate
- [ ] ADR added for a consequential architectural decision

## Security

- [ ] No secrets, tokens or personal data added to fixtures, logs or screenshots
- [ ] Configuration changes stay backward compatible
- [ ] New external transmissions are allowlisted and justified
