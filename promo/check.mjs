import { existsSync, readFileSync } from 'node:fs';

const source = readFileSync(new URL('./src/Promo.tsx', import.meta.url), 'utf8');
const assets = [
  ...[...source.matchAll(/staticFile\('([^']+)'\)/g)].map((match) => match[1]),
  ...[...source.matchAll(/icon: '([^']+\.(?:svg|png|webp))'/g)].map((match) => match[1]),
];
const missing = [...new Set(assets)].filter((asset) => !existsSync(new URL(`./public/${asset}`, import.meta.url)));

if (missing.length > 0) {
  console.error(`Missing promo assets:\n${missing.join('\n')}`);
  process.exit(1);
}

console.log(`promo assets ok (${assets.length} files)`);
