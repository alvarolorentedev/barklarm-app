import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/mainview';
const MARKER = '__BARKLARM_MOCK_RUNTIME__';

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let files;
try {
  files = walk(DIST).filter((file) => file.endsWith('.js'));
} catch {
  console.error(`[mock-isolation] ${DIST} is missing. Run "bun run build:renderer" first.`);
  process.exit(1);
}

const leaked = files.filter((file) => readFileSync(file, 'utf8').includes(MARKER));

if (leaked.length > 0) {
  console.error(`[mock-isolation] mock runtime found in production bundle: ${leaked.join(', ')}`);
  process.exit(1);
}

console.log(`[mock-isolation] production renderer is clean (${files.length} JavaScript files scanned).`);
