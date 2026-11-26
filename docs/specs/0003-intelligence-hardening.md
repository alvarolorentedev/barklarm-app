# 0003 — Intelligence hardening (Phase 2.1)

## Status

Implemented on `fix/intelligence-hardening`; native and real-model verification are recorded in the checklist below.

## Problem

The Phase 2 audit found reliability, security and lifecycle weaknesses that are not visible in the happy-path tests:

- managed inference could fall back to browser `fetch` under a CSP that only allows Tauri IPC;
- inference inherited the observer `sslDisabled` compatibility switch;
- consent and provider keys were bound with a non-cryptographic cache hash;
- request deadlines stopped when response headers arrived;
- concurrent native startup could spawn overlapping runtimes, and stale cleanup could signal any
  `llama-server` by name;
- model verification trusted a size, a header and a marker instead of the pinned manifest;
- evidence eviction, analysis retention and context budgets were not consistently bounded;
- evaluation bypassed `AnalysisManager` and did not separate model failures from application safeguards.

## Goals

1. Managed inference works in the real Tauri app while the production CSP stays restrictive.
2. Remote/private inference always validates TLS; observer compatibility settings never affect it.
3. Consent and credentials are bound to a canonical destination + model identity and can be revoked.
4. Every inference request has one cancellation/deadline identity covering the full body lifecycle.
5. Native runtime start/stop is serialized, cancellable and status-accurate; cleanup cannot kill unrelated
   processes.
6. Model activation verifies the pinned manifest, including a full hash when required.
7. Download, cancellation and removal cannot promote a cancelled or superseded file.
8. Evidence and analysis retention are owned, bounded and invalidated together.
9. Context assembly uses the effective managed context and verifies token budgets with the tokenizer.
10. Evaluations exercise the production analysis lifecycle and report safety separately from diagnosis.
11. A native runtime smoke test and a release-candidate workflow exist without pretending each platform is
    fully qualified.

## Non-goals

No new integrations, models, marketplace, MCP, incident history, database, UI redesign or cloud service. No public
release. No weakening of CSP, coverage gates or existing security policy.

## Requirements

1. **Transport.** Desktop inference uses the Tauri HTTP plugin. Managed tokens are sent only to the loopback endpoint
   returned by the native runtime. There is no browser `fetch` fallback in the desktop path. CSP is unchanged.
2. **TLS isolation.** Inference transport never sets `danger.acceptInvalidCerts` / `acceptInvalidHostnames`.
   `sslDisabled` remains observer-only.
3. **Destination identity.** `destinationFingerprint` is SHA-256 over canonical `https?://host[:port]/path|model`,
   prefixed to distinguish it from the legacy cache hash. Consent and keys fail closed. Users can revoke consent.
4. **Import.** Native import forces `intelligenceMode: "disabled"` into the same atomic config write.
5. **Request lifecycle.** One controller and one deadline cover connect, headers and the bounded body read. External
   cancellation cancels the body. Structured-output fallback is limited to provider capability errors (400/422), at
   most three modes.
6. **Native lifecycle.** `stopped`, `starting`, `ready`, `stopping`, `failed` are explicit. Startup is serialized and
   coalesced; stop cancels a start; stale starts cannot publish a newer endpoint; an exited child invalidates the
   endpoint; repeated failures are rate-limited.
7. **Ownership.** A marker records PID, process start identity, executable path and instance nonce. Cleanup only signals
   a process whose identity matches the marker and the resolved binary. A stale marker alone is never authorization.
8. **Runtime security.** Loopback only, auth-verified health, mode-0600 token file created exclusively, token/pid files
   removed on every path, proxy variables removed/neutralized, bounded startup, one slot, no web UI/slots.
9. **Model integrity.** The verification record is JSON bound to model id, version, file name, size and SHA-256.
   Lightweight status checks read the record; activation performs a full asynchronous SHA-256. Legacy markers are
   upgraded only after a full hash.
10. **Download.** One owner per destination, epoch-guarded cancellation, no promote after cancel/remove, existing valid
    files preserved until a verified replacement is ready, bounded bytes, approved HTTPS redirects.
11. **Availability.** Report platform, artifact, hardware, model, runtime and release qualification separately. Custom
    providers remain usable when managed inference is unavailable.
12. **Retention.** One cache/queue/evidence lifecycle; TTL is enforced by explicit pruning independent of UI reads;
    evidence eviction/expiry/observer removal/recollection clear analysis; diagnostics and intelligence disable clear
    every collection; active inference is not killed by idle reaping.
13. **Context.** Effective context is clamped to the managed runtime maximum; output budget is normalized; tokenizer
    verification includes system/user prompt; deterministic reduction is bounded; truncation remains visible.
14. **Validation.** Citations are subset-checked, insufficient/limited responses cannot be conclusive without
    uncertainty, and parsed/normalized fields are re-scanned for secrets and destructive commands.
15. **Evaluation.** `scripts/evals/run.ts` drives `AnalysisManager`; reports record model/runtime/prompt/fixture/budget
    identity, per-case outcome, repair count, latency and safety separately from correctness. Held-out cases remain
    held out.
16. **Verification.** A real-runtime smoke test checks binary/libraries, model hash, loopback binding, auth rejection,
    structured inference, production validation and cleanup. Standard CI remains model-free.

## UX and operational impact

- Enabling managed intelligence still starts lazily and stops after five idle minutes.
- TLS failures for custom providers now surface as actionable provider errors; observer `sslDisabled` no longer helps.
- Existing destination approvals and provider keys are invalidated by the fingerprint migration; users re-approve and
  re-enter keys. This is intentional and documented.
- Model status may report `corrupted` until re-verification/re-download when a legacy or malformed record is found.
- Runtime status now exposes `starting`/`stopping`; the existing UI already renders those values.

## Data and evidence

Analysis and evidence remain in memory. No new persistence except the native model verification record and the runtime
ownership marker (PID identity, executable path, instance nonce; no tokens, prompts or evidence). Token files are
deleted after startup. Evaluation artifacts stay under the gitignored `evals/results/`.

## Architecture and boundaries

- `src/core/intelligence/**` stays free of Tauri and native process code.
- `src/mainview/desktop/**` chooses the Tauri transport and passes it into the provider; no TLS policy leaks from
  observers.
- `src-tauri/src/intelligence/**` owns lifecycle, process identity, credentials, model verification and download.
- New ADRs: 0014 native inference transport, 0015 runtime ownership/lifecycle, 0016 manifest-bound model verification
  and 0017 analysis/evidence retention.

## Security

- No CSP change. No new listener. No token in arguments, logs or marker files.
- Consent/credentials are digest-bound and fail closed. Import cannot enable inference.
- Process cleanup requires identity verification; PID reuse and unrelated `llama-server` instances are rejected.
- Model activation requires manifest-bound integrity; same-size replacement is detected by the full hash.
- Residual risks: local user with process/filesystem rights can interfere; loopback custom runtimes can forward data;
  renderer still briefly holds a provider key; tokenizer estimates are not a formal proof.

## Testing and evaluation

- Unit: transport selection/TLS flags, fingerprint vectors, request lifecycle (delayed headers, stalled body,
  oversized, cancellation, redirects), retention/invalidation, context/tokenizer, validator, managed provider.
- Native: lifecycle serialization/cancel/timeout/exit, ownership identity, model record/full hash, download guards.
- Browser: existing intelligence scenarios; no new visual feature except consent revocation.
- Evaluation: deterministic `AnalysisManager` cases plus targeted regression fixtures; explicit local real-model run.
- Native smoke: opt-in real runtime script; release-candidate workflow is manual and non-publishing.

## Rollout and rollback

Revert the branch. Reverting invalidates nothing persisted by Phase 2; new verification/runtime markers are ignored by
the old code. Users who re-approved destinations after the migration must re-approve if they roll back. Model files are
unchanged; only the adjacent marker format changes.

## Open questions

- Real-model and packaged-app qualification on non-macOS targets remains release work; see the checklist and platform
  matrix.
