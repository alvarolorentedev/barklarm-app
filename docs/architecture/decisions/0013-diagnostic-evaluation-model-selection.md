# 0013 — Diagnostic evaluation and model selection

Status: accepted (Phase 2)

## Context

Diagnostic quality is probabilistic. Exact string matching would reject valid explanations, while an unrecorded model
choice would make the product's central claim unverifiable.

## Decision

- Evaluate against the seven Phase 1 fixtures plus representative and adversarial cases and a separate held-out set.
- Deterministic checks cover context assembly, prompt construction, schema parsing, citations, secret scanning,
  cancellation and insufficient-evidence policy. They run in standard CI with a stub provider.
- Real-model evaluations are explicit, versioned and repeated. Record model, quantization, runtime, prompt, settings,
  fixture version, hardware, cold/warm latency, peak memory, validation, grounding, correctness, actionability and safety.
- Use deterministic objective checks plus a documented human rubric. No cloud LLM judge is required.
- Do not select a default model unless it meets the recorded acceptance thresholds. Never lower thresholds to declare
  success; report the blocker instead.

## Consequences

- The default model is an evidence-backed choice, not a benchmark-only choice.
- A model that fails thresholds leaves Phase 2 implemented but not release-ready.
- Evaluation outputs are review artifacts, not committed truth snapshots.

## Selected model

Qwen3-1.7B-Instruct Q4_K_M, Apache-2.0, pinned by GGUF commit, byte size and SHA-256. Three repeated runs passed all 16
automatic checks; human review accepted 15/16 cases for correctness and actionability. Qwen2.5-1.5B was rejected after
following a prompt injection; Phi-3.5-mini failed one automatic output check and was materially slower. Full evidence is
in [0001-model-selection.md](../../evaluations/0001-model-selection.md).
