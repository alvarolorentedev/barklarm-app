# 0004 — Intelligent radiator implementation checklist

Status: in progress. Every item is verified before the Phase 3 report is written.

## Structure

- [x] Spec `0004-intelligent-radiator-experience.md`
- [x] ADR 0018 radiator presentation projection
- [x] ADR 0019 agent handoff and clipboard boundary
- [x] Radiator default route and `/general` compatibility redirect
- [x] Navigation: Radiator, Observers, Settings
- [x] Settings rename and section anchors
- [x] Tray mode window controller (`/tray`)
- [x] Content-sized tray window and placement
- [x] Single tray surface; no separate right-click menu on macOS/Windows
- [x] Linux native-menu fallback documented

## Radiator

- [x] Pure summary/counts projection
- [x] Stable failure ordering and muted handling
- [x] Empty, healthy, attention and unresolved states
- [x] Failure cards with diagnosis/next step
- [x] All-observer compact list
- [x] Failure detail route
- [x] Citation navigation to evidence
- [x] Stale evidence/analysis rejection
- [x] Resolved-failure state
- [x] Recovery states for every diagnostics/intelligence status
- [x] Overlay list/detail/handoff/healthy/empty modes

## Handoff

- [x] Deterministic composer
- [x] Trusted/untrusted separation
- [x] Evidence-only mode
- [x] Sanitization and size limits
- [x] Safe source URL policy
- [x] Preview with AI disclosure
- [x] Clipboard write and accessible feedback
- [x] Clipboard failure fallback
- [x] Security tests: secrets, malicious instructions, stale identity

## Onboarding

- [x] Empty overlay → Observers
- [x] First-run GitHub Actions recommendation
- [x] Diagnostic integration marker
- [x] Inline diagnostics activation
- [x] Built-in intelligence setup link
- [x] No restart path
- [x] Recovery guidance

## Visual and accessibility

- [x] Tokenized light theme
- [x] Dark theme regression pass
- [x] Contrast checks
- [x] Keyboard/focus management
- [x] Escape hides the overlay
- [ ] Native tray blur/focus-loss behaviour — unverified; release build launches hidden and the agent environment cannot click the status item
- [x] Reduced motion
- [x] No horizontal overflow at compact sizes
- [x] English and Spanish
- [x] Visual screenshots reviewed

## Mock runtime

- [x] Mixed status scenario
- [x] Failure resolution scenario
- [x] Clipboard failure scenario
- [x] Injection scenario
- [x] Analysis recovery scenario
- [x] Scenario URLs documented

## Validation

- [x] `bun run check` — 564 unit/component tests, 87.48% lines/statements, 86.05% branches, 80.59% functions; renderer build and mock isolation pass
- [x] `bun run test:e2e` — 36/36 Playwright tests pass
- [x] `bun run audit` — no high/critical production advisories
- [x] `bun run test:evals:mock` — 18/18 deterministic cases pass
- [x] Rust checks — fmt, clippy and 27 tests pass; release bundle builds
- [ ] Native interactive smoke — blocked: no display capture or tray click automation in this environment; release build launches hidden, Rust placement tests and native build pass
- [x] Independent review — completed; blocking findings fixed (tray icon CSP, delimiter spoofing, trusted failure metadata, tray focus race, CHECKING/NA resolution copy)
- [x] Documentation updated
- [x] Phase 4 carryover recorded
