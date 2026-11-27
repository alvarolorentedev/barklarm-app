# Runtime and platform matrix

Status: macOS arm64 is locally validated. Other targets are packaged in CI but were not executed on this machine.

## Managed runtime

The managed runtime is a pinned llama.cpp `llama-server` build (`b12732`) fetched by `bun run sidecar:fetch` at build
time, verified by SHA-256 and bundled as a Tauri sidecar with its dynamic libraries. It is not committed to Git and not
downloaded at runtime.

| Target | Runtime asset | Managed AI | Validation performed |
| --- | --- | --- | --- |
| macOS arm64 | `llama-b12732-bin-macos-arm64` | Enabled after smoke test | Full local packaging, serialized app-owned runtime start, loopback/auth checks, real structured inference, production validation, evaluations, graceful quit cleanup |
| macOS x64 | `llama-b12732-bin-macos-x64` | Enabled only if CI smoke passes | Compilation/packaging workflow prepared; not executed here |
| Linux x64 | `llama-b12732-bin-ubuntu-x64` | Enabled only if CI smoke passes | Compilation/packaging workflow prepared; not executed here |
| Linux arm64 | `llama-b12732-bin-ubuntu-arm64` | Enabled only if CI smoke passes | Compilation/packaging workflow prepared; not executed here |
| Windows x64 | `llama-b12732-bin-win-cpu-x64` | Enabled only if CI smoke passes | Compilation/packaging workflow prepared; not executed here |

The application remains a traditional radiator on any target where the managed runtime is unavailable. Users can select a
custom OpenAI-compatible provider or keep intelligence disabled.

## Runtime lifecycle

- Serialized `stopped`/`starting`/`ready`/`stopping`/`failed` lifecycle; concurrent ensures coalesce.
- Lazy start on the first analysis; reuse across analyses; restart on context change.
- Bind only to `127.0.0.1` on an available port; auth + model-alias probe rejects an unrelated service.
- Ephemeral bearer token created exclusively with mode 0600 via a file, deleted after startup.
- Explicit argument allowlist; no web UI, slots, props, metrics, tools, model retrieval or filesystem features.
- One parallel slot, bounded context/thread count, 45 s per startup attempt with at most three attempts.
- Active inference is protected from idle shutdown; inactivity stop after five minutes.
- Identity-verified stale cleanup and bounded failure backoff.
- Process output is discarded; no prompts or completions are logged.
- Abrupt termination can leave a child until the next launch verifies and cleans it; unverifiable markers are discarded
  without signalling.

## Measured resources (macOS arm64, 16 GB)

| Measurement | Value |
| --- | --- |
| Model file | 1.1 GB (Q4_K_M) |
| Runtime RSS after real generation (mmap included) | ~2.1 GB virtual/RSS sample |
| Cold runtime start (real model smoke) | 13.1 s |
| Cold inference (first real eval case) | 11.9 s |
| Warm inference (later real eval cases) | ~9.3 s mean |
| Context | 8192 tokens |
| Output budget | 1536 tokens |

These are measurements, not guarantees. The model is memory-mapped; operating-system accounting can differ. Lower-memory
machines should use a smaller context and are warned before enabling managed inference.

## Binary provenance

- Build: `b12732` from `ggml-org/llama.cpp`.
- Asset SHA-256 values are in `scripts/fetch-llama.ts`.
- Runtime license: MIT. Dynamic libraries include LLVM OpenMP notices on some targets.
- Model: Qwen3-1.7B-Instruct Q4_K_M, Apache-2.0, pinned by repository commit, byte size and SHA-256 in
  `src-tauri/src/intelligence/model-manifest.json`.
- Model weights are downloaded only after explicit user consent; no upgrade is automatic.

## Known limitations

- Windows and Linux runtime execution has not been validated in this environment.
- Windows builds remain unsigned/not notarized.
- macOS CI signs the sidecar and every bundled llama library before Tauri signs and notarizes the app bundle.
- GPU acceleration is limited to the upstream CPU/Metal build selected for each target. No CUDA/Vulkan matrix is shipped.
- The model download depends on Hugging Face availability; the app verifies the pinned size and checksum and does not
  execute model content.
