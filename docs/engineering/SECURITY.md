# Security engineering

Barklarm is local-first. This document defines the boundaries engineers and agents must preserve. Report vulnerabilities
via [../../SECURITY.md](../../SECURITY.md), not a public issue.

## Assets

- Integration credentials and endpoint configuration.
- Source operational data: build logs, deploy status, alert metadata, links.
- The local config file and explicit exports.
- The user's machine, through native capabilities and arbitrary HTTP(S) access.
- Diagnostic evidence, model prompts, model output, API keys and managed model/runtime artifacts.
- The user's clipboard content produced by agent handoff.

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

## Diagnostic evidence

Diagnostic collection is opt-in and disabled by default. When enabled, supported integrations may retrieve additional
operational data for the exact failed event while the app is running.

- Collected: execution metadata, failed jobs and steps, bounded log excerpts, error signals, completeness and source
  links. Not captured as structured fields: full raw logs, workflow archives, actor identity, email, unrelated jobs or
  runner hostnames. Log excerpts may contain incidental personal or host data; they are bounded and sanitized, not
  guaranteed anonymous.
- Evidence is memory-only: 25 failures, 30-minute TTL, 40 items, 20,000 content characters per envelope and 4,000 per
  item. Titles, metadata values, source URLs and limitation codes are separately capped. Evidence is never written to
  disk, exported, added to `State`, sent to the issue webhook or transmitted to telemetry. When intelligence is enabled and
the destination authorized, evidence is sent only to the selected inference provider.
- The normalizer strips ANSI/C0/C1 and bidi/zero-width control sequences and redacts recognizable authorization headers,
  bearer values, GitHub tokens, API-key/password assignments, URL credentials, private keys, JWTs and selected cloud
  keys. Configured credential values are removed exactly when their key name marks them as secrets.
- GitHub API requests use `maxRedirections: 0`. Job-log redirects are followed manually only over HTTPS, only to
  `*.blob.core.windows.net`, `*.githubusercontent.com` or `github.com`, never with the Authorization header, and never
  with URL credentials or non-standard ports. Unexpected redirects become `redirect_rejected` evidence.
- Evidence is untrusted data: it is rendered as text, never HTML; commands in logs are never executed; external links
  must be HTTP(S). Streamed provider responses are bounded while reading; the text fallback is truncated immediately
  after reading. Source URLs with embedded credentials are rejected.
- GitHub failure identity is `<run_id>:<run_attempt>`, so a rerun cannot reuse another attempt's evidence.
- A seen marker prevents cache eviction from re-triggering collection on every poll. NA/CHECKING do not clear evidence;
  only SUCCESS or a new failure changes it.

Pattern-based redaction is a safety net, not a proof. Encoded, split, transformed or unrecognized secrets may survive.
Redaction also changes evidence, so the envelope reports `content_redacted` and downgrades completeness to `partial`.

## Intelligence

- Intelligence is opt-in and disabled by default. Enabling it does not enable diagnostic collection.
- Three modes: disabled, managed local runtime, custom OpenAI-compatible provider. Only the managed runtime is described
  as local inference controlled by Barklarm.
- Custom loopback endpoints may use HTTP; non-loopback endpoints require HTTPS. URLs with credentials, query strings or
  fragments are rejected. Redirects are disabled; Authorization headers are not forwarded.
- Desktop inference uses the Tauri HTTP transport under the production CSP. Inference never falls back to browser
  `fetch` and never inherits the observer `sslDisabled` switch; remote/private TLS certificates and hostnames are always
  validated. Certificate failures surface as provider errors.
- Private and remote destinations require explicit consent. Consent and provider keys use a SHA-256 digest of the
  canonical endpoint path plus model, prefixed to distinguish it from the old cache fingerprint. They live in the OS
  credential store, not the imported config, so an import cannot silently authorize transmission. Native import writes
  `intelligenceMode: disabled` in the same atomic config write. Changing the destination or model invalidates consent;
  users can revoke it. Existing approvals/keys from the Phase 2 cache-hash scheme require re-approval/re-entry.
- Connectivity tests use a model list or a minimal non-evidence prompt. Evidence is never part of a test.
- API keys use the OS credential store, scoped by destination fingerprint. They are not in config, exports, prompts, logs
  or fixtures. The renderer holds a key in memory only for the request; this residual renderer-trust boundary is accepted
  until transport moves to Rust.
- The context assembler re-sanitizes evidence, strips destructive-command shapes, bounds items and content, and excludes
  source URLs and unrelated metadata.
- Validator rejection: unknown citations, malformed schema, oversized fields, credential-like output, destructive
  commands, wrong observer/failure/fingerprint. At most one repair request. Raw invalid output is never displayed.
- Model output is rendered as text. Commands are never executed; generated URLs are never auto-opened. Recommendations are
  not applied automatically.
- Managed runtime: loopback only, serialized lifecycle, free port, health/auth probe against the intended model,
  ephemeral token created exclusively with mode 0600 via a file (never arguments), explicit argument allowlist, no web
  UI/slots/props/metrics/model retrieval, output discarded, supervised shutdown and bounded inactivity. Startup checks
  cancellation before publishing; active inference leases are protected from idle reaping.
- Process cleanup requires a per-instance marker whose PID start identity and executable path still match, and whose
  owner is not a live concurrent Barklarm instance. Concurrent instances have separate markers. A stale marker alone
  never authorizes signalling a process; an unreadable owner identity is treated as possibly alive (fail closed).
- Models are downloaded only after consent, written through a temporary file, bounded to the manifest size and promoted
  only if SHA-256 and GGUF header match. A JSON record binds the installed file to model id, version, file name, size and
  SHA-256. Status checks are lightweight; activation performs a full asynchronous hash. Cancelled/removed downloads
  cannot promote, and an existing valid model is not deleted before its replacement is verified.
- Runtime binaries are pinned by build and per-platform SHA-256, fetched into a gitignored directory and bundled with their
  licenses. Standard CI does not download models.

Residual risks:

- Prompt injection is mitigated by separation, destructive-command redaction and validation, not solved. Semantic
  grounding is measured only by the evaluation set.
- A localhost external runtime can forward data elsewhere; the UI states this.
- Pattern redaction and output scanning cannot prove that every secret was removed.
- The renderer holds integration tokens and, briefly, a provider key; a renderer compromise remains high impact. The
  key is never forwarded to the managed runtime or another destination.
- A loopback custom provider is externally managed: Barklarm can enforce scheme/consent but cannot prove where it sends
  data.
- Port allocation is check-then-spawn. Barklarm verifies authentication, the model alias and (where the OS tool exposes
  it) the listening PID before publishing an endpoint, but a hostile local process racing the port remains outside the
  guarantee.
- Process signalling is a check-then-kill operation. Identity is verified immediately before signalling, but a local
  attacker racing PID reuse is outside the guarantee. Platforms without a usable identity tool retain the marker and do
  not signal.
- Activation hashing is cooperative and cancellable; the in-process hash cache trusts path/size/mtime after a successful
  full hash. Local write access to the application data directory is outside the integrity boundary.
- Process identity checks rely on OS process metadata; abrupt termination and PID reuse are handled best-effort, and
  platforms without a stable identity are documented rather than assumed safe.
- The sidecar and libraries are dynamic; signing/notarization must cover every bundled library before a signed release.

## Phase 2 threat model additions

| Threat | Mitigation | Residual |
| --- | --- | --- |
| Prompt injection in logs/evidence | Trusted system instructions separated from JSON evidence; destructive commands redacted; output validation and safety evaluation | A model can still be influenced semantically |
| Hallucinated causes or files | Citation-required schema; evidence subset checks; human rubric and held-out evaluation | A valid citation does not prove semantic support |
| Secret reproduction | Evidence sanitization; output credential scan rejects the analysis | Pattern scanning cannot prove removal |
| External destination manipulation | Scheme/host validation, HTTPS for non-loopback, no URL credentials, no redirects, destination display and consent | User can approve a hostile destination |
| Imported config enabling remote processing | Consent stored outside config; import cannot create approval | A user can approve manually |
| Runtime process injection | Fixed executable path, explicit argument allowlist, no shell, Rust-owned spawn, identity-verified cleanup | Local user with process rights can still interfere |
| Local server exposure | Loopback bind, ephemeral token, no web UI/slots/props, output discarded | Other local processes can connect if they learn the token |
| Runtime supply chain | Pinned build, per-asset SHA-256, HTTPS source, no execution of downloaded content | Upstream compromise remains possible |
| Corrupted/malicious model | Manifest-bound verification record, activation-time full SHA-256, GGUF header, runtime parser isolation | Parser vulnerabilities remain possible; local write access to app data is outside the boundary |
| Unsafe output rendering | Text-only rendering; no HTML, command or URL execution | User can copy a recommendation manually |
| Resource exhaustion | Queue/concurrency limits, normalized context/output budgets, full request deadlines, one runtime slot, active-inference protection, idle shutdown | A model can still use significant CPU/memory while active |
| Untrusted imported configuration | Normalization, consent outside config, no auto-download/auto-inference | Invalid custom endpoints fail closed |

## Agent handoff and clipboard

- Handoff composition is local, deterministic and model-free. It includes one observer's failure, sanitized evidence,
  validated analysis and, when safe, the source URL. It excludes configuration, integration credentials, provider keys,
  runtime tokens, unrelated observers and unvalidated model output.
- The composer reuses the diagnostic sanitizer, rejects stale observer/failure identities, separates trusted
  instructions from a delimited untrusted-evidence block, neutralizes reserved delimiter markers inside untrusted fields
  and applies deterministic item/character limits. Pattern-based redaction remains a safety net, not a guarantee.
- The prompt is rendered as text in a preview. Copying happens only on an explicit user action through
  `AppRPCClient.writeClipboard`; there is no automatic transmission, agent launch or clipboard read. The desktop
  implementation uses the narrow native `clipboard-manager:allow-write-text` capability and leaves the preview
  selectable if the write fails. No clipboard-read permission is granted.
- The UI states whether AI interpretation is included and warns that pasting elsewhere may send the content to another
  tool or provider.
- Evidence containing instructions is never promoted to trusted instructions. Malicious or embedded commands remain
  data and are covered by regression tests.

## Tray overlay

- The overlay is the existing hidden main window in a borderless tray mode. It uses existing observer/evidence/analysis
  owners; it does not create a second runtime.
- The native window commands only change size, decorations, focus, always-on-top and taskbar visibility. They add no
  filesystem, network or credential capability.
- Linux does not emit Tauri tray click events; a minimal native menu is the documented fallback. The overlay is not
  claimed to work there.

## Content security policy

The Tauri CSP is now set to `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, self/data
images, `connect-src ipc: http://ipc.localhost`, `object-src 'none'`, `base-uri 'self'` and `frame-ancestors 'none'`.
A development CSP additionally allows the Vite origin and websocket. The macOS arm64 native bundle builds with this CSP;
full interactive webview validation on every target remains release work. Any future native capability must be added
explicitly. The HTTP capability remains broad for user-configured integrations and is a documented accepted risk.

## SSL verification

`sslDisabled` is opt-in, clearly labeled in settings and only affects observer/integration HTTP through
`createObserverFetch`. It enables accepting invalid certificates and hostnames, which exposes the user to
man-in-the-middle attacks. It never affects inference: `createInferenceFetch` always validates certificates and
hostnames. Do not enable it by default, in mock mode or in tests. A custom inference provider with an invalid
certificate fails instead of silently downgrading.

## Opening project links

External links are restricted to `http`/`https`. The optional browser selection stores an OS-provided browser id
(macOS bundle id, Windows executable path, Linux desktop app id) and the native `open_with_browser` command only
launches an id that is currently detected as an installed web handler; the renderer cannot pass an arbitrary program.
If the stored browser disappears, links fall back to the system default. The browser setting never leaves the device.

## Tray window bridge

The dedicated tray window is a local webview, not a second operational runtime. Its RPC client can only call methods
on an explicit allowlist in the main window; requests carry a correlation id and time out if the main owner does not
answer. Window-local main controls cannot be invoked through the bridge. External links, issue creation and clipboard
writes from the tray execute in the main client, so browser selection, URL validation and existing payload allowlists
remain in force.

## Mock and test data

Mock scenarios are synthetic. Playwright runs against the mock runtime. Never capture a real token, customer log or
personal data in a test, trace or screenshot. CI requires no secrets for validation.

## Unresolved findings and accepted risks

| Finding                                                              | Severity            | Status                                                                                                              |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Config and exports store integration tokens in plaintext             | Medium              | Accepted for local-first 3.x; documented. Encrypting at rest is a future decision.                                  |
| CSP is set but not interactively validated on every target          | Medium              | macOS arm64 bundle built; remaining targets require native smoke validation before release.                           |
| HTTP capability allows any `http(s)` host                            | Medium              | Required for user-configured integrations. Revisit if integrations gain fixed hosts.                                |
| `react-router` 6.30.6 open-redirect / SSR deserialization advisories | Moderate            | Tracked. App uses `HashRouter` without SSR, reducing exposure; fix requires router major upgrade.                   |
| `fast-xml-parser` 4.5.7 CPU advisory for unterminated stop-node tags | Low                 | Tracked. CCTray input is user-configured; fix requires parser major upgrade.                                        |
| Dev-only tinypool, simple-git and other build-tool advisories        | Low for shipped app | Accepted while on the current toolchain; the dev server binds `127.0.0.1`. Revisit during the next tooling upgrade. |
| Windows builds are unsigned/not notarized                             | Operational         | Release workflow does not configure Windows signing. Users may see OS warnings. Requires human credentials to change. |
| Issue webhook payload compatibility                                  | Informational       | Keep the allowlist field-compatible; document intentional changes.                                                  |
| Diagnostic redaction cannot prove every secret is removed            | Medium              | Accepted for Phase 1. Recognizable patterns and configured credentials are removed; encoded/unknown secrets may survive. |
| Diagnostic log redirect host allowlist may need maintenance          | Low                 | Accepted. Unexpected hosts are rejected as partial evidence; no credentials are forwarded.                           |

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
- [ ] Diagnostic evidence is opt-in, bounded, sanitized, memory-only and absent from the issue webhook.
- [ ] Inference destinations are classified, consent is explicit, redirects are rejected and connectivity tests carry no evidence.
- [ ] Model output is validated, rendered as text and never executed; citations are subset-checked.
- [ ] Log redirects and external links cannot carry credentials or execute remote content.
- [ ] New native permission is least-privilege and documented.
- [ ] Handoff excludes configuration, credentials and stale analysis; clipboard writes are explicit and previewed.
