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

- requires explicit user action;
- shows size and license before download;
- writes a `.part` file;
- verifies byte size and SHA-256;
- validates the GGUF magic header;
- atomically promotes the file and writes a verification marker;
- supports cancellation and retry;
- refuses unsafe file names and never executes model data.

Models live under the application data directory, never in the repository. Removing a model stops the runtime first.

## Runtime

`src-tauri/src/intelligence/` owns the process. The renderer receives only a short-lived loopback endpoint and token.
The supervisor uses an explicit argument allowlist, discards output, binds to loopback, selects a free port and stops
after inactivity. A stale PID marker is cleaned on the next start.

## Testing

```sh
bun run test:evals:mock        # deterministic, runs in check
bun run test:evals:local       # explicit local model
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
| Custom provider rejects the key | Re-save the key; verify the provider accepts Bearer authentication |
| Remote analysis says consent required | Approve the displayed destination; changing it invalidates consent |
| Analysis rejected as invalid | The model did not satisfy the schema or citations; try another model or reanalyze |
| Analysis rejected as unsafe | The output contained a destructive command; it was not displayed |
| No analysis for a failed build | Enable diagnostic evidence and confirm the source returned a log or error excerpt |
