# 0004 — Intelligent radiator experience (Phase 3)

## Status

Implemented on `main` (explicit user instruction: no worktree or branch). Native interactive tray/clipboard
verification is partial; see the checklist and Phase 4 carryover.

## Problem

Barklarm monitors sources, collects bounded diagnostic evidence and produces validated local analyses, but the
product still exposes observers and settings as its primary pages. Diagnosis is buried inside an observer editor, the
tray only offers a native menu, and a user cannot understand health, cause and next action without opening the app.

Phase 3 makes the tray the first surface and the full window the detailed surface:

1. What needs my attention?
2. What happened and why?
3. What should I do next?

## Goals

1. One tray surface. Clicking the tray icon toggles a compact overlay; there is no separate right-click menu design.
2. The overlay shows health counts and one row per observer. A failure opens diagnosis, next action and agent handoff
   without opening the app.
3. The full window exposes a Radiator page with operational summary and all observers, plus a focused failure detail
   route with evidence.
4. Observed status, diagnostic evidence, AI interpretation, recommendations and uncertainty remain visually distinct.
5. A deterministic, sanitized, size-bounded agent prompt can be previewed and copied from the overlay and the app.
6. Diagnostics and built-in intelligence can be activated contextually without a wizard or restart.
7. English and Spanish, light and dark themes, and compact window layouts remain usable.
8. Existing observers, settings, tray status, notifications and issue actions keep working.

## Non-goals

No new integrations, models, inference runtimes, cross-source correlation, autonomous remediation, automatic agent
execution, MCP, incident history, analytics, team features, cloud services, accounts, marketplace or chatbot. No
public README/website/marketing overhaul (Phase 5). No changes to the issue webhook payload or intelligence engine.

## Requirements

### Surfaces

1. **Tray icon:** operational status only; AI never changes its colour or icon.
2. **Tray overlay:** a single 380 px wide popover-style panel with native macOS material, rounded corners and no
   titlebar or close button. It is content-sized between 200 and 520 px, toggles from the tray icon, and hides on focus
   loss or Escape.
3. **Overlay modes:** overview, failure detail, prompt preview, healthy and empty. Footer rows expose the primary
   action, Settings and Quit; failure detail also exposes Open source, Open issue when configured and Copy agent prompt.
   A tray click always opens the overlay, even when the full window is visible. The full window is only opened
   explicitly from an overlay action; the overlay is not a second simultaneous view.
4. **Linux fallback:** Tauri does not emit tray click events on Linux. A minimal native menu (`Open Barklarm`, `Quit`)
   is the platform fallback. The overlay is documented as unavailable there.
5. **Full window:** `/radiator` default, `/radiator/observer/:id` detail, `/observers`, `/settings`, `/general`
   compatibility redirect.

### Health and failures

1. Counts derive from `State`: SUCCESS is Healthy, FAILURE is Failed, CHECKING is Checking, NA is Unavailable.
   Muted failures remain Failed and are counted separately.
2. NA is never counted as healthy. Empty, healthy, attention and unresolved (no failure but NA/CHECKING) states are
   distinct.
3. Failures are ordered non-muted first, then configuration order; identities are stable observer IDs.
4. The overview renders all four operational counts and one row per observer. Failed rows open the failure detail;
   missing diagnosis never hides a failure.
5. Failure detail shows observer, integration, status, failure description, source timestamp when structured evidence
   provides one, evidence/AI status, likely cause with certainty, and the first recommendation with citations. The
   overview does not show diagnosis or recommendations.
6. No numerical severity, uptime or last-success metrics are invented.

### Failure detail

1. Sections: What happened, Why it happened, What to do next, Evidence, Handoff, diagnosis metadata.
2. Observed facts, hypotheses and recommendations are labelled separately. A supported cause is not called confirmed.
3. Citations navigate to the matching evidence item; evidence is rendered as text with truncation, redaction and
   limitations visible.
4. Stale evidence/analysis is rejected by observer and failure identity. A resolved observer shows a resolved state
   and no old diagnosis.
5. Every diagnostic and analysis lifecycle state has a plain-language explanation and a relevant recovery action.
6. Internal reason codes are never the primary message.

### Agent handoff

1. Composition is deterministic and local; no second inference.
2. Trusted instructions are separated from untrusted evidence. Evidence is explicitly data, never instructions.
   Reserved delimiter markers inside untrusted fields are neutralized, and source-derived failure metadata stays inside
   the untrusted block.
3. Only the selected observer's failure, sanitized evidence, validated analysis and safe source URL are included.
4. Config, credentials, provider keys, runtime tokens, unrelated observers and unvalidated model output are excluded.
5. Size limits are deterministic; useful evidence is prioritized and truncation is stated.
6. A preview shows the exact outgoing prompt and whether AI interpretation is included.
7. Clipboard write is explicit; no automatic transmission. Success and failure are announced accessibly.
8. Pattern-based redaction is documented as a safety net, not a guarantee.
9. Handoff works with evidence alone when intelligence is disabled or unavailable.

### Onboarding

1. Empty overlay offers one Add observer action that opens the full Observers page.
2. Empty Observers page recommends GitHub Actions as the first source and marks it as supporting detailed diagnosis.
3. Other integrations remain discoverable and keep their existing forms.
4. Diagnostic collection can be enabled inline with an explanation; it is never silently enabled.
5. Built-in local AI is the recommended intelligence mode. Setup links to the existing model management UI, which
   remains the only downloader.
6. No restart is required after enabling diagnostics, installing a model or approving a provider.

### Presentation and accessibility

1. Compact, native, calm; no gradients, glass, charts, chatbot UI or decorative AI animation.
2. Status is communicated by text and icon, not colour alone.
3. Light and dark themes follow `prefers-color-scheme`; key token contrast meets 4.5:1 for normal text.
4. Keyboard navigation, visible focus, semantic controls, accessible names, live status feedback, reduced motion and
   screen-reader labels are preserved.
5. No horizontal overflow at 380×520 overlay or 720×520 full window.

## Architecture

```text
Tray click -> TrayWindowController -> same main window, tray mode -> /tray routes
                                          |
StatusProvider (existing poll) -----------+--> pure radiator projection
                                          |       |
                                          |       +--> overlay overview
                                          |       +--> full Radiator
                                          |
                                          +--> failure detail reads evidence/analysis
                                                   |
EvidenceManager / AnalysisManager (unchanged) -----+
                                                   |
buildAgentHandoff (pure core) -> preview -> AppRPCClient.writeClipboard
```

- Presentation is a read-only projection. It is not a second source of truth.
- The overview reads only `State`. Failure detail fetches evidence/analysis for its selected failure; there is no
  per-card polling. Reads never trigger collection or inference. Explicit retry buttons remain user actions.
- The overlay is the existing window in a different mode, so there is exactly one renderer and one runtime. A second
  window would duplicate polling, evidence collection and inference unless orchestration moved out of the renderer.
- Native window mode changes live behind `AppRPCClient`; React never imports Tauri.
- No new state-management dependency.

## Data and evidence

The new code reads existing `State`, `DiagnosticSnapshot` and `AnalysisSnapshot` contracts. It adds no persisted data.
The handoff is generated in memory, copied only on user action and never stored. Evidence retention, expiry,
sanitization and analysis invalidation remain owned by the existing managers. No outbound webhook field is added.

## Security

- Evidence, analysis and model output remain untrusted text; no HTML rendering, command execution or automatic URL
  opening.
- Handoff reuses the existing sanitizer, excludes configuration/credentials, checks source URLs and refuses stale
  identities.
- Clipboard is write-only and user-initiated. The desktop runtime uses the native
  `clipboard-manager:allow-write-text` capability behind `AppRPCClient`, with a selectable preview fallback. There is
  no clipboard-read permission.
- The tray window has no new network or file capability; it uses existing window commands only.
- CSP is unchanged.

## Testing

- Core projection and handoff unit tests, including ordering, muted, NA, stale identities, secrets, injection, size
  limits, partial/unsupported evidence and clipboard failure.
- Component tests for overlay/full states, citations, setup actions and feedback.
- Playwright journeys for first observer, at-a-glance health, diagnosis, citation, preview/copy, activation, recovery,
  resolution and regression.
- Visual capture at 380×520 overlay, 860×600 app, 720×520 compact and light/dark; manual review.
- Native smoke: tray toggle, blur hide, Escape, full-app transition, clipboard, CSP, citations, intelligence disable and
  runtime cleanup. Other platforms remain Phase 4 work if unavailable.

## Rollout and rollback

Routes are additive; `/general` redirects. Configuration is unchanged. Tray mode is default on macOS/Windows; the full
app remains reachable. Rollback is reverting the change; no migration is involved.

## Implementation record

- Browser acceptance: 36 Playwright tests pass, including the original configuration/diagnostics/intelligence journeys
  and the new Radiator, tray, citation, handoff, activation, recovery and resolution journeys.
- Unit/component: 564 tests pass. Coverage is 87.48% lines/statements, 86.05% branches and 80.59% functions overall;
  `src/core/**` is 95.42% lines/statements, 89.44% branches and 94.87% functions.
- `bun run check`, `bun run audit`, `bun run test:evals:mock`, `rust:fmt`, `rust:clippy`, `rust:test`,
  `sidecar:smoke` and the release bundle build pass on macOS arm64.
- Visual review used synthetic mock data at 380×520 (overlay), 860×600, 720×520 and light/dark. Assets are in
  [../media/phase3/](../media/phase3/), with a synthetic handoff example in
  [handoff-example.txt](../media/phase3/handoff-example.txt).
- Native interactive limitation: the release app builds, launches, stays resident and has no on-screen app window at
  launch, but this agent environment has no screen capture and tray-click automation could not locate the status item.
  The overlay click, native clipboard write, focus/blur and full-app transition are therefore unverified natively and
  are carried into Phase 4. Browser mocks are not evidence of native window or clipboard behaviour.
- Linux keeps the native tray menu fallback because Tauri cannot emit tray click events there. macOS/Windows use the
  single overlay surface.
- The overlay uses a transparent window, native macOS `Popover` material, Windows Acrylic and a CSS fallback on Linux.
  Rounded corners and the hairline border are CSS; the window mode is guarded so the tray shell cannot render in a
  decorated main window.
- Independent review resolutions: tray icons are decoded through the image pipeline instead of `fetch` under the
  production CSP, with a visible-window fallback if tray creation fails; handoff delimiters and source-derived metadata
  are contained in the untrusted block; focus-loss hiding is deferred briefly to avoid the Windows tray-toggle race;
  CHECKING/NA no longer claim a resolved failure; the last measured tray height is reused; transient polling is sized
  for inference and settled snapshots refresh slowly; overlay prompt preview/recovery works without an AI
  recommendation; the full Radiator refresh checks observers; tray-to-main navigation uses replace semantics; native
  sizing uses physical units and resets maximized/minimized state; truncation cannot leak or misreport sections; and
  localization/shortcut gaps were closed.
- Overview revision: the overlay and full Radiator now show operational counts plus observer rows. Top-level failure
  cards, recommendations and the shared snapshot coordinator were removed; diagnosis and handoff live in failure detail.

## Open questions

None blocking. Native interactive qualification remains Phase 4 work.
