# Testing

Automated verification is the primary mechanism for autonomous development. A change is not complete because it
compiles; it is complete when the relevant checks prove the required behavior.

## Test layers

| Layer                     | Location                                     | Runs with                    |
| ------------------------- | -------------------------------------------- | ---------------------------- |
| Core unit                 | `src/core/*.test.ts`                         | Vitest + jsdom               |
| Core diagnostics          | `src/core/diagnostics/*.test.ts`             | Vitest + jsdom               |
| Extension observers       | `src/extensions/<name>/observer/*.test.ts`   | Vitest, mocked fetch adapter |
| Extension diagnostics     | `src/extensions/github/diagnostics/*.test.ts`| Vitest, deterministic fetch  |
| Extension components      | `src/extensions/<name>/component/*.test.tsx` | Testing Library              |
| Mainview pages/components | `src/mainview/**/*.test.tsx`                 | Testing Library              |
| Browser acceptance        | `e2e/*.spec.ts`                              | Playwright + mock runtime    |
| Visual capture            | `scripts/capture-phase3.ts`                  | Playwright + mock runtime    |
| Native                    | `src-tauri/src/**` `#[cfg(test)]`            | cargo test                   |
| Diagnostic evaluation     | `scripts/evals/` + `fixtures/ai-eval/`       | bun run test:evals:mock      |
| Real-model evaluation     | `scripts/evals/` + local provider            | bun run test:evals:local     |
| Real runtime smoke        | `scripts/smoke-managed-runtime.ts`           | bun run sidecar:smoke:runtime |

## Commands

```sh
bun run test          # all unit/component tests
bun run test:cov      # same with coverage gates
bun run test:e2e      # Playwright against dev:mock
bun run check         # full repository gate, includes deterministic evals
bun run test:evals:mock  # deterministic evaluations only
bun run test:evals:local # explicit real model, not CI
bun run sidecar:smoke    # binary availability only
bun run sidecar:smoke:runtime # opt-in real runtime/model, not CI
```

Run a single file with `bunx vitest run src/core/observer-manager.test.ts`. Run a single Playwright spec with
`bun run test:e2e -- e2e/configuration.spec.ts`.

## Coverage

Phase 0 baseline: 80.3% lines/statements, 88.8% branches, 81.3% functions. Phase 1: 87.3% lines/statements, 87.43%
branches, 85.97% functions overall; core 93.27% lines/statements, 91.91% branches, 91.3% functions. Phase 2: 86.91%
lines/statements, 86.05% branches, 87.09% functions overall. Phase 2.1: 86.83% lines/statements, 86.06% branches, 87.12%
functions overall. Phase 3: 87.48% lines/statements, 86.05% branches, 80.59% functions overall. Overview revision:
87.02% lines/statements, 86.19% branches, 80.53% functions overall. Two-window revision: 86.90% lines/statements,
86.28% branches, 81.79% functions overall; `src/core/**` is 95.47% lines/statements, 89.50% branches and 95.00%
functions. All gates pass. The new code is covered by focused projection, summary, observer list, drag-and-drop,
tray-shell, tray RPC bridge/client, component and route tests, not exclusions. Gates in `vitest.config.ts`:

- overall: 78% lines, statements and functions; 86% branches;
- `src/core/**`: 90% lines, statements and functions; 85% branches.

These are regression floors, not targets. The desktop shell is thin and 0% covered in jsdom because it requires Tauri;
it is validated through type checking, native checks and manual/release smoke tests. Do not exclude real logic from
coverage to raise the number. Add behavior-focused tests or document the gap.

Coverage only includes `src/**`; build artifacts, the promo project and e2e specs are excluded. Before Phase 0 the
default config counted `src-tauri/target/**` and `promo/`, producing a misleading 26.81%.

## What to test

Priority areas for new work:

1. **Observer lifecycle** — config changes, builder failure, state mapping by ID.
2. **State transitions** — global status precedence, checking/failure/unavailable.
3. **Notification behavior** — status changes, distinct failure IDs, mute, duplicate aliases.
4. **Configuration persistence** — legacy ID migration, duplicate IDs, import/export compatibility.
5. **Integration adapters** — success, non-OK responses, malformed payloads, missing fields.
6. **Error handling** — thrown fetch, invalid JSON, unknown integration type.
7. **Diagnostic evidence** — provider discovery, exact run attempt, jobs/steps, log extraction, sanitization,
   truncation, redirects, rate limits, dedupe, retry, timeout, stale results, eviction and unsupported integrations.
8. **Intelligence** — context budgets/order/dedup/redaction, prompt versioning, provider errors and fallbacks,
   citations, schemas, repair, secret/destructive-output rejection, queue/cache/dedupe/stale/cancel/disable behavior,
   endpoint and consent policy, insufficient-evidence policy, transport/TLS isolation, full request deadlines,
   retention/pruning, first-run retry and managed provider lifecycle.
9. **Native runtime/download** — serialized startup, stop during start, ownership identity, token permissions, manifest
   records, full-hash activation, same-size replacement, cache/download guards.
10. **Radiator and handoff** — counts, NA/muted/ordering, stale identity rejection, deterministic prompt composition,
    credential redaction, malicious instructions, size limits, clipboard success/failure and stale analysis.
11. **Tray overlay** — compact healthy/empty/attention states, overlay detail/handoff routes, content-height reporting
    and single-surface navigation. Escape is unit-tested; native focus-loss/blur remains Phase 4 work.
12. **Browser journeys** — 36 Playwright tests covering the original startup/configuration/diagnostics/intelligence
    journeys plus the new radiator, tray, citation, handoff, activation, recovery and resolution journeys.


## Unit conventions

- Prefer fakes at the boundary (`Observer`, `NotificationPresenter`, fetch adapter) over module mocks.
- No live network, credentials or timers in unit tests. Use deferred promises and fake timers.
- A bug fix includes a regression test that fails against the old behavior.
- Assert observable behavior, not private fields.
- Keep tests deterministic; `vi.useRealTimers()` in cleanup when fake timers are used.

## Browser conventions

- Always select a mock scenario; never rely on external services.
- No `waitForTimeout`. Use locators, `expect.poll` for storage and `expect(...)` auto-waiting.
- Fixed locale `en-US` so visible labels are stable.
- Use roles, labels and visible text for user-facing controls; stable class hooks only where existing tests already rely
  on them.
- Reload/persistence tests must not use `reset=1` on the first navigation, because the reset also runs after reload. A
  fresh Playwright context starts with empty storage.
- Failures keep screenshots, traces and error context in `test-results/`; CI uploads them.

## Phase 3 native validation

Native interactive validation is recorded separately from browser tests. On this macOS arm64 machine the release bundle
builds, launches, stays resident in the menu bar and has no on-screen app window at launch. Screen capture and tray
click automation were unavailable to the agent environment, so the overlay click, clipboard write and full-app
transition could not be exercised interactively here. Rust placement tests, the native build and the full browser suite
are green; the unexecuted native interactions are carried into Phase 4. Do not cite the browser mock as proof of native
window or clipboard behaviour.

## Native tests

`cargo test` covers config parsing, the store, runtime ownership/state, token files and model verification. The opt-in
`bun run sidecar:smoke:runtime` covers real runtime authentication, loopback binding, structured inference, production
validation and cleanup. Add Rust tests for new native behavior. Clippy warnings are errors in
CI. Native checks require the platform webview packages listed in [DEVELOPMENT.md](DEVELOPMENT.md).

## Fixtures

Browser scenarios are synthetic, deterministic fixtures in `src/mainview/runtime/mock.ts`. Fifteen public/regression
fixtures and three held-out fixtures live under `fixtures/ai-eval/` and are executed by
`src/extensions/github/diagnostics/fixtures.test.ts`: the real provider and normalizer run against synthetic API
responses, then assert required evidence IDs, categories, limitations, forbidden strings and completeness.

Fixtures are sanitized and synthetic. Never use real tokens, customer logs or personal data in a fixture, screenshot or
trace. The case `expected.json` keeps observable evidence separate from AI rubric metadata used by real-model review.

## Honesty

If a check cannot run, report the exact command and limitation. Never claim an unexecuted check passed, and never
replace a failing assertion with a weaker one to get green.
