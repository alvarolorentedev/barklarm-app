# 0014 — Native inference transport and TLS isolation

Status: accepted (Phase 2.1)

## Context

The production CSP allows only Tauri IPC for `connect-src`. The managed llama.cpp runtime binds a dynamically allocated
loopback port, so browser `fetch` cannot reach it. The observer `sslDisabled` setting also existed to tolerate broken
integration TLS, but inheritance would disable certificate and hostname checks for inference destinations that receive
diagnostic evidence and API keys.

## Decision

- `src/mainview/desktop` constructs one inference transport from the Tauri HTTP plugin and passes it explicitly to both
  provider adapters. The desktop path never falls back to browser `fetch`.
- `createInferenceFetch` forces `redirect: manual` / `maxRedirections: 0` and never adds `danger` certificate options.
- `sslDisabled` remains scoped to observer/integration requests through `createObserverFetch`.
- The managed provider validates that the native endpoint is loopback before sending its token. Custom providers never
  receive a managed token.
- `src/core` stays free of Tauri imports; the transport is injected as a `FetchLike`.

## Consequences

- The CSP is unchanged and no new listener or permission is introduced.
- Custom provider TLS failures are actionable and cannot be disabled through an observer setting.
- Any future non-Tauri runtime must supply its own tested transport; the core has no implicit browser fallback in the
  desktop client.
