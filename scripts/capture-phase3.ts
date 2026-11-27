import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:1420';
const output = new URL('../docs/media/phase3/', import.meta.url);

type Shot = {
  name: string;
  path: string;
  width: number;
  height: number;
  light?: boolean;
  ready?: string;
};

const shots: Shot[] = [
  {
    name: 'radiator-dark-860',
    path: '/?scenario=radiator-mixed&reset=1#/radiator',
    width: 860,
    height: 600,
    ready: '.radiator-summary',
  },
  {
    name: 'radiator-light-860',
    path: '/?scenario=radiator-mixed&reset=1#/radiator',
    width: 860,
    height: 600,
    light: true,
    ready: '.radiator-summary',
  },
  {
    name: 'radiator-compact-720',
    path: '/?scenario=radiator-mixed&reset=1#/radiator',
    width: 720,
    height: 520,
    ready: '.radiator-summary',
  },
  {
    name: 'failure-detail-dark-860',
    path: '/?scenario=radiator-mixed&reset=1#/radiator/observer/mock-mixed-ci',
    width: 860,
    height: 900,
    ready: '.diagnostics',
  },
  {
    name: 'failure-detail-light-860',
    path: '/?scenario=radiator-mixed&reset=1#/radiator/observer/mock-mixed-ci',
    width: 860,
    height: 900,
    light: true,
    ready: '.diagnostics',
  },
  {
    name: 'tray-dark-380',
    path: '/?window=tray&scenario=radiator-mixed&reset=1#/tray',
    width: 380,
    height: 520,
    ready: '.radiator-summary',
  },
  {
    name: 'tray-light-380',
    path: '/?window=tray&scenario=radiator-mixed&reset=1#/tray',
    width: 380,
    height: 520,
    light: true,
    ready: '.radiator-summary',
  },
  {
    name: 'tray-detail-dark-380',
    path: '/?window=tray&scenario=radiator-mixed&reset=1#/tray/observer/mock-mixed-ci',
    width: 380,
    height: 440,
    ready: 'text=What happened',
  },
  {
    name: 'tray-handoff-dark-380',
    path: '/?window=tray&scenario=radiator-mixed&reset=1#/tray/handoff/mock-mixed-ci',
    width: 380,
    height: 520,
    ready: '#handoff-preview',
  },
  {
    name: 'tray-healthy-dark-380',
    path: '/?window=tray&scenario=healthy&reset=1#/tray',
    width: 380,
    height: 240,
    ready: '.radiator-summary.is-compact',
  },
  {
    name: 'tray-empty-dark-380',
    path: '/?window=tray&scenario=empty&reset=1#/tray',
    width: 380,
    height: 200,
    ready: 'text=No observers yet',
  },
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch();

for (const shot of shots) {
  const page = await browser.newPage({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 2,
    locale: 'en-US',
    colorScheme: shot.light ? 'light' : 'dark',
  });
  await page.goto(`${base}${shot.path}`, { waitUntil: 'networkidle' });
  if (shot.ready) await page.waitForSelector(shot.ready, { timeout: 15_000 });
  if (shot.path.includes('#/tray')) {
    const measured = await page.evaluate(() => {
      const content = document.querySelector<HTMLElement>('.tray-content');
      return Math.min(520, Math.max(200, 86 + (content?.scrollHeight || 0)));
    });
    await page.setViewportSize({ width: shot.width, height: measured });
  }
  await page.waitForTimeout(250);
  await page.screenshot({ path: new URL(`${shot.name}.png`, output).pathname });
  await page.close();
  console.log(`captured ${shot.name}`);
}

await browser.close();
console.log(`screenshots written to ${output.pathname}`);
