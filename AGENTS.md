# AGENTS.md

Canonical entry point for coding agents. Read this first, then follow the links you need. Humans should start with
[README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Product purpose

Barklarm is an MIT-licensed, local-first build and observability radiator for the menu bar. It watches CI pipelines,
monitors and alert sources, reduces them to one glanceable status, and explains where to look next. Phase 1 adds opt-in,
bounded diagnostic evidence for supported failures; **no AI inference is implemented yet**. Do not add AI features,
cloud services or a backend unless an approved task says so.

## Read order

1. This file.
2. [docs/architecture/OVERVIEW.md](docs/architecture/OVERVIEW.md) and
   [docs/architecture/INVARIANTS.md](docs/architecture/INVARIANTS.md) before changing structure.
3. [docs/engineering/DEVELOPMENT.md](docs/engineering/DEVELOPMENT.md) for commands and the mock runtime.
4. [docs/engineering/TESTING.md](docs/engineering/TESTING.md) before writing tests.
5. [docs/engineering/SECURITY.md](docs/engineering/SECURITY.md) before touching config, credentials, logs, exports or
   webhooks.
6. [docs/engineering/AGENTIC_WORKFLOW.md](docs/engineering/AGENTIC_WORKFLOW.md) for task and review flow.
7. [docs/product/](docs/product/) for why a feature exists.
8. [docs/engineering/AI_EVALUATION.md](docs/engineering/AI_EVALUATION.md) before touching future diagnostic evidence or
   evaluation fixtures.

Architectural decisions live in [docs/architecture/decisions/](docs/architecture/decisions/). Check them before
proposing a new boundary; add one when a consequential decision changes.

## Prerequisites

- Bun 1.4.5 (lockfile is authoritative).
- Rust 1.90+ and platform Tauri dependencies only for native work.
- No credentials or external services are needed for development, unit tests, the mock runtime or browser end-to-end
  tests.

## Commands

| Command                                          | Purpose                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                  | Reproducible install                                                                    |
| `bun run dev`                                    | Native Tauri app (requires Rust/webview)                                                |
| `bun run dev:mock`                               | Real React app in a browser, no Tauri, no credentials                                   |
| `bun run check`                                  | Format, lint, types, unit/component tests with coverage, renderer build, mock isolation |
| `bun run test`                                   | Unit and component tests                                                                |
| `bun run test:cov`                               | Tests with coverage gates                                                               |
| `bun run test:e2e`                               | Playwright smoke and acceptance tests against the mock runtime                          |
| `bun run format:fix` / `lint:fix`                | Auto-fix local issues                                                                   |
| `bun run rust:fmt` / `rust:clippy` / `rust:test` | Native checks (need a Rust toolchain)                                                   |
| `bun run audit`                                  | High/critical production dependency audit                                               |

Run `bun run check` before every commit. Run `bun run test:e2e` for UI, runtime or configuration changes. Native changes
also require the Rust commands. Never weaken a check to make it pass.

## Repository map

```text
src/core/              Application behavior: config, observer orchestration, notifications, payloads
src/extensions/<name>/ One integration: type, observer (I/O), optional diagnostics provider, component, tests
src/mainview/          React presentation, pages, contexts, desktop shell and runtime facade
src/mainview/runtime/  Browser mock runtime and shared client contract
src/mainview/desktop/  Tauri-only shell: tray, dialogs, notifications, autostart, store bridge
src/types/             Shared contracts (State, Observer, configuration, status)
src-tauri/             Rust shell, config persistence, native menu/tray integration
e2e/                   Playwright specs against the mock runtime
docs/                  Product, architecture, engineering and spec documentation
fixtures/              Sanitized synthetic fixtures for future diagnostic evaluations
scripts/               Deterministic repository checks
```

## Architectural boundaries

- **Observers** retrieve operational status and source-specific evidence. They do not persist, render or decide
  notifications.
- **TypeScript core** owns orchestration, state transitions, identity, persistence policy and payload boundaries.
- **React** owns presentation and interaction. Components do not import Tauri APIs.
- **Tauri/Rust** owns native capabilities and the config file. Only `src/mainview/desktop/**` and the runtime facade may
  import `@tauri-apps/*`; ESLint enforces this.
- **Mock runtime** implements the same `AppRPCClient` interface as the desktop runtime. It must never import Tauri
  modules, touch real user configuration, or appear in a production bundle.

Full list and enforcement: [docs/architecture/INVARIANTS.md](docs/architecture/INVARIANTS.md).

## Browser mock runtime

Use `bun run dev:mock` and select a scenario with `?scenario=<name>`:

`empty`, `healthy`, `failed-builds`, `running-builds`, `unavailable`, `multiple-failures`, `persistence`,
`diagnostics-complete`, `diagnostics-partial`, `diagnostics-unavailable`, `diagnostics-multiple`,
`diagnostics-unsupported`, `diagnostics-disabled`, `diagnostics-collecting`, `diagnostics-secrets`.

- `?scenario=persistence&reset=1` reseeds that scenario; omit `reset` to keep edits across reloads.
- Mock configuration is stored in `localStorage` under `barklarm.mock.v1.<scenario>` only.
- Import/export are intentionally disabled in mock mode.
- Never enable mock mode in a production build. The build guard and `check:mock-isolation` enforce this.

Scenario details and browser automation guidance: [docs/engineering/DEVELOPMENT.md](docs/engineering/DEVELOPMENT.md).

## Testing requirements

- New logic needs a focused unit test; bug fixes need a regression test that fails before the fix.
- Observer lifecycle, state transitions, notification behavior, persistence, integration adapters and diagnostic
  evidence collection are the highest-value test areas.
- Browser tests must be deterministic: no arbitrary sleeps, fixed locale (`en-US`), mock scenarios only.
- Playwright keeps traces and screenshots on failure in `test-results/`.
- Coverage gates: 78% lines/statements/functions and 86% branches overall; `src/core/**` must stay at 90%
  lines/statements/functions and 85% branches. The desktop shell is intentionally thin and validated natively.
- Do not add meaningless assertions to raise coverage. Add behavior-focused tests or document a gap.

## Security requirements

- Never log or commit credentials, tokens, personal data or real configuration.
- Treat integration responses and diagnostic evidence as untrusted data; render it as text, never execute it.
- Diagnostic collection is opt-in, memory-only and bounded. Sanitize before caching; never add evidence to `State` or
  the issue webhook.
- External transmissions use explicit allowlists (`buildIssuePayload`); do not send new fields by default.
- Configuration changes must stay backward compatible. Legacy configs are migrated on load; preserve import/export
  compatibility.
- Keep the `sslDisabled` path opt-in and visible; never enable it by default.
- Read [docs/engineering/SECURITY.md](docs/engineering/SECURITY.md) for accepted risks and reporting.

## Coding conventions

- TypeScript strictness follows the existing `tsconfig`; no new `any` unless matching an existing boundary. Prefer typed
  helpers in `src/core`.
- Match the surrounding structure, naming and Prettier/ESLint rules. Small, direct changes beat new abstractions.
- Keep core logic free of React and Tauri imports.
- No new runtime dependency without justification in the task or an ADR.
- Comments explain _why_, not _what_.
- Conventional commit messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`).

## Definition of done

- The objective and acceptance criteria in the task are met; non-goals untouched.
- `bun run check` passes. UI/runtime changes also pass `bun run test:e2e`.
- Native changes pass `rust:fmt`, `rust:clippy` and `rust:test`, or the exact environment limitation is documented with
  the command to run elsewhere.
- Tests cover new behavior and regressions.
- Docs in `docs/` and this file remain accurate; add an ADR for consequential decisions.
- No secrets, no compatibility break, no production-mock leakage, no suppressed errors.
- The pull request states real command results and residual risk.

## Autonomy policy

Act without asking for routine, reversible engineering decisions:

- inspect the repository, implement approved requirements, write tests, refactor inside boundaries;
- fix regressions caused by your change, update related docs;
- run local validation and prepare branches, commits and pull requests.

Stop and escalate for:

- breaking public interfaces or configuration formats;
- changes to architectural boundaries or a new runtime dependency;
- product scope changes, security boundary changes, destructive operations;
- production releases, remote repository settings, or actions needing privileged credentials;
- real user data, external accounts, or anything you cannot reproduce locally.

When blocked, report what you tried, the exact command/output, and the smallest decision needed.

## Parallel work

Use one worktree/branch per task. Declare the files or modules you expect to touch in the task, and do not edit another
agent's declared area. Rebase before review. If two tasks need the same architectural decision, settle it in an ADR
first. Details: [docs/engineering/AGENTIC_WORKFLOW.md](docs/engineering/AGENTIC_WORKFLOW.md).

## Maintaining documentation

Behavior changes update the closest doc: commands in `DEVELOPMENT.md`, tests in `TESTING.md`, security-relevant changes
in `SECURITY.md`, boundaries in `INVARIANTS.md`, workflow in `AGENTIC_WORKFLOW.md`. Keep `AGENTS.md` a short index — do
not duplicate the details here.
