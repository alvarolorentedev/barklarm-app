# Testing

Automated verification is the primary mechanism for autonomous development. A change is not complete because it
compiles; it is complete when the relevant checks prove the required behavior.

## Test layers

| Layer                     | Location                                     | Runs with                    |
| ------------------------- | -------------------------------------------- | ---------------------------- |
| Core unit                 | `src/core/*.test.ts`                         | Vitest + jsdom               |
| Extension observers       | `src/extensions/<name>/observer/*.test.ts`   | Vitest, mocked fetch adapter |
| Extension components      | `src/extensions/<name>/component/*.test.tsx` | Testing Library              |
| Mainview pages/components | `src/mainview/**/*.test.tsx`                 | Testing Library              |
| Browser acceptance        | `e2e/*.spec.ts`                              | Playwright + mock runtime    |
| Native                    | `src-tauri/src/**` `#[cfg(test)]`            | cargo test                   |

## Commands

```sh
bun run test          # all unit/component tests
bun run test:cov      # same with coverage gates
bun run test:e2e      # Playwright against dev:mock
bun run check         # full repository gate
```

Run a single file with `bunx vitest run src/core/observer-manager.test.ts`. Run a single Playwright spec with
`bun run test:e2e -- e2e/configuration.spec.ts`.

## Coverage

Verified baseline before Phase 0 thresholds: 80.6% lines/statements, 88.8% branches, 81.3% functions across `src/**`.
Gates in `vitest.config.ts`:

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
7. **Browser journeys** — startup, navigation, configuration edit, reload persistence, failure and unavailable
   presentation.

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

## Native tests

`cargo test` covers config parsing and the store. Add Rust tests for new native behavior. Clippy warnings are errors in
CI. Native checks require the platform webview packages listed in [DEVELOPMENT.md](DEVELOPMENT.md).

## Fixtures

Browser scenarios are synthetic, deterministic fixtures in `src/mainview/runtime/mock.ts`. Future diagnostic/AI fixtures
follow [AI_EVALUATION.md](AI_EVALUATION.md) and must be sanitized. Never use real tokens, customer logs or personal data
in a fixture, screenshot or trace.

## Honesty

If a check cannot run, report the exact command and limitation. Never claim an unexecuted check passed, and never
replace a failing assertion with a weaker one to get green.
