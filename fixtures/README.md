# Evaluation fixtures

This directory is reserved for sanitized fixtures used by future diagnostic/AI evaluations. The conventions and metrics
are defined in [docs/engineering/AI_EVALUATION.md](../docs/engineering/AI_EVALUATION.md). No evaluation harness or model
is implemented yet.

## Rules

- Every fixture is synthetic. No real tokens, customer logs, hostnames, personal data or proprietary source code.
- Secrets are replaced with obviously fake values and the replacement is documented in the case README.
- Preserve the structural detail needed for diagnosis: error class, stack frames, exit code, missing variable names
  (sanitized), dependency names.
- Include adversarial cases: instructions embedded in logs, encoded payloads, secret-like strings.
- Keep fixtures small, diffable and free of screenshot artifacts.

## Layout

```text
fixtures/ai-eval/<category>/<case>/
  input.json      synthetic source payload, observer config, synthetic: true
  expected.json   expected evidence IDs, forbidden strings, rubric metadata
  README.md       what the case proves and why it is realistic
```

Categories: `github-actions`, `failed-tests`, `missing-env`, `dependencies`, `compilation`, `operational-alerts`,
`insufficient-evidence`, `prompt-injection`.

Do not add a fixture that only makes a future evaluation look successful. Fixtures exist to expose failures.
