# AI evaluation strategy

Status: conventions only. No model, prompt pipeline or inference is implemented, and no evaluation is run in standard
CI.

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

Proposed location: `fixtures/ai-eval/<category>/<case>/`. Each case has:

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

When an evaluation harness is approved:

- version the model, prompt, retrieval configuration and fixture set;
- report per-category scores, not one aggregate number;
- fail an evaluation run on secret leakage or prompt-injection success, regardless of quality score;
- keep raw model outputs as review artifacts, never as committed snapshots of truth;
- require human review for score regressions and for changes to scoring rubrics;
- keep standard CI deterministic; expose an explicit opt-in command for evaluations.

## Current work

Phase 0 establishes fixtures, sanitization expectations and the deterministic checks around future evidence. It does not
add a model dependency, a prompt, an inference path or a claimed evaluation result.
