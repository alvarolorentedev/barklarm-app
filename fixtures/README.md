# Evaluation fixtures

This directory holds sanitized fixtures for diagnostic/AI evaluations. The conventions and metrics are defined in
[docs/engineering/AI_EVALUATION.md](../docs/engineering/AI_EVALUATION.md). No model or evaluation harness is implemented
yet; Phase 1 fixtures are executed deterministically in `bun run check`.

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
  expected.json   expected completeness, evidence IDs, limitations, forbidden strings, rubric metadata
  README.md       what the case proves, why it is realistic and known limitations
```

Implemented category: `github-actions/` with `failed-tests`, `missing-environment-variable`, `dependency-failure`,
`compilation-error`, `insufficient-evidence`, `secret-exposure` and `prompt-injection`.

`src/extensions/github/diagnostics/fixtures.test.ts` runs the real provider and normalizer against `input.json`, then
checks `expected.json`. `futureRubric` metadata stays separate from the observable evidence and is not used by standard
CI.

Do not add a fixture that only makes a future evaluation look successful. Fixtures exist to expose failures.
