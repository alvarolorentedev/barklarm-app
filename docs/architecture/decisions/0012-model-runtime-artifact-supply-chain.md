# 0012 — Model and runtime artifact supply chain

Status: accepted (Phase 2)

## Context

Model weights and native runtime binaries are large, executable-adjacent artifacts. Downloading them from mutable
locations would make builds and user installs non-reproducible and create a supply-chain path.

## Decision

- Do not commit model weights or runtime binaries to Git.
- Pin the llama.cpp build number and per-platform asset SHA-256 in a runtime manifest. Fetch per release target in CI.
- Pin the model repository commit, file name, byte size and SHA-256 in a model manifest embedded in the native layer.
- Use the application data directory for models, a `.part` temporary file, size and checksum verification, GGUF magic
  validation, fsync and atomic promotion.
- Allow only the manifest's HTTPS download URL and explicitly approved redirect hosts. Never forward unrelated
  credentials or follow arbitrary redirects.
- Do not execute downloaded content. Model files are data passed to the verified runtime.
- Include llama.cpp, library and model license notices in the release bundle.
- Standard TypeScript/browser CI needs no model or runtime download.

## Consequences

- A manifest change is a reviewable supply-chain change.
- Offline installs contain no model; the first built-in analysis requires an explicit download.
- Corrupt or partial files are rejected and cleaned up rather than activated.
