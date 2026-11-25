# Contributing

We love pull requests from everyone. By participating in this project, you agree to abide by the
[code of conduct](CODE_OF_CONDUCT.md).

Coding agents should start with [AGENTS.md](AGENTS.md); this file is the human entry point.

## Set up

Install [Bun](https://bun.sh/) 1.4.5 (the lockfile is authoritative) and clone the repository:

```sh
git clone git@github.com:alvarolorentedev/barklarm-app.git
cd barklarm-app
bun install --frozen-lockfile
```

Native development additionally needs Rust 1.90+ and the platform Tauri dependencies. Browser development does not.

## Develop

```sh
bun run dev        # native Tauri app (requires Rust/webview)
bun run dev:mock   # React app in a browser with deterministic mock data
bun run check      # the full local quality gate
bun run test:e2e   # Playwright acceptance tests against the mock runtime
```

Mock scenarios are selected with
`?scenario=empty|healthy|failed-builds|running-builds|unavailable|multiple-failures|persistence`. `bun run dev:mock`
requires no credentials, accounts or external services.

## Make a change

- Open an issue using the agent-task template for non-trivial work.
- Work on a branch or worktree; keep commits small and conventional.
- Add tests for behavior. Bug fixes need a regression test that fails before the fix.
- Update the closest doc when behavior changes. See [AGENTS.md](AGENTS.md) for the documentation map.
- Run `bun run check` before committing. The pre-commit hook runs lint-staged.
- Native changes also require `bun run rust:fmt`, `bun run rust:clippy` and `bun run rust:test`.

## Pull requests

Complete the pull request template: objective, context, non-goals, real validation results, risk and rollback,
documentation and security checks. Do not claim a check passed if it did not run; document the environment limitation
and the command to run elsewhere.

A reviewer validates the implementation against the acceptance criteria and the architectural invariants. Review
expectations and escalation criteria are in
[docs/engineering/AGENTIC_WORKFLOW.md](docs/engineering/AGENTIC_WORKFLOW.md).

## Documentation

- Product direction: [docs/product/VISION.md](docs/product/VISION.md)
- Architecture and invariants: [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md)
- Development and testing: [docs/engineering/DEVELOPMENT.md](docs/engineering/DEVELOPMENT.md)
- Security: [SECURITY.md](SECURITY.md)
