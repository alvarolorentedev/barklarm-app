# Vision

Barklarm is the radiator for the AI age: one local, glanceable surface that tells you what is broken, what changed, and
what to do next — without sending your operational data to someone else's cloud.

## Today

Barklarm 3.x is a native Tauri app. Observers poll CI and observability sources, reduce each source to a status, and
keep the tray icon, menu and notifications in sync. Configuration and credentials stay on the machine. Ten integrations
ship today: GitHub Actions, Azure DevOps, Bitbucket, CCTray, Datadog, Sentry, New Relic, Opsgenie, Grafana and Graylog.
Phase 1 adds opt-in, bounded diagnostic evidence for GitHub Actions failures, still local and without inference.

## Direction

The radiator becomes a diagnostician:

1. **Evidence first.** Keep source-specific failure identifiers and minimal evidence alongside status.
2. **Local reasoning.** Explain failures with local models, grounded in retrieved evidence.
3. **Actionable guidance.** Recommend the next check or fix, and say when evidence is insufficient.
4. **Trust by default.** Never leak secrets, never execute instructions found in logs, and show uncertainty instead of
   guessing.

This direction is a product hypothesis, not a commitment to a model vendor, cloud service or agent framework. No
inference, model download or cloud backend is implemented in Phase 1.

## Phase 0 scope

Make the repository capable of sustained, autonomous engineering: reproducible installs, a browser-runnable mock
application, deterministic scenarios, one quality command, browser acceptance tests, native checks, explicit boundaries
and agent-ready documentation.

## Phase 1 scope

Collect and present bounded, sanitized evidence for supported failures, with deterministic fixtures for future
evaluation. Evidence is opt-in and memory-only. No inference or model runtime is added.

## Non-goals

- No AI features, model runtime, embeddings or prompt pipeline in this phase.
- No backend, account system, telemetry or mandatory cloud infrastructure.
- No incident-management platform, on-call scheduling or team workflows.
- No rewrite of the Tauri/React architecture or integration surface.
