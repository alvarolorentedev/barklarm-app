# 0010 — Inference provider trust and consent

Status: accepted (Phase 2)

## Context

Barklarm may use a managed local runtime, a user-configured localhost endpoint, or a remote OpenAI-compatible endpoint.
An external localhost process can forward data elsewhere, and an imported configuration must not silently enable remote
processing.

## Decision

- Three modes: disabled, managed, custom.
- Only the Barklarm-managed runtime is described as local inference controlled by Barklarm.
- Custom endpoints are classified as loopback, private or remote. Non-loopback endpoints require HTTPS. Private and
  remote destinations require explicit consent.
- Consent records are stored outside the imported config (OS credential store) and keyed by destination plus model.
  Changing the destination invalidates consent.
- Redirects are rejected; credentials in URLs are rejected; Authorization headers are sent only to the configured origin.
- Connectivity tests never include diagnostic evidence.
- There is no automatic fallback from managed to custom or remote inference.
- Provider API keys use OS credential storage, scoped by destination fingerprint, and are never written to config,
  exports, prompts, logs or fixtures. Split local/remote keys are isolated by endpoint.
- The renderer receives a key only for the duration of a request; this residual trust boundary is documented. If that is
  unacceptable, a future ADR can move transport into Rust.

## Consequences

- Imported configs cannot authorize remote processing.
- Remote inference fails closed with a consent-required state until the user approves the displayed destination.
- Systems without an available OS credential store can still use managed local inference but cannot persist remote keys
  or consent.
