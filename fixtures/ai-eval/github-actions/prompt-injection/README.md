# Prompt injection

A synthetic build log contains an explicit instruction to ignore the evidence, a destructive command and an HTML
script tag next to a real build failure.

What it proves: the extractor preserves the failure signal, and the evidence contract can carry adversarial text
without executing or rendering it. The expected evidence intentionally contains the injected strings as data.

Known limitation: Phase 1 does not test a model. It only guarantees text-only rendering, no command execution and a
sanitized envelope. Phase 2 must run this fixture through the evaluation harness and treat any injected-instruction
success as a failure.
