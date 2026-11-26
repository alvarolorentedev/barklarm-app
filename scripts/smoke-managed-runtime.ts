#!/usr/bin/env bun
/**
 * Opt-in real-runtime smoke test. It is deliberately separate from
 * `sidecar:smoke`, which only proves the binary exists.
 *
 * It starts the staged llama.cpp sidecar with Barklarm's loopback/auth
 * arguments, verifies the pinned model hash, rejects unauthenticated requests,
 * performs a structured inference, validates the analysis with production
 * code and checks that no owned process remains.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { assembleContext, effectiveBudget } from '../src/core/intelligence/context-assembler';
import {
  ANALYSIS_JSON_SCHEMA,
  buildAnalysisMessages,
  buildRepairMessages,
  PROMPT_VERSION,
} from '../src/core/intelligence/prompt';
import { validateAnalysis } from '../src/core/intelligence/validator';
import { DiagnosticEvidence } from '../src/types/Diagnostics';

type Target = {
  triple: string;
  binary: string;
  libs: string;
  key: string;
  separator: string;
};

const MANIFEST = JSON.parse(
  readFileSync(join(process.cwd(), 'src-tauri', 'src', 'intelligence', 'model-manifest.json'), 'utf8')
).models[0] as {
  id: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  contextLength: number;
};

function target(): Target {
  const triple =
    process.argv.find((value) => value.startsWith('--target='))?.slice('--target='.length) ||
    (process.platform === 'darwin' && process.arch === 'arm64'
      ? 'aarch64-apple-darwin'
      : process.platform === 'darwin' && process.arch === 'x64'
        ? 'x86_64-apple-darwin'
        : process.platform === 'linux' && process.arch === 'x64'
          ? 'x86_64-unknown-linux-gnu'
          : process.platform === 'linux' && process.arch === 'arm64'
            ? 'aarch64-unknown-linux-gnu'
            : process.platform === 'win32' && process.arch === 'x64'
              ? 'x86_64-pc-windows-msvc'
              : '');
  if (!triple) throw new Error(`Unsupported host ${process.platform}/${process.arch}`);
  const binaries = join(process.cwd(), 'src-tauri', 'binaries');
  const libs = join(binaries, 'llama-libs');
  const binary = join(binaries, `llama-server-${triple}${process.platform === 'win32' ? '.exe' : ''}`);
  if (!existsSync(binary)) throw new Error(`Missing sidecar: ${binary}. Run bun run sidecar:fetch.`);
  if (!existsSync(libs)) throw new Error(`Missing sidecar libraries: ${libs}. Run bun run sidecar:fetch.`);
  return {
    triple,
    binary,
    libs,
    key:
      process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : process.platform === 'win32' ? 'PATH' : 'LD_LIBRARY_PATH',
    separator: process.platform === 'win32' ? ';' : ':',
  };
}

function modelCandidates(): string[] {
  const explicit = process.env.BARKLARM_MODEL_PATH;
  const base =
    process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support', 'dev.barklarm.app')
      : process.platform === 'win32'
        ? join(process.env.APPDATA || homedir(), 'dev.barklarm.app')
        : join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'dev.barklarm.app');
  return [
    ...(explicit ? [explicit] : []),
    join(base, 'models', MANIFEST.fileName),
    join(process.cwd(), 'models', MANIFEST.fileName),
  ];
}

async function hashFile(path: string): Promise<string> {
  const reader = Bun.file(path).stream().getReader();
  const hasher = createHash('sha256');
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    hasher.update(chunk.value);
  }
  return hasher.digest('hex');
}

async function tokenFile(token: string): Promise<string> {
  const dir = join(tmpdir(), `barklarm-smoke-${process.pid}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'token');
  const file = await open(path, 'wx', 0o600);
  await file.writeFile(token);
  await file.sync();
  await file.close();
  return path;
}

function freePort(): number {
  const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('') });
  const port = probe.port;
  probe.stop(true);
  return port;
}

function verifyLoopback(port: number): void {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (result.error) {
    console.warn(`loopback verification skipped: lsof unavailable (${result.error.message})`);
    return;
  }
  const lines = (result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes(`:${port}`));
  if (lines.length === 0) throw new Error(`No listener found on port ${port}`);
  for (const line of lines) {
    if (!line.includes(`127.0.0.1:${port}`) && !line.includes(`[::1]:${port}`)) {
      throw new Error(`Runtime is not loopback-only: ${line}`);
    }
  }
}

const evidence: DiagnosticEvidence = {
  schemaVersion: 1,
  observerId: 'smoke-observer',
  failureId: 'smoke-run:1',
  sourceType: 'githubAction',
  collectedAt: new Date().toISOString(),
  completeness: 'complete',
  summary: 'TypeScript build failed.',
  items: [
    {
      id: 'error:1',
      category: 'error',
      title: 'Compiler error',
      content: 'src/math.ts(12,3): error TS2322: Type string is not assignable to type number.',
    },
    {
      id: 'job:1',
      category: 'job',
      title: 'build',
      content: 'Job build concluded failure after the TypeScript step.',
    },
  ],
  limitations: [],
};

async function waitForReady(port: number, token: string, modelId: string, child: ReturnType<typeof spawn>) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Runtime exited during startup (${child.exitCode})`);
    try {
      const unauthorized = await fetch(`http://127.0.0.1:${port}/v1/models`, {
        signal: AbortSignal.timeout(2000),
      });
      if (unauthorized.ok) {
        throw new Error('Runtime accepted an unauthenticated model-list request');
      }
      const authorized = await fetch(`http://127.0.0.1:${port}/v1/models`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(2000),
      });
      if (authorized.ok) {
        const payload: any = await authorized.json();
        if (Array.isArray(payload?.data) && payload.data.some((item: any) => item?.id === modelId)) {
          return;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('did not reject')) throw error;
    }
    await Bun.sleep(500);
  }
  throw new Error('Runtime did not become ready within 90 seconds');
}

async function main() {
  const sidecar = target();
  const modelPath = modelCandidates().find((path) => existsSync(path));
  if (!modelPath) {
    throw new Error(
      `Pinned model is not installed. Download it from Intelligence settings or set BARKLARM_MODEL_PATH. Tried: ${modelCandidates().join(', ')}`
    );
  }
  const metadata = await stat(modelPath);
  if (metadata.size !== MANIFEST.sizeBytes) throw new Error(`Model size mismatch: ${metadata.size}`);
  console.log(`Model: ${MANIFEST.fileName} (${(metadata.size / 1024 ** 3).toFixed(2)} GB)`);
  const digest = await hashFile(modelPath);
  if (digest !== MANIFEST.sha256) throw new Error(`Model SHA-256 mismatch: ${digest}`);
  console.log(`Model SHA-256: verified`);

  const port = freePort();
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const tokenPath = await tokenFile(token);
  const alias = 'barklarm-smoke';
  const context = 4096;
  const env = {
    ...process.env,
    [sidecar.key]: `${sidecar.libs}${sidecar.separator}${process.env[sidecar.key] || ''}`,
    NO_PROXY: '127.0.0.1,localhost,::1',
    no_proxy: '127.0.0.1,localhost,::1',
  };
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
    delete (env as any)[key];
  }
  const args = [
    '--model',
    modelPath,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--api-key-file',
    tokenPath,
    '--ctx-size',
    String(context),
    '--threads',
    '4',
    '--parallel',
    '1',
    '--no-webui',
    '--no-slots',
    '--jinja',
    '--alias',
    alias,
    '--log-disable',
  ];
  const child = spawn(sidecar.binary, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr = (stderr + String(chunk)).slice(-4000);
  });
  const started = performance.now();
  let failure: unknown = null;
  let cleanupFailure = '';
  let validated = false;
  try {
    await waitForReady(port, token, alias, child);
    console.log(`Runtime ready in ${((performance.now() - started) / 1000).toFixed(1)}s on 127.0.0.1:${port}`);
    verifyLoopback(port);
    console.log('Loopback binding: verified');

    const unauthorized = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: alias,
        messages: [{ role: 'user', content: 'Reply OK' }],
        max_tokens: 2,
      }),
    });
    if (unauthorized.status !== 401 && unauthorized.status !== 403) {
      throw new Error(`Unauthenticated inference was not rejected (${unauthorized.status})`);
    }
    console.log('Authentication rejection: verified');

    const budget = effectiveBudget(context, 768);
    const assembled = assembleContext(evidence, {
      promptVersion: PROMPT_VERSION,
      contextWindow: budget.contextWindow,
      maxOutputTokens: budget.maxOutputTokens,
    });
    let messages = buildAnalysisMessages(assembled);
    let content = '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          model: alias,
          messages,
          max_tokens: budget.maxOutputTokens,
          temperature: attempt === 0 ? 0 : 0.1,
          top_p: 0.9,
          stream: false,
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'diagnostic_analysis', strict: true, schema: ANALYSIS_JSON_SCHEMA },
          },
          chat_template_kwargs: { enable_thinking: false },
        }),
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) throw new Error(`Inference failed with HTTP ${response.status}`);
      const payload: any = await response.json();
      content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('Inference returned no text content');
      const validation = validateAnalysis(content, {
        observerId: evidence.observerId,
        failureId: evidence.failureId,
        evidenceFingerprint: 'smoke-fingerprint',
        promptVersion: PROMPT_VERSION,
        model: { provider: 'managed', name: alias },
        includedEvidenceIds: assembled.assembly.includedEvidenceIds,
        now: () => new Date(),
      });
      if (validation.ok) {
        console.log(
          `Structured inference: verified (${validation.analysis.findings.length} findings, ${validation.analysis.evidenceSufficiency})`
        );
        console.log(`Summary: ${validation.analysis.summary.slice(0, 200)}`);
        validated = true;
        break;
      }
      if (attempt === 0) {
        if (process.env.BARKLARM_SMOKE_DEBUG) console.error(`Invalid output excerpt: ${content.slice(0, 1200)}`);
        messages = buildRepairMessages(messages, validation.errors);
        continue;
      }
      throw new Error(`Analysis failed production validation: ${validation.errors.join(', ')}`);
    }
    if (!validated) throw new Error('Structured inference did not pass production validation');
  } catch (error) {
    failure = error;
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        Bun.sleep(10_000).then(() => child.kill('SIGKILL')),
      ]);
    }
    await rm(join(tmpdir(), `barklarm-smoke-${process.pid}`), { recursive: true, force: true });
    if (existsSync(tokenPath)) cleanupFailure = 'Token file was not cleaned up';
    try {
      if (child.pid) process.kill(child.pid, 0);
      cleanupFailure ||= 'Owned runtime process is still running after shutdown';
    } catch {
      // ESRCH: the owned process is gone as expected.
    }
    if (!cleanupFailure) console.log('Shutdown and token cleanup: verified');
    if (stderr) console.log(`Runtime stderr tail: ${stderr.slice(-300)}`);
  }
  if (failure) throw failure;
  if (cleanupFailure) throw new Error(cleanupFailure);
}

main().catch((error) => {
  console.error(`Managed runtime smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
