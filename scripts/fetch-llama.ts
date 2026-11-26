#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Downloads the pinned llama.cpp runtime for the current target, verifies the
 * published SHA-256 and stages only the server binary and its libraries.
 * Binaries never enter Git history.
 */
const BUILD = 'b12732';
const ASSETS = {
  'aarch64-apple-darwin': {
    archive: `llama-${BUILD}-bin-macos-arm64.tar.gz`,
    sha: 'cd9a5295884a58dc818f97a4fb91941839b91fafe44a8bc21f02aea2a1a378e1',
    binary: 'llama-server',
  },
  'x86_64-apple-darwin': {
    archive: `llama-${BUILD}-bin-macos-x64.tar.gz`,
    sha: 'bd0fe9995ee9ae1e105e2249a3a48dd7daf668e07f6521567e267dbb90e33138',
    binary: 'llama-server',
  },
  'x86_64-pc-windows-msvc': {
    archive: `llama-${BUILD}-bin-win-cpu-x64.zip`,
    sha: '59e88429b4de347c8f05b05ca8580354b749053846186d2465c2ae8deada9943',
    binary: 'llama-server.exe',
  },
  'x86_64-unknown-linux-gnu': {
    archive: `llama-${BUILD}-bin-ubuntu-x64.tar.gz`,
    sha: 'bf402879b3c22200f758adc64de3a457c2cb57d179ba1bfe2d66143fb23cb897',
    binary: 'llama-server',
  },
  'aarch64-unknown-linux-gnu': {
    archive: `llama-${BUILD}-bin-ubuntu-arm64.tar.gz`,
    sha: 'f65bcfebff4b3157513cac0ff29e0ddc9cafaf467e07336d94f7d7714d1895ba',
    binary: 'llama-server',
  },
} as const;

type Target = keyof typeof ASSETS;

function target(): Target {
  const explicit = process.argv.find((value) => value.startsWith('--target='))?.slice('--target='.length);
  if (explicit) {
    if (!(explicit in ASSETS)) throw new Error(`Unsupported target ${explicit}`);
    return explicit as Target;
  }
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin';
  if (platform === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin';
  if (platform === 'win32' && arch === 'x64') return 'x86_64-pc-windows-msvc';
  if (platform === 'linux' && arch === 'x64') return 'x86_64-unknown-linux-gnu';
  if (platform === 'linux' && arch === 'arm64') return 'aarch64-unknown-linux-gnu';
  throw new Error(`Unsupported host ${platform}/${arch}; pass --target=<triple>`);
}

async function digest(path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const data = await readFile(path);
  return createHash('sha256').update(data).digest('hex');
}

async function main() {
  const triple = target();
  const asset = ASSETS[triple];
  const work = join(tmpdir(), `barklarm-llama-${BUILD}-${process.pid}`);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const url = `https://github.com/ggml-org/llama.cpp/releases/download/${BUILD}/${asset.archive}`;
  const archive = join(work, asset.archive);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  await Bun.write(archive, response);
  const actual = await digest(archive);
  if (actual !== asset.sha) throw new Error(`SHA-256 mismatch for ${asset.archive}`);

  const staging = join(work, 'staging');
  await mkdir(staging, { recursive: true });
  const result =
    process.platform === 'win32'
      ? spawnSync('tar', ['-xf', archive, '-C', staging], { stdio: 'inherit' })
      : spawnSync('tar', ['-xzf', archive, '-C', staging], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Archive extraction failed');

  const rootEntry = (await readdir(staging)).find((entry) => entry.startsWith(`llama-${BUILD}`));
  const root = rootEntry ? join(staging, rootEntry) : staging;
  const binarySource = join(root, asset.binary);
  await stat(binarySource);

  const binaries = join(process.cwd(), 'src-tauri', 'binaries');
  const libs = join(binaries, 'llama-libs');
  // Replace the library directory so old archive tools do not accumulate in
  // the shipped bundle. Only shared libraries, Metal shaders and licenses ship.
  await rm(libs, { recursive: true, force: true });
  await mkdir(libs, { recursive: true });
  // Tauri resolves external binaries by target triple and keeps the platform
  // executable suffix, which Windows requires for the sidecar to launch.
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const binaryDestination = join(binaries, `llama-server-${triple}${suffix}`);
  // Overwriting an ad-hoc-signed Mach-O in place can leave macOS executing a
  // stale signature cache (SIGKILL). Replace the inode instead.
  await rm(binaryDestination, { force: true });
  await copyFile(binarySource, binaryDestination);
  if (process.platform !== 'win32') await chmod(binaryDestination, 0o755);

  const isLibrary = (entry: string): boolean => /\.(dylib|so(\.\d+)*|dll|metal)$/.test(entry);
  for (const entry of await readdir(root)) {
    if (entry === asset.binary) continue;
    const ship = isLibrary(entry) || entry === 'LICENSE' || entry.startsWith('LICENSE-');
    if (ship) await copyFile(join(root, entry), join(libs, entry));
  }

  await rm(work, { recursive: true, force: true });
  console.log(`Staged llama.cpp ${BUILD} for ${triple} in src-tauri/binaries (${basename(archive)}).`);
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
