# Third-party notices

Barklarm is MIT-licensed. The managed runtime and model are separate artifacts with their own licenses.

## llama.cpp

- Project: https://github.com/ggml-org/llama.cpp
- License: MIT
- Pinned build: `b12732`
- The upstream `LICENSE` is copied next to the bundled runtime libraries by `scripts/fetch-llama.ts`.

```text
MIT License

Copyright (c) 2023-2026 The ggml authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Some upstream runtime libraries include LLVM OpenMP notices; those files are bundled with their respective libraries.

## Qwen3-1.7B-Instruct (default model)

- Model: https://huggingface.co/Qwen/Qwen3-1.7B
- GGUF distribution: https://huggingface.co/unsloth/Qwen3-1.7B-GGUF
- License: Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0
- The model is downloaded on demand, not redistributed in the Barklarm installer. The manifest records the pinned
  repository commit, file size and SHA-256.

## Other evaluated models

Qwen2.5-1.5B-Instruct (Apache-2.0) and Phi-3.5-mini-instruct (MIT) were evaluated for model selection but are not the
default. Their licenses are recorded in the evaluation report.
