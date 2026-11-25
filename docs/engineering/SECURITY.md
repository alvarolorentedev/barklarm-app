# Security engineering

Barklarm is local-first. This document defines the boundaries engineers and agents must preserve. Report vulnerabilities
via [../../SECURITY.md](../../SECURITY.md), not a public issue.

## Assets

- Integration credentials and endpoint configuration.
- Source operational data: build logs, deploy status, alert metadata, links.
- The local config file and explicit exports.
- The user's machine, through native capabilities and arbitrary HTTP(S) access.
- Future diagnostic evidence and model prompts.

## Trust boundaries

| Boundary              | Rule                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- |
| UI ↔ runtime         | The renderer uses `AppRPCClient`; native modules are limited to `desktop/**` and the facade. |
| Core ↔ integrations  | Integration responses are untrusted input. Parse defensively; never execute content.         |
| App ↔ native         | Rust validates config is a JSON object; writes are atomic and mode `0600` on Unix.           |
| App ↔ user webhook   | Payloads are allowlisted; endpoints must be HTTP(S).                                         |
| Mock ↔ real config   | Mock uses only namespaced `localStorage`; no filesystem, Tauri or real config access.        |
| Repository ↔ secrets | Tests, fixtures, screenshots and logs contain synthetic data only.                           |

## Configuration and credentials

- Tokens live in the JSON config, written with mode `0600` on Unix. They are **not** encrypted at rest.
- Explicit export includes tokens; the UI labels it as a configuration export. Treat exports as secrets.
- Import accepts a user-selected JSON object and replaces the config. Objects only; arrays and invalid JSON are rejected
  by Rust.
- Legacy configs migrate without dropping unknown fields. Observer IDs are additive.
- Do not log configuration values, authorization headers or raw response bodies.

## Issue webhook

Only the user's configured endpoint receives data, and only when the user chooses **Open Issue**. `buildIssuePayload` in
`src/core/issue.ts` is an explicit allowlist: `name`, `status`, `link`, and the `error` block (`id`, `description`,
optional `actions`). New `State` fields are not transmitted. Endpoint protocols other than `http:`/`https:` are
rejected.

Actions embedded in a source response are treated as untrusted data. They are forwarded as data today; review any future
execution or rendering carefully.

## SSL verification

`sslDisabled` is opt-in, clearly labeled in settings and only affects the Tauri HTTP client. It enables accepting
invalid certificates and hostnames, which exposes the user to man-in-the-middle attacks. Do not enable it by default, in
mock mode or in tests.

## Mock and test data

Mock scenarios are synthetic. Playwright runs against the mock runtime. Never capture a real token, customer log or
personal data in a test, trace or screenshot. CI requires no secrets for validation.

## Unresolved findings and accepted risks

| Finding                                                              | Severity            | Status                                                                                                              |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Config and exports store integration tokens in plaintext             | Medium              | Accepted for local-first 3.x; documented. Encrypting at rest is a future decision.                                  |
| Tauri content security policy is `null`                              | Medium              | Unresolved. Tightening it requires native validation; do not change without a spec and smoke test.                  |
| HTTP capability allows any `http(s)` host                            | Medium              | Required for user-configured integrations. Revisit if integrations gain fixed hosts.                                |
| `react-router` 6.30.6 open-redirect / SSR deserialization advisories | Moderate            | Tracked. App uses `HashRouter` without SSR, reducing exposure; fix requires router major upgrade.                   |
| `fast-xml-parser` 4.5.7 CPU advisory for unterminated stop-node tags | Low                 | Tracked. CCTray input is user-configured; fix requires parser major upgrade.                                        |
| Dev-only tinypool, simple-git and other build-tool advisories        | Low for shipped app | Accepted while on the current toolchain; the dev server binds `127.0.0.1`. Revisit during the next tooling upgrade. |
| Board builds are unsigned/not notarized                              | Operational         | Release workflow does not configure signing. Users may see OS warnings. Requires human credentials to change.       |
| Issue webhook payload compatibility                                  | Informational       | Keep the allowlist field-compatible; document intentional changes.                                                  |

Do not silently remove functionality or break configuration compatibility to resolve a finding. Record the decision and
test the migration.

## Dependency policy

- Dependabot monitors Bun, Cargo and GitHub Actions weekly.
- CI runs `bun audit --production --audit-level=high`; high/critical production advisories block.
- Moderate/low production advisories are documented above and scheduled.
- Dev-only advisories do not ship in the app but must not be ignored indefinitely.
- No new runtime dependency for a few lines of code; justify significant ones in the task or an ADR.

## Review checklist

- [ ] No new outbound field, endpoint or credential exposure.
- [ ] Integration input parsed defensively; no execution of remote content.
- [ ] Logs, tests, fixtures and traces contain no secrets or personal data.
- [ ] Configuration remains backward compatible and migration is tested.
- [ ] Mock code cannot reach real configuration or a production bundle.
- [ ] New native permission is least-privilege and documented.
