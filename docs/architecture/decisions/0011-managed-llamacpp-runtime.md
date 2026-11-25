# 0011 — Managed llama.cpp runtime

Status: accepted (Phase 2)

## Context

Barklarm must offer built-in inference without requiring Ollama, LM Studio or another application. The app is a
lightweight radiator, not a permanently running AI server, and native process management must stay outside React.

## Decision

- Use a pinned llama.cpp `llama-server` sidecar with a GGUF model.
- Native Rust owns download, verification, storage, process start/stop, health and hardware checks.
- Lazy start on analysis; reuse; stop after a conservative inactivity timeout (default 5 minutes), on disable and on
  quit. Crash restarts are bounded.
- Bind only to `127.0.0.1` on an available port. Use an ephemeral token supplied through a mode-0600 file, not a fixed
  port or long-lived shared secret.
- Explicit argument allowlist: model path, loopback host/port, token file, context size, thread count, one parallel slot,
  no web UI and no unused server capabilities. No shell interpolation, arbitrary executable or model paths, or
  user-controlled arguments.
- Record a PID/start marker so the next launch can reap a stale sidecar after a crash.
- Use test doubles for process lifecycle in standard CI; real inference is an explicit local validation.

## Consequences

- Managed support is enabled per platform only after the pinned binary and libraries pass a native smoke test.
- Unsupported platforms keep the traditional radiator and custom-provider path with an explicit explanation.
- Model memory is released after inactivity rather than held indefinitely.
