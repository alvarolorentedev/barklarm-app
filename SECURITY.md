# Security policy

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Email `contact@alvarolorente.dev` with:

- affected version and platform;
- reproduction steps or a minimal proof of concept;
- impact and any known mitigation;
- whether you want credit.

You should receive an acknowledgement within a few business days. Please give us reasonable time to release a fix before
public disclosure.

## Supported versions

Security fixes are provided for the latest release on the `main` branch. Older versions are not supported. The project
is MIT-licensed and maintained by volunteers.

## Scope

In scope: the Barklarm desktop application, its configuration and import/export paths, the issue-creation webhook, the
renderer, the mock runtime and the release workflows in this repository.

Out of scope: vulnerabilities in third-party integrations themselves, social engineering, and denial-of-service against
third-party services.

## Security boundaries

Barklarm is local-first. Configuration, tokens and observer state stay on the user's machine unless the user explicitly
configures an issue endpoint. Integration responses are untrusted. External payloads are allowlisted. Details, accepted
risks and dependency policy: [docs/engineering/SECURITY.md](docs/engineering/SECURITY.md).

Known accepted risks that are documented rather than silently changed:

- integration tokens are stored in the local config file (mode `0600`) and included in explicit configuration exports;
- the Tauri content security policy is currently unset;
- disabling SSL verification is available for self-signed endpoints and is opt-in;
- dev-only Vite/Vitest advisories are tracked but not release blockers;
- two moderate and one low production advisory require major-version upgrades and are tracked in the security
  documentation.

## Automated checks

Pull requests run `bun run check`, browser end-to-end tests, Rust checks and
`bun audit --production --audit-level=high`. Dependabot monitors Bun, Cargo and GitHub Actions dependencies. Do not
weaken these checks without an approved security decision.
