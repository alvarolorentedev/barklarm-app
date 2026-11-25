# Agentic delivery workflow

GitHub is the coordination layer: issues hold requirements, pull requests hold evidence. No proprietary orchestration
framework is required. Any coding agent that can read the repository, run Bun/Rust commands and use Git can participate.

## Task contract

Every non-trivial task uses `.github/ISSUE_TEMPLATE/agent-task.md` and contains:

- objective and repository context;
- testable requirements and explicit non-goals;
- acceptance criteria;
- validation commands;
- dependencies and architectural constraints;
- files or modules likely to change.

A task without acceptance criteria is not ready. Product or boundary ambiguity is escalated before code is written.

## Delivery steps

### 1. Requirement analysis and plan

- Read `AGENTS.md`, the relevant architecture docs and existing tests.
- Identify every place the change must reach: callers, tests, fixtures, config, docs, exports, CI.
- Name the invariants that apply and the risky cases (data loss, compatibility, outbound payloads).
- Decide the smallest complete change. If it needs a new layer, dependency or boundary, write an ADR first.

### 2. Isolated branch or worktree

```sh
git worktree add ../barklarm-<task> -b <type>/<short-slug> origin/main
cd ../barklarm-<task>
bun install --frozen-lockfile
```

Use one branch per task. Branch prefixes: `feat/`, `fix/`, `test/`, `docs/`, `chore/`, `ci/`. Do not work directly on
`main`.

### 3. Acceptance-criteria-driven implementation

- Start from the observable behavior in the issue.
- Add or update a failing test for new logic before or alongside the implementation. Bug fixes require a regression
  test.
- Keep changes inside the declared areas. If scope grows, update the issue or split the task.
- Preserve validation and error handling when moving code.
- Update the closest docs as behavior changes.

### 4. Automated validation and self-correction

Minimum before review:

```sh
bun run check
bun run test:e2e          # UI, runtime or config behavior
bun run rust:fmt && bun run rust:clippy && bun run rust:test   # native code
```

For a failure: read the root cause, fix it, rerun. Do not skip, weaken, retry-loop or suppress a check. If the
environment cannot run something, record the exact limitation and the command to run elsewhere. Never claim an unrun
check passed.

### 5. Independent review

A reviewer (another agent or human) validates the implementation against the issue, not only the diff:

- requirements and non-goals;
- invariants in `docs/architecture/INVARIANTS.md`;
- tests actually exercise the behavior and fail without the fix;
- configuration compatibility, security boundaries and external payloads;
- docs and ADR accuracy;
- the validation evidence is real and sufficient.

The author fixes findings on the same branch. Reviewers do not rewrite the author's implementation silently.

### 6. Evidence-based pull request

Complete the PR template with objective, context, non-goals, real command results, risk/rollback, documentation and
security checks. Link the issue. Keep the diff reviewable; mechanical churn is separated from behavior changes.

## Parallel agents

Parallelism is allowed when ownership is explicit.

| Rule                                                                               | Reason                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| One worktree and branch per task                                                   | No shared working tree races                           |
| Declare expected files/modules in the issue                                        | Detect overlap before work starts                      |
| One owner per module/area at a time                                                | Avoid conflicting edits and half-merged behavior       |
| ADR before a shared architectural decision                                         | Parallel code cannot reconcile incompatible boundaries |
| Small PRs, rebase on `main` before review                                          | Reduce integration conflicts                           |
| Tests and generated files owned by the task that changes them                      | No two agents regenerating the same artifacts          |
| Shared interfaces (`State`, `AppRPCClient`, config schema) change through one task | Prevents incompatible parallel changes                 |

Typical non-overlapping areas: one extension observer + its tests; docs for a completed change; CI workflow changes;
mock scenarios and their e2e tests. Overlapping areas: `src/core/config.ts`, `src/core/observer-manager.ts`,
`src/mainview/rpc-client.ts`, `package.json`, `bun.lock`, CI workflows.

## Escalation

Stop and ask a human for:

- breaking public interfaces or configuration formats;
- new architectural boundaries or significant runtime dependencies;
- product scope changes;
- security boundary changes, destructive operations, real user data;
- production releases, remote settings, privileged credentials;
- anything that cannot be reproduced locally.

For routine reversible decisions, choose a reasonable option, record it in the PR or ADR, and continue.

## Definition of done

The issue acceptance criteria are met; `bun run check` and applicable e2e/native checks pass; docs and ADRs are
accurate; no secrets, compatibility break or production-mock leakage; residual risk is stated.
