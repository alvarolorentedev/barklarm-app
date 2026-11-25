# Development

## Prerequisites

| Tool                   | Version                            | Needed for              |
| ---------------------- | ---------------------------------- | ----------------------- |
| [Bun](https://bun.sh/) | 1.4.5 (see `bun.lock`)             | Everything              |
| Rust                   | 1.90+ (see `src-tauri/Cargo.toml`) | Native app, Rust checks |
| Platform Tauri deps    | see below                          | Native build/run        |

Linux native packages:
`libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf libssl-dev`. macOS needs Xcode
command line tools. Windows needs the Rust MSVC toolchain and WebView2.

Browser development, unit tests, the mock runtime and Playwright require **none** of the native dependencies,
credentials or external services.

## Install and run

```sh
bun install --frozen-lockfile
bun run dev        # native Tauri app
bun run dev:mock   # browser app with deterministic data
```

`bun run dev` starts Vite on `127.0.0.1:1420` and then the Tauri shell. The window is hidden outside debug builds and
the tray remains available.

### Plain renderer debugging

`bun run dev:renderer` serves the renderer without Tauri. The runtime facade will try the desktop runtime and fail
initialization; that is expected. Use `bun run dev:mock` for a usable browser app.

## Mock runtime

`bun run dev:mock` runs Vite in `mock` mode. The facade in `src/mainview/rpc-client.ts` selects
`src/mainview/runtime/mock.ts` only when `import.meta.env.DEV` is true and `MODE === 'mock'`.

Select a scenario with a query parameter:

| Scenario            | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `empty`             | No observers, empty-state and add-observer flows    |
| `healthy`           | Three successful observers                          |
| `failed-builds`     | One failed build beside a healthy one               |
| `running-builds`    | Observers in `CHECKING`                             |
| `unavailable`       | Reached/misconfigured integrations (`NA`)           |
| `multiple-failures` | Three simultaneous failures with distinct event IDs |
| `persistence`       | Healthy config suited to edit/reload checks         |

Examples:

```text
http://127.0.0.1:1420/?scenario=failed-builds
http://127.0.0.1:1420/?scenario=persistence&reset=1
```

- `reset=1` clears only that scenario's key and reseeds it.
- Without `reset`, edits survive reloads.
- Storage key: `barklarm.mock.v1.<scenario>` in browser `localStorage`.
- Import/export return `false`; native dialogs are not simulated.
- Mock states are derived from the stored observers, so adding, removing or renaming an observer is reflected
  deterministically.
- Scenarios live in `src/mainview/runtime/mock.ts`; add one there and extend `src/mainview/runtime/mock.test.ts`.

### Production isolation

Mock code is behind a compile-time guard and loaded by dynamic import. `bun run build:renderer` must not contain its
marker. `bun run check` runs `scripts/check-mock-isolation.mjs` after the build and fails if the marker leaked.

## Browser automation

Playwright is configured in `playwright.config.ts` and starts `bun run dev:mock` itself when no server is running.

```sh
bun run test:e2e                 # headless, chromium
bun run test:e2e -- --headed     # watch it
bun run test:e2e -- e2e/status.spec.ts
```

Failures keep a screenshot, trace and error context under `test-results/`. Open a trace with
`bunx playwright show-trace test-results/<test>/trace.zip`. The HTML report is in `playwright-report/`. Both are
gitignored.

For an agent-driven inspection session, start `bun run dev:mock` in the background and open the scenario URL in the
available browser automation tool. Prefer visible text, roles and labels over CSS classes, except for the stable
`.status-pill.*`, `.observer-name-text` and `.status-row` hooks used by existing tests.

Tests are deterministic: no live integrations, fixed `en-US` locale, no arbitrary sleeps. Use `expect.poll` for storage
and `expect(locator)` auto-waiting for UI.

## Quality commands

```sh
bun run check          # format + lint + tsc + coverage + renderer build + mock isolation
bun run test           # unit/component
bun run test:cov       # coverage gates
bun run format:check
bun run lint:check
bun run tsc:check
```

Individual commands exist so a failure can be debugged without the full gate. Never weaken the gate to get a green run.

## Native checks

```sh
bun run rust:fmt
bun run rust:clippy
bun run rust:test
```

These need a Rust toolchain. Clippy is a separate rustup component:

```sh
rustup component add clippy
```

`cargo test` currently covers the config store; clippy compiles the Tauri crate. Linux needs the native packages listed
above. If the environment cannot run a check, state the limitation and the exact command to run elsewhere.

## Dependency audit

```sh
bun run audit   # production dependencies, high/critical
```

CI runs `bun audit --production --audit-level=high`. Dev-only advisories are reviewed but do not block releases; see
[SECURITY.md](SECURITY.md) for the current accepted set.

## Known debt

These are tracked, not silently ignored:

- TypeScript is pinned to 4.5 with `strict` disabled; raising it needs a dedicated change.
- The renderer has two i18n helpers (`src/core/i18n.ts` initialized by the desktop runtime and
  `src/mainview/i18n.ts` reading `navigator.language`). They share the same translation files; unify
  them in a dedicated task.
- The Tauri CSP is unset and the HTTP capability allows any HTTP(S) host; both are documented security
  findings in [SECURITY.md](SECURITY.md).
- The native build warns that the bundle identifier ends in `.app`; changing it would break update
  identity and needs a migration decision.
- `.codeclimate.yml` still references an old renderer path and ESLint 6 and is not used by CI.
- macOS/Windows release builds are unsigned and not notarized.

## Troubleshooting

| Symptom                                                      | Cause / action                                    |
| ------------------------------------------------------------ | ------------------------------------------------- |
| Port 1420 already in use                                     | Vite uses `strictPort`; stop the other dev server |
| Renderer renders but observers never load in a plain browser | Expected without mock mode; use `dev:mock`        |
| `cargo-clippy` not installed                                 | `rustup component add clippy`                     |
| Playwright browser missing                                   | `bunx playwright install --with-deps chromium`    |
| Native build fails on Linux                                  | Install the Tauri packages above                  |
| Mock changes do not appear                                   | Check the `?scenario=` name and use `reset=1`     |
