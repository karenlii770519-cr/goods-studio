// 用法：node video.mjs --html charm-3d.html [--frames /tmp/charm-demo-frames]
// 逐格呼叫 __renderAt，寫出 6 秒、30fps 的 PNG。編碼交給外部的 ffmpeg。
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
const dir = opt('--frames', '/tmp/charm-demo-frames');
if (!html) {
  console.error('用法：node tools/charm-demo/build/video.mjs --html <建好的.html> [--frames 目錄]');
  process.exit(1);
}
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const b = await chromium.launch({ executablePath: chromeExecutable(), args: chromeArgs });
const page = await b.newPage({ viewport: { width: 1080, height: 1350 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(pathToFileURL(resolve(html)).href + '?clean&capture');
await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const FPS = 30, N = 6 * FPS;
for (let i = 0; i < N; i++) {
  const t = i / FPS;
  const url = await page.evaluate((time) => {
    window.__renderAt(time, 9 * Math.sin((Math.PI * 2 * time) / 6));
    return document.querySelector('canvas').toDataURL('image/png');
  }, t);
  fs.writeFileSync(`${dir}/f${String(i).padStart(4, '0')}.png`, Buffer.from(url.split(',')[1], 'base64'));
  if (i % 30 === 0) console.log('frame', i);
}
console.log(errs.join('\n') || 'no errors');
await b.close();
