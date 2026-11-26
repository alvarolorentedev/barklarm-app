# Intelligence engineering

## Pipeline

```text
EvidenceManager -> available/cleared event -> AnalysisManager
  -> context assembler -> prompt v1 -> provider -> validator
  -> AnalysisSnapshot (memory only)
```

Analysis is separate from `State` and `DiagnosticEvidence`. It never changes operational status, notifications or the
issue webhook.

## Modes

| Mode | Runtime | Credentials | Consent |
| --- | --- | --- | --- |
| Disabled | None | None | None |
| Built-in local AI | Barklarm-managed llama.cpp sidecar | Ephemeral loopback token | Model download |
| Custom provider | User endpoint | Optional OS-keychain API key | Explicit for non-loopback destinations |

Diagnostics remain a separate opt-in setting. Enabling intelligence does not silently enable evidence collection.

## Endpoint policy

- Loopback endpoints may use HTTP. Non-loopback endpoints require HTTPS.
- URLs with embedded credentials, query strings or fragments are rejected.
- Redirects are rejected; Authorization headers are not forwarded.
- Private and remote destinations require consent stored outside the config file. Importing a configuration resets
  intelligence to disabled.
- Connectivity tests never include diagnostic evidence.
- Localhost is not described as guaranteed local: an external runtime may forward requests.

## Transport and TLS

Desktop inference uses the Tauri HTTP transport. The production CSP allows only IPC, so the managed runtime's dynamic
loopback port is reached through the same native client as custom providers. Inference never falls back to browser
`fetch` and never inherits the observer `sslDisabled` switch; custom HTTPS destinations always validate certificates and
hostnames. Redirects are rejected and managed tokens are only sent to the native loopback endpoint.

## Provider compatibility

The adapter implements the OpenAI chat-completions contract with `messages`, `max_tokens`, `temperature`, `top_p`,
`stream: false` and optional `response_format`. It falls back from `json_schema` to `json_object` to prompt-only JSON when
a provider rejects structured output.

Tested with llama.cpp `b12732`. Expected to work with OpenAI-compatible llama.cpp server, LM Studio and similar
servers. Not claimed as universally compatible. Known limitations:

- No streaming.
- No tool calling or function calling.
- No universal tokenizer endpoint; llama.cpp `/tokenize` is used when available, otherwise a conservative character
  estimate is used.
- Some providers ignore `response_format`; validation still rejects malformed output.
- Qwen3 thinking mode must be disabled; the managed provider sends `chat_template_kwargs.enable_thinking=false`.

## Model management

The native manifest pins one model: Qwen3-1.7B-Instruct Q4_K_M. The downloader:

- requires explicit user action and permits one owner per destination;
- shows size and license before download;
- writes a `.part` file, bounded by the manifest size, with approved HTTPS redirects only;
- verifies byte size and SHA-256 and validates the GGUF magic header;
- atomically promotes only if cancellation/removal has not superseded the operation;
- writes a JSON verification record bound to model id, version, file name, size and SHA-256;
- preserves an existing valid model until a verified replacement is ready;
- supports cancellation, retry and removal without promoting a cancelled file;
- refuses unsafe file names and never executes model data.

Status checks use the lightweight record/size/header path. Activation performs a full asynchronous SHA-256; a same-size
replacement is therefore rejected. Legacy plain-hash markers are accepted for status but upgraded only after a full
hash. Models live under the application data directory, never in the repository. Removing a model stops the runtime
first.

## Runtime lifecycle

The native layer owns explicit `stopped`, `starting`, `ready`, `stopping` and `failed` states. Start/stop is serialized;
concurrent ensures coalesce; stop cancels a pending start; an exited child invalidates the endpoint; startup is bounded
and failure-restart is rate-limited. Active inference is tracked separately from idle time and is never reaped as idle.
Ownership markers record PID, process start identity, executable path and owner identity; cleanup never signals a
process that does not match. Tokens are created exclusively with mode 0600, never appear in arguments, and are removed
on success, cancel and failure. Health verification requires both authentication rejection and the expected model
alias, so an unrelated service on the selected port is rejected.

## Runtime

`src-tauri/src/intelligence/` owns the process. The renderer receives only a short-lived loopback endpoint and token.
The supervisor uses an explicit argument allowlist, discards output, binds to loopback, selects a free port and stops
after inactivity. A stale PID marker is cleaned on the next start.

## Retention and context budgets

Evidence expiry, eviction, observer removal and recollection clear associated analysis; a new failure invalidates the
old one immediately. TTL pruning runs independently of UI snapshot reads. The context assembler clamps to the managed
runtime's effective 2,048–16,384 token window, normalizes impossible output budgets, includes system/prompt overhead,
and verifies the actual prompt with the provider tokenizer when available. Truncated and omitted evidence remains
visible in the assembly.

## Testing

```sh
bun run test:evals:mock           # deterministic AnalysisManager pipeline, runs in check
bun run test:evals:local          # explicit local model through the same pipeline
bun run sidecar:smoke             # binary availability only
bun run sidecar:smoke:runtime     # opt-in real runtime, model hash, loopback, auth, inference, validation, cleanup
```

The local evaluator expects an OpenAI-compatible endpoint unless configured otherwise:

```sh
BARKLARM_EVAL_ENDPOINT=http://127.0.0.1:8080/v1 \
BARKLARM_EVAL_MODEL=barklarm-eval \
bun run test:evals:local
```

Raw outputs go to `evals/results/` and remain uncommitted review artifacts.

## Troubleshooting

| Symptom | Cause / action |
| --- | --- |
| Built-in mode says model missing | Download the model from General → Intelligence |
| Model download fails checksum | Retry; if it persists, treat the distribution endpoint as suspect |
| Runtime fails to start | Run `bun run sidecar:fetch`, confirm the binary and libraries are present, inspect the native log |
| Remote provider certificate rejected | Correct the certificate or endpoint. `sslDisabled` is observer-only and cannot bypass inference TLS. |
| Model reports corrupted | Re-download; activation hashing detected a missing/mismatched record or modified file. |
| Destination approval missing after upgrade | Re-approve. Consent is now bound to a SHA-256 destination identity. |
| Custom provider rejects the key | Re-save the key; verify the provider accepts Bearer authentication |
| Remote analysis says consent required | Approve the displayed destination; changing it invalidates consent |
| Analysis rejected as invalid | The model did not satisfy the schema or citations; try another model or reanalyze |
| Analysis rejected as unsafe | The output contained a destructive command; it was not displayed |
| No analysis for a failed build | Enable diagnostic evidence and confirm the source returned a log or error excerpt |
