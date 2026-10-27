// 用法：node shot.mjs --html charm-3d.html [--out /tmp/charm.png] [--t 0] [--extra '&az=20']
// --t 可用逗號分隔多個時刻，例如 0,0.4,0.8；每個時刻寫成一張 PNG。
import { chromeArgs, chromeExecutable } from '../lib/chrome.mjs';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const html = opt('--html');
const out = opt('--out', '/tmp/charm-demo.png');
const t = opt('--t', '0');
const extra = opt('--extra', '');
if (!html) {
  console.error('用法：node tools/charm-demo/build/shot.mjs --html <建好的.html> [--out png] [--t 秒] [--extra &az=20]');
  process.exit(1);
}
const b = await chromium.launch({ executablePath: chromeExecutable(), args: chromeArgs });
const page = await b.newPage({ viewport: { width: 1080, height: 1350 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(pathToFileURL(resolve(html)).href + '?clean&capture' + extra);
await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await page.waitForTimeout(800);
for (const tt of t.split(',')) {
  const url = await page.evaluate((x) => {
    window.__renderAt(...x.split(':').map(Number));
    return document.querySelector('canvas').toDataURL('image/png');
  }, tt);
  const f = out.replace('.png', `-${tt}.png`);
  fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
  console.log(f);
}
console.log(errs.join('\n') || 'no errors');
await b.close();
