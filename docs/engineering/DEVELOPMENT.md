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

For managed inference, stage the pinned runtime once per target:

```sh
bun run sidecar:fetch
```

The script downloads the pinned llama.cpp build, verifies its SHA-256 and places the binary, shared libraries and
licenses under `src-tauri/binaries/` (gitignored). Standard TypeScript, browser and deterministic evaluation work does
not need it.

```sh
bun run sidecar:smoke          # binary availability only
bun run sidecar:smoke:runtime  # opt-in: model hash, loopback, auth, structured inference, validation, cleanup
bun run test:evals:mock        # deterministic production-pipeline evaluation
bun run test:evals:local       # explicit real-model evaluation; never standard CI
```

`sidecar:smoke:runtime` requires the pinned model in the app data directory or `BARKLARM_MODEL_PATH`. It is not part of
`bun run check`.

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
| `diagnostics-complete`    | Failed GitHub workflow with complete evidence                    |
| `diagnostics-partial`     | Partial evidence with an inaccessible log and truncation         |
| `diagnostics-unavailable` | Deleted/inaccessible workflow run with no usable evidence        |
| `diagnostics-multiple`    | Two failed workflows with independent evidence                   |
| `diagnostics-unsupported` | Failed Sentry observer, diagnostics enabled but unsupported      |
| `diagnostics-disabled`    | Failed workflow while diagnostics are off; enabling reveals them |
| `diagnostics-collecting`  | Collection in progress, then available                           |
| `diagnostics-secrets`     | Synthetic credential-like content already shown as redacted      |
| `intelligence-disabled`   | Failed build with intelligence disabled                          |
| `intelligence-model-missing` | Built-in mode selected without an installed model             |
| `intelligence-downloading` | Model download progress                                         |
| `intelligence-download-failed` | Failed model download                                       |
| `intelligence-ready`      | Verified model and ready runtime                                |
| `intelligence-runtime-starting` | Runtime starting                                           |
| `intelligence-analyzing`  | Queued/analyzing analysis, then available                       |
| `intelligence-complete`   | Validated diagnosis with citations and recommendations          |
| `intelligence-insufficient` | No usable evidence for a diagnosis                            |
| `intelligence-invalid-response` | Model output rejected by validation                        |
| `intelligence-provider-unavailable` | Custom provider unreachable                            |
| `intelligence-remote-consent` | Remote destination awaiting consent                         |
| `intelligence-unsupported-hardware` | Managed runtime unsupported on this profile          |
| `radiator-mixed`          | Healthy, failed, muted, checking and unavailable sources for the radiator |
| `radiator-resolving`      | A failure resolves during inspection; stale diagnosis must disappear        |
| `handoff-injection`       | Evidence with synthetic malicious instructions                              |
| `handoff-clipboard-failure` | Clipboard write denied; preview remains selectable                        |
| `intelligence-recovery`   | Failed analysis recovers after an explicit retry                            |

Examples:

```text
http://127.0.0.1:1420/?scenario=failed-builds
http://127.0.0.1:1420/?scenario=diagnostics-complete&reset=1
http://127.0.0.1:1420/?scenario=persistence&reset=1
```

Diagnostic scenarios enable the opt-in setting in their seeded config, except `diagnostics-disabled`. Expand the failed
observer row to inspect the evidence panel. None of these scenarios make network requests.

### Routes and tray mock

The full window opens on `/radiator` and also exposes `/radiator/observer/:id`, `/observers` and `/settings`.
`/general` redirects to `/settings`. The tray overlay is a separate shell on `/tray`, `/tray/observer/:id` and
`/tray/handoff/:id`.

In the browser mock the overlay is reachable directly; native window sizing and tray clicks are not simulated:

```text
http://127.0.0.1:1420/?scenario=radiator-mixed&reset=1#/tray
http://127.0.0.1:1420/?scenario=radiator-mixed&reset=1#/tray/observer/mock-mixed-ci
http://127.0.0.1:1420/?scenario=radiator-mixed&reset=1#/tray/handoff/mock-mixed-ci
```

In the native app, clicking the menu-bar icon toggles one overlay. There is no second right-click menu design on
macOS/Windows. Linux keeps a minimal native menu fallback because Tauri cannot emit tray click events there.

Keep `dragDropEnabled: false` on the main Tauri window. The Observers page adds a source by dropping a link and uses
HTML5 drag and drop; Tauri's native handler consumes the drop and no native listener is registered.

The main window is created transparent so tray mode can apply the native `Popover` material (Acrylic on Windows) in
`show_tray_panel`; `restore_main_window` clears the effect. The opaque app shell covers the main window, so keep its
background and the `html[data-runtime='mock']` fallback if you change the theme tokens.

### Visual capture

`bun run dev:mock` must already be running. Capture synthetic screenshots with:

```sh
bun run capture:phase3
```

The script uses the default window sizes and writes under `docs/media/phase3/`. It never uses real data.

- `reset=1` clears only that scenario's key and reseeds it.
- Without `reset`, edits survive reloads.
- Storage key: `barklarm.mock.v1.<scenario>` in browser `localStorage`.
- Import/export return `false`; native dialogs are not simulated.
- Mock states are derived from the stored observers, so adding, removing or renaming an observer is reflected
  deterministically.
- Scenarios live in `src/mainview/runtime/mock.ts`; add one there and extend `src/mainview/runtime/mock.test.ts`.
- Diagnostic evidence and intelligence are collected/served by the desktop runtime only; the mock serves deterministic
  envelopes and analysis snapshots and never imports Tauri, downloads models, spawns processes or performs inference.

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
- The CSP is set but not interactively validated on every release target; the HTTP capability still allows any HTTP(S)
  host for user-configured integrations. Both are documented in [SECURITY.md](SECURITY.md).
- Managed runtime execution is verified locally on macOS arm64 only; other targets require native CI/human smoke tests.
- Native notification click routing is unchanged. The tray overlay (macOS/Windows) and native menu fallback (Linux) are
  the supported paths to a failure detail; richer notification actions remain Phase 4 work.
- The tray overlay's native focus/blur, full-app transition and clipboard write could not be exercised interactively in
  the Phase 3 agent environment. They are implemented and covered by Rust placement tests and browser tests, but the
  native interactions remain unverified until Phase 4.
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
