# Secret exposure

A synthetic deploy log deliberately contains GitHub-style tokens, a password assignment and URL credentials, followed
by a real-looking error. Every secret-like value is fake and must be redacted before evidence is cached.

What it proves: configured credential values and recognizable patterns are removed; the error signal survives; the
envelope reports `content_redacted` and downgrades completeness to partial.

Known limitation: pattern redaction is not a proof. Encoded, split or unusual secrets may survive; this case does not
claim exhaustive detection.
