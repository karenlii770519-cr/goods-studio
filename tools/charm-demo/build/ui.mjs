// 用法：node ui.mjs <file URL 或 http URL> <截圖路徑>
// 等場景就緒後拖一下滑鼠，確認 OrbitControls 還活著。
import { chromeArgs, chromeExecutable } from '../lib/chrome.mjs';
import { chromium } from 'playwright-core';

const [, , url, out] = process.argv;
if (!url || !out) {
  console.error('用法：node tools/charm-demo/build/ui.mjs <頁面 URL> <截圖.png>');
  process.exit(1);
}
const b = await chromium.launch({ executablePath: chromeExecutable(), args: chromeArgs });
const page = await b.newPage({ viewport: { width: 800, height: 1000 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
await page.waitForTimeout(3000);
await page.mouse.move(400, 500);
await page.mouse.down();
await page.mouse.move(250, 450, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(3000);
await page.screenshot({ path: out });
console.log(errs.join('\n') || 'no errors');
await b.close();
