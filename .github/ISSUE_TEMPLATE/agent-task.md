---
name: Agent task
about: A scoped, independently executable implementation task
title: 'task: '
labels: task
assignees: ''
---

## Objective

<!-- One or two sentences. What outcome is required? -->

## Repository context

<!-- Relevant files, modules, prior decisions, ADRs, and related issues. -->

## Requirements

<!-- Concrete, testable requirements. -->

1.
2.

## Non-goals

<!-- Explicitly exclude adjacent work so the change stays reviewable. -->

-

## Acceptance criteria

<!-- Observable behavior that proves the task is complete. -->

- [ ]
- [ ]

## Validation requirements

<!-- Commands the implementer must run and report. -->

- [ ] `bun run check`
- [ ] `bun run test:e2e` (if UI or runtime behavior changes)
- [ ] `bun run rust:fmt && bun run rust:clippy && bun run rust:test` (if native code changes)

## Dependencies and architectural constraints

<!-- Blocking issues, required ADRs, boundaries from docs/architecture/INVARIANTS.md. -->

## Areas likely to change

<!-- Helps parallel agents avoid file conflicts. List paths or modules. -->

## Agent notes

<!-- Optional: suggested approach, known failure modes, scenario name for bun run dev:mock. -->
