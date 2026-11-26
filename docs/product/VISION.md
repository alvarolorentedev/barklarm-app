# Vision

Barklarm is the radiator for the AI age: one local, glanceable surface that tells you what is broken, what changed, and
what to do next — without sending your operational data to someone else's cloud.

## Today

Barklarm 4.0 is a native Tauri app. Observers poll CI and observability sources, reduce each source to a status, and
keep the tray icon, menu and notifications in sync. Configuration and credentials stay on the machine. Ten integrations
ship today: GitHub Actions, Azure DevOps, Bitbucket, CCTray, Datadog, Sentry, New Relic, Opsgenie, Grafana and Graylog.
Phase 1 adds opt-in, bounded diagnostic evidence for GitHub Actions failures. Phase 2 adds optional local intelligence:
a managed llama.cpp runtime or a user-configured OpenAI-compatible provider, with cited and validated explanations.
Phase 3 adds a compact tray overlay, a full Radiator page, failure detail with evidence citations and a deterministic
coding-agent handoff.

## Phase 3: the radiator experience

Barklarm 4.0 puts the radiator first. Clicking the menu-bar icon opens a compact overlay with operational counts and
one row per observer; a failure opens a focused detail with the likely cause, the next useful action and a deterministic
coding-agent handoff. The full window remains the detailed surface for evidence, citations, observers and settings.

The overlay is one tray surface, not a left-click view plus a separate right-click menu design. Linux keeps a native
menu fallback because Tauri cannot emit tray click events there. AI never changes operational status, colours or the
tray icon.

## Direction

The radiator becomes a diagnostician:

1. **Evidence first.** Keep source-specific failure identifiers and minimal evidence alongside status.
2. **Local reasoning.** Explain failures with local models, grounded in retrieved evidence.
3. **Actionable guidance.** Recommend the next check or fix, and say when evidence is insufficient.
4. **Trust by default.** Never leak secrets, never execute instructions found in logs, and show uncertainty instead of
   guessing.

This direction is a product hypothesis, not a commitment to a cloud service or agent framework. Phase 2 implements
opt-in local inference and a custom-provider path; there is still no backend, account or mandatory cloud dependency.

## Phase 0 scope

Make the repository capable of sustained, autonomous engineering: reproducible installs, a browser-runnable mock
application, deterministic scenarios, one quality command, browser acceptance tests, native checks, explicit boundaries
and agent-ready documentation.

## Phase 1 scope

Collect and present bounded, sanitized evidence for supported failures, with deterministic fixtures for future
evaluation. Evidence is opt-in and memory-only. No inference or model runtime is added.

## Phase 2 scope

Optional, local-first diagnosis: deterministic evidence context, a versioned prompt, strict validation, a managed
llama.cpp runtime, verified on-demand GGUF downloads, a custom OpenAI-compatible provider, explicit remote consent and a
separate analysis panel. Intelligence is disabled by default and never changes operational status.

## Phase 3 scope

The intelligent radiator: one compact tray overlay, a full Radiator page, failure detail with evidence citations,
deterministic agent handoff, contextual activation and accessible light/dark presentation. No new evidence engine,
analysis manager, integration, model or cloud service.

## Non-goals

- No autonomous remediation, tool calling, shell execution, incident management or persistent analysis history.
- No backend, account system, telemetry, model marketplace or mandatory cloud infrastructure.
- No incident-management platform, on-call scheduling or team workflows.
- No rewrite of the Tauri/React architecture or integration surface.
