# 0003 — Intelligence hardening implementation checklist

Status: implemented; validation results are appended as commands complete. Static findings were re-checked against the
Phase 2 tip (`feat/local-intelligence-engine`, `d74ef8e`); the audit commit named in the task was not present locally.

## Findings matrix

| ID | Finding | Severity | Reproduction evidence | Fix | Regression test |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Managed inference fell back to browser `fetch` under an IPC-only CSP | P0 | `ManagedInferenceProvider` was constructed without a transport in `desktop/client.ts`; provider defaulted to global `fetch` | `createInferenceFetch` uses Tauri HTTP; provider factory injects it; no desktop fallback | `transport.test.ts`, `providers/factory.test.ts`; real-runtime smoke |
| 1.2 | Inference inherited observer `sslDisabled` | P0 | `inferenceFetch` spread `config.sslDisabled` into `danger` for every provider | Separate inference/observer factories; inference never sets `danger`; TLS errors surface | `transport.test.ts`; TLS remains enabled in Tauri client |
| 1.3 | Consent/keys used the FNV cache hash | P1 | `destinationFingerprint` called `hashString` | SHA-256 canonical endpoint+model identity with `v2:` domain separation; revoke API; atomic import disable | `endpoint-policy.test.ts`, `store.rs` import test, Rust credential tests |
| 1.4 | Deadline/cancellation stopped at response headers | P1 | `request` cleared timer/listener before `readBounded` | One controller/deadline covers connect, headers and bounded body; abort cancels reader | `openai-compatible.test.ts` delayed headers, stalled body, oversized, cancel, no-retry |
| 2.1 | Concurrent startup could spawn overlapping runtimes | P1 | `ensure` registered ownership only after startup | Serialized lifecycle, epoch cancellation, explicit states, stale-result guard, failure backoff | `runtime.rs` stop-pending-start test; real-runtime smoke |
| 2.2 | Stale cleanup killed any process named `llama-server` | P1 | `cleanup_stale_marker` checked only command/name | Marker binds PID start identity + executable + owner; concurrent owner blocks cleanup | `cleanup_requires_exact_identity...`, `linux_start_time_parser...` |
| 2.3 | Token/port/health/proxy hardening gaps | P1 | Token file written then chmod; health did not check auth/model; child inherited proxies | Exclusive 0600 create; auth+alias probe; loopback checks; proxy removal; bounded startup | `token_files_are_private_and_exclusive`, arg allowlist, real smoke auth/loopback |
| 2.4 | Idle reaping could stop an active inference | P1 | Reaper used only last-used time | Active-inference counter/lease; begin/end commands; reaper protects active work | `active_inference_is_never_reaped_as_idle` |
| 3.1 | Verification trusted size/header/marker | P1 | `is_verified` did not read the marker content | Manifest-bound JSON record; lightweight status vs full activation hash; same-size swap test | `download.rs` record/swap/legacy tests; activation hash |
| 3.2 | Download/cancel/remove races could promote | P1 | No owner guard or epoch; existing file deleted first | Single owner, cancellation notification, epoch-guarded promotion, preserve valid file, redirect policy | `download.rs` guards; lifecycle tests; smoke model hash |
| 3.3 | Platform list implied operational inference | P1 | `managedRuntimeSupported` was platform-only | Separate platform/artifact/hardware/model/runtime/release fields and reasons | `hardware.rs` qualification test; UI status types |
| 4.1 | Evidence/analysis retention could diverge | P1 | Evidence eviction/expiry did not always clear analysis; cache survived diagnostics disable | `prune()` on both managers, cleared events, cache clearing, fingerprint check before snapshot | `evidence-manager.test.ts`, `analysis-manager.test.ts` retention tests |
| 4.2 | Stale completions could publish | P1 | Staleness relied on key/generation only | Execution identity + controller + queue-full retry + rate-limited blocker retry | `analysis-manager.test.ts` supersede/retry tests |
| 4.3 | Context/output budgets could diverge from runtime | P1 | 32k request clamped to 16k runtime; tokenizer compared wrong budget | Shared `effectiveBudget`; 2,048–16,384 clamp; tokenizer verifies full prompt; bounded reduction | `context-assembler.test.ts`, manager tokenizer tests |
| 4.4 | Escaped/control-transformed output bypassed scanning | P1 | Raw-string scan ran before parse | Re-scan normalized draft; limited-supported rule; every generated field already schema-checked | `validator.test.ts` escaped secret/command tests |
| 4.5 | First-run recovery required restart/recollection | P1 | Blocked analysis was not retried after model install/consent | `retryBlocked()` on status/approval, rate-limited; consent refresh | `analysis-manager.test.ts` retry/rate-limit tests |
| 5.1 | Evaluation bypassed `AnalysisManager` | P1 | `run.ts` assembled context and called provider directly | Harness drives production manager, context, prompt, validation and repair | `bun run test:evals:mock` |
| 5.2 | Scoring conflated model and guard failures | P1 | Single pass/fail and literal checks | Outcome taxonomy, model-safety vs guard, all-field scan, regression fixtures | 18 mock cases; report schema |
| 5.3 | Reproducibility metadata incomplete | P1 | Report had model/mode only | Model/runtime/prompt/fixture revision/budgets/config/outcomes/repair/latency/held-out | `results.json` metadata |
| 6.1 | Sidecar smoke only ran `--version` | P1 | `smoke-sidecar.ts` | New `sidecar:smoke:runtime` covers hash, loopback, auth, structured inference, validation, cleanup | real-runtime smoke run |
| 6.2 | No native app journey | P1 | none | This checklist records the packaged app run and its manual limits | native build + app smoke |
| 6.3 | No non-publishing RC workflow | P1 | only tag release workflow | Manual five-target package workflow, no release job | workflow review |

## Behaviour boundaries documented

- Consent/key migration is a hard cut: old FNV-keyed approvals and keys are unreachable and must be recreated. This is
  intentional for a security-sensitive identity.
- Legacy model markers are accepted for lightweight status and upgraded only after a full hash. A malformed record
  reports `corrupted`.
- NA/CHECKING retain the last failure evidence until SUCCESS or a new failure; TTL still removes it independently.
- A loopback custom provider is described as externally managed, not guaranteed local.
- The eval harness does not perform human semantic review; runs without a recorded review say `not_performed`.

## Validation log

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | pass |
| `bun run check` | pass — 510 tests, 86.83% lines/statements, 86.06% branches, 87.12% functions |
| `bun run test:e2e` | pass — 23 Playwright tests |
| `bun run audit` | pass — no high/critical production advisories |
| `bun run rust:fmt` | pass |
| `bun run rust:clippy` | pass — warnings denied |
| `bun run rust:test` | pass — 23 native tests |
| `bun run test:evals:mock` | pass (18 cases) |
| `bun run sidecar:fetch` | pass (llama.cpp b12732 macOS arm64) |
| `bun run sidecar:smoke` | pass (version b12732) |
| `bun run sidecar:smoke:runtime` | pass (hash, loopback, auth, structured inference, validation, cleanup) |
| `bun run test:evals:local` | pass — 3 repeats, 54/54 case-runs, 0 repairs, 0 safety/guard failures |
| Native build | pass — release binary, `.app` and `.dmg` built |
| Native app journey | partially verified — app-owned runtime, loopback/auth, real bytes, graceful quit cleanup; rendered citations and UI-disable remain manual |

## Independent review findings and resolutions

Two separate review agents ran against this branch. Their findings are recorded here; this is agent review, not human review.

### TypeScript/intelligence review

| Finding | Severity | Resolution |
| --- | --- | --- |
| Runtime `sslDisabled` toggle was frozen at startup | P1 | `createObserverFetch` now accepts a getter; the desktop client reads `config.sslDisabled` per request. Regression test added. |
| Automatic retry could re-send evidence to a failing remote provider forever | P2 | Automatic retry now covers only local first-run blockers (`model_missing`, `runtime_missing`, `runtime_failed`, `consent_required`). Remote timeout/auth/rate-limit requires manual reanalysis. Test added. |
| Evaluation reported an unused temperature | P2 | Removed the env override; report states the actual fixed 0.2. |
| Malformed fixture silently skipped | P2 | Fixture parse errors now fail the run. |
| Fixture revision used the filtered set | P2 | Revision is computed over all fixtures; filtered counts remain separate. |
| Stale analysis could publish for discarded evidence | P2 | Stale ingest invalidates the observer; `getSnapshot` drops non-waiting entries when evidence is no longer owned. Test added. |
| Managed lease-start failure looked like an invalid model response | P2 | Mapped to `unavailable` / `runtime_failed`; test added. |
| Non-stream response fallback could buffer unbounded text | P2 | Falls back only with a declared bounded `content-length`; otherwise fails closed. Test doubles updated. |

Residual: cross-origin redirect rejection is still post-hoc (the native client is configured not to follow, and the response is never used).

### Native runtime/download review

| Finding | Severity | Resolution |
| --- | --- | --- |
| Cancel left cached status at `downloading` | P1 | `cancel()` now writes `cancelled` immediately; epoch guard still protects success/failure transitions. Test added. |
| Shared marker could be overwritten/deleted by concurrent instances | P1 | Per-instance `runtime-<instance>.pid` markers; startup sweeps all; each runtime removes only its own marker. |
| Per-attempt startup cap was too short | P2 | Raised to 45 s per attempt (three attempts, bounded). Measured cold start is 13 s. |
| Promotion could lose an existing model or record | P2 | Record is prepared first; the old model is moved to a backup; promotion/cancel/marker failures restore it. |
| No epoch check after promotion | P2 | Post-rename epoch/cancel check restores the backup and removes the new file. |
| Start/remove were not serialized | P2 | A download operation mutex serializes ownership; start reports `download_in_progress`; remove fails rather than deleting under an active task. |
| Idle reaper could stop a freshly ensured runtime | P2 | The reaper re-checks active state and idle time under the lifecycle lock before stopping. |
| Stop/quit waited for an uncancellable activation hash | P2 | Activation hashing is cooperative through a cancellation flag; stop aborts the read promptly. Test added. |
| Hardware status did expensive process enumeration on a 1 s poll | P2 | Status now refreshes only memory and CPU topology instead of every process. |
| Windows identity relied on deprecated `wmic` | P2 | `sysinfo` is now the primary Windows identity source with `wmic` fallback. |
| Token files could remain after a write failure or crash | P2 | Failed writes remove the file; startup sweeps only token files older than one hour. |
| Key deletion reported success on keychain failure | P2 | Only `NoEntry` is success; other keychain errors propagate. Client fails closed with a configuration error. |
| Auth probe could accept a port-racing local service | P2 | Listener ownership is checked against the child PID via `lsof`/`ss`/`netstat` where available, in addition to auth and model-alias probes. |

Residual: signalling is still a check-then-kill operation, so a hostile local process racing PID reuse is outside the
guarantee. Platforms without a usable identity tool fail closed (marker retained, process not signalled). The activation
hash cache uses path/size/mtime; local write access to the application data directory is outside the integrity boundary.
