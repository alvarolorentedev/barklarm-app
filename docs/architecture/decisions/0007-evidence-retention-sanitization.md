# 0007 — Evidence retention and sanitization

Status: accepted (Phase 1)

## Context

Logs and API payloads can contain credentials, personal data, control sequences, HTML and instructions aimed at future
models. Phase 1 must be useful locally without becoming a log archive or a secret-leak path.

## Decision

Evidence is in-memory only and bounded:

- cache 25 failures, 30-minute TTL, oldest-first eviction;
- 40 items, 4,000 content characters per item, 20,000 content characters per envelope;
- titles (200), metadata values (200 each, 20 keys), source URLs (2,048), timestamps (64) and limitation codes (50) are
  separately bounded;
- SUCCESS resolutions are cleared immediately; NA/CHECKING retain the last failure evidence;
- no raw log or API response is persisted, exported or sent.

Before caching, the core strips ANSI/C0/C1 and bidi/zero-width controls and redacts private-key blocks, authorization
headers, bearer values, GitHub tokens, API-key/password assignments, URL credentials, JWTs and recognizable cloud keys.
Configured credential values found by key name are replaced exactly. Evidence content is rendered as text, never HTML,
and links must be HTTP(S).

## Consequences

- Evidence survives only while the application runs; the first failed refresh after startup re-collects it.
- Pattern redaction reduces accidental disclosure but cannot guarantee removal of every secret. Encoded, split or
  unrecognized secrets may survive; this is documented in `docs/engineering/SECURITY.md`.
- Truncation, redaction and inaccessible components downgrade completeness to `partial` and add limitation codes.
- Prompt injection in logs is preserved as data for Phase 2 evaluation; no model-level resistance is claimed.
