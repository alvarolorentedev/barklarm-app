#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function target(): string {
  const explicit = process.argv.find((value) => value.startsWith('--target='))?.slice('--target='.length);
  if (explicit) return explicit;
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin';
  if (platform === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin';
  if (platform === 'win32' && arch === 'x64') return 'x86_64-pc-windows-msvc';
  if (platform === 'linux' && arch === 'x64') return 'x86_64-unknown-linux-gnu';
  if (platform === 'linux' && arch === 'arm64') return 'aarch64-unknown-linux-gnu';
  throw new Error(`Unsupported host ${platform}/${arch}`);
}

const triple = target();
const binaries = join(process.cwd(), 'src-tauri', 'binaries');
const libs = join(binaries, 'llama-libs');
const binary = join(binaries, `llama-server-${triple}${process.platform === 'win32' ? '.exe' : ''}`);
if (!existsSync(binary)) throw new Error(`Missing sidecar: ${binary}. Run bun run sidecar:fetch.`);
if (!existsSync(libs)) throw new Error(`Missing sidecar libraries: ${libs}`);

const key =
  process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : process.platform === 'win32' ? 'PATH' : 'LD_LIBRARY_PATH';
const separator = process.platform === 'win32' ? ';' : ':';
const env = { ...process.env, [key]: `${libs}${separator}${process.env[key] || ''}` };
const result = spawnSync(binary, ['--version'], { env, encoding: 'utf8' });
const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
if (result.status !== 0) {
  throw new Error(`Sidecar failed (${result.status}): ${output.slice(0, 400)}`);
}
if (!/version:/i.test(output)) throw new Error(`Unexpected sidecar output: ${output.slice(0, 400)}`);
console.log(output.split('\n').slice(0, 3).join('\n'));
