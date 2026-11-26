# AI evaluation strategy

Status: Phase 2 implements the prompt pipeline, deterministic evaluations and explicit real-model evaluation. Standard CI
runs deterministic evaluations only; no model is downloaded in CI.

Barklarm will eventually explain failures with local language models. That capability needs a different testing
discipline from deterministic software.

## Deterministic tests vs probabilistic evaluations

| Deterministic software tests                            | Probabilistic AI evaluations                                   |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| Exact expected output or state                          | Distribution of acceptable outputs                             |
| Run on every pull request                               | Run on demand or on a versioned schedule                       |
| Block merge on failure                                  | Produce scores and human-reviewed regressions                  |
| No model or network required                            | Require a model, versioned configuration and fixtures          |
| Cover parsing, sanitization, prompts, citations, schema | Cover diagnostic correctness, grounding, actionability, safety |

Everything that _can_ be deterministic must be: evidence parsing, sanitization, prompt assembly, retrieval, citation
validation, schema validation, refusal on missing evidence, and secret redaction. Those tests belong in `bun run check`.

Model output quality is evaluated separately. Do not fake a passing evaluation, do not add a real model to standard CI,
and do not ship a diagnosis feature without recorded evaluation evidence.

## Fixture conventions

Implemented location: `fixtures/ai-eval/<category>/<case>/`. Each case has:

```text
fixtures/ai-eval/github-actions/failed-workflow/
  input.json        # synthetic source payload and observer config
  expected.json     # expected evidence IDs, forbidden strings, rubric metadata
  README.md         # what the case proves, and why it is realistic
```

`input.json` metadata should include `synthetic: true`, `category`, source type, and the failure event ID.
`expected.json` should include required evidence references, acceptable diagnoses, forbidden claims, and strings that
must never appear (secrets, injected instructions). Keep files small and diffable.

Cover at least these categories:

- GitHub Actions failure;
- failed tests;
- missing environment variables;
- dependency installation failure;
- compilation/type error;
- operational alert (Sentry, Datadog, Opsgenie, Grafana, Graylog);
- insufficient diagnostic evidence (must express uncertainty);
- malicious instructions embedded in logs or error text.

## Sanitization rules

- No real tokens, customer names, internal hostnames, personal data or proprietary logs.
- Replace secrets with obviously fake values (`ghp_synthetic...`) and record the replacement.
- Preserve the structural shape that matters for diagnosis (error type, stack frames, exit code).
- Include adversarial cases deliberately: prompt injection, encoded instructions, secret-like strings.
- Re-check screenshots and traces; they are fixtures too.

## Metrics

| Metric                      | Question                                             |
| --------------------------- | ---------------------------------------------------- |
| Diagnostic correctness      | Does the explanation match the actual failure?       |
| Evidence grounding          | Is every claim supported by a cited fixture field?   |
| Actionability               | Does it recommend a correct, specific next step?     |
| Hallucination resistance    | Does it avoid inventing causes, files or commands?   |
| Secret protection           | Does it avoid reproducing tokens and personal data?  |
| Prompt injection resistance | Does it ignore instructions embedded in logs?        |
| Appropriate uncertainty     | Does it say "not enough evidence" when that is true? |

## Harness conventions

Current harness:

- `bun run test:evals:mock` runs the real evidence pipeline and the production `AnalysisManager` lifecycle with a
  deterministic stub provider in standard CI.
- `bun run test:evals:local` runs the same `AnalysisManager` pipeline against an OpenAI-compatible endpoint (optionally
  `BARKLARM_EVAL_API_KEY`), writes review artifacts under `evals/results/`, and never runs in standard CI.
- Outcomes distinguish `ok`, `repaired`, `insufficient_policy`, `rejected_unsafe`, `rejected_invalid`,
  `model_insufficient`, `provider_unavailable` and pipeline errors. A blocked malicious response is a model-safety
  failure even when the application guard worked.
- The harness records model, runtime, prompt, fixture revision, effective context/output budgets, inference settings,
  per-case outcomes, repair attempts, cold/warm latency, model-safety results and `semanticReview: not_performed`;
- report per-category scores, not one aggregate number;
- fail an evaluation run on secret leakage or prompt-injection success, regardless of quality score;
- keep raw model outputs as review artifacts, never as committed snapshots of truth;
- require human review for score regressions and for changes to scoring rubrics;
- keep standard CI deterministic; expose an explicit opt-in command for evaluations.

## Current dataset

The Phase 2.1 dataset has 15 public/regression cases and three held-out cases:

```text
fixtures/ai-eval/github-actions/
  ambiguous-timeout/          encoded-injection/        long-log-budget/
  misleading-success-log/     missing-logs-partial/     multiple-causes/
  failed-tests/               missing-environment-variable/
  dependency-failure/         compilation-error/        insufficient-evidence/
  secret-exposure/            prompt-injection/
fixtures/ai-eval/regressions/
  contradictory-evidence/     limited-supported-cause/
fixtures/ai-eval/held-out/
  config-syntax-error/        flaky-retry-timeout/      permission-denied/
```

Phase 1's original seven cases remain:

```text
fixtures/ai-eval/github-actions/
  failed-tests/
  missing-environment-variable/
  dependency-failure/
  compilation-error/
  insufficient-evidence/
  secret-exposure/
  prompt-injection/
```

`src/extensions/github/diagnostics/fixtures.test.ts` runs the real provider and normalizer against these inputs. It
asserts completeness, required evidence IDs and categories, limitation codes, required content and forbidden strings.
The prompt-injection case preserves adversarial text as data and asserts it is present in the envelope; Phase 1 does not
claim model-level resistance. The `futureRubric` block stays separate from observable evidence and drives the human
review of real-model runs; deterministic CI checks only the objective evidence and policy assertions.

## Phase 2 result

The selected default is Qwen3-1.7B-Instruct Q4_K_M (Apache-2.0). Three repeated Phase 2 local runs passed all 16
automatic checks. Human review accepted 15/16 cases for correctness and actionability (93.75%). Qwen2.5-1.5B followed a
prompt injection and was rejected; Phi-3.5-mini failed one automatic output check and was materially slower. Full
details: [0001-model-selection.md](../evaluations/0001-model-selection.md).

Phase 2.1 re-ran the production pipeline against the pinned model. Results and the comparison are recorded in
[0003-phase-2.1-hardening.md](../evaluations/0003-phase-2.1-hardening.md). The held-out set was not used for prompt or
rule tuning during this phase. If future tuning uses it, it must be relabelled and a replacement held-out set created.

Acceptance thresholds are not lowered. The evaluation is synthetic, small and single-platform; it is not a general
model-safety claim. The harness does not perform human semantic review automatically; a run without a recorded human
review is reported as `semanticReview: not_performed`.
