// 功能冒煙測試：node scripts/smoke.mjs [baseUrl]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4173/goods-studio/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cond, msg) => console.log(`${cond ? '✓' : '✗'} ${msg}`) || (cond ? 0 : (process.exitCode = 1));
const count = () => page.locator('.layer-item').count();

await page.goto(BASE);
await page.locator('.product-card', { hasText: '卡片' }).first().click();
await page.waitForSelector('.konvajs-content canvas');
await sleep(500);
ok((await count()) === 0, '新卡片沒有圖層');

await page.locator('.tool', { hasText: '文字' }).click();
await sleep(200);
ok((await count()) === 1, '加入文字');
await page.locator('.props textarea').fill('測試文字');
await sleep(200);
await page.locator('.tool', { hasText: '圖形' }).click();
await page.locator('.shape-menu .icon-btn').nth(2).click();
ok((await count()) === 2, '加入星形');

// 上傳圖片（程式產生的 PNG）
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVQIW2P8z8DwnwEJMDKgCwAAa0YDAQ7s1u8AAAAASUVORK5CYII=', 'base64');
fs.writeFileSync('/tmp/gs-test.png', png);
await page.locator('input[type=file]').setInputFiles('/tmp/gs-test.png');
await sleep(500);
ok((await count()) === 3, '上傳圖片');

await page.locator('.canvas-wrap').click({ position: { x: 150, y: 600 } });
await page.keyboard.press('Control+z');
await sleep(150);
ok((await count()) === 2, 'Ctrl+Z 復原');
await page.keyboard.press('Control+Shift+z');
await sleep(150);
ok((await count()) === 3, 'Ctrl+Shift+Z 重做');

// 換工藝：選星形改成燙金
await page.locator('.layer-item', { hasText: '星形' }).click();
await page.locator('.props select').first().selectOption('foil');
await sleep(200);
ok((await page.locator('.g-foil .layer-item').count()) === 1, '星形移到燙金群組');
// 鎖定、隱藏
await page.locator('.g-foil .layer-item button[title="鎖定"]').click();
ok((await page.locator('.g-foil .layer-item button[title="解鎖"]').count()) === 1, '鎖定圖層');
await page.locator('.g-foil .layer-item button[title="隱藏"]').click();
ok((await page.locator('.g-foil .layer-item.is-hidden').count()) === 1, '隱藏圖層');
// 刪除
await page.locator('.layer-item', { hasText: '測試文字' }).click();
await page.locator('.canvas-wrap').hover();
await page.keyboard.press('Delete');
await sleep(150);
ok((await count()) === 2, 'Delete 刪除圖層');

// 自動儲存 → 重新整理後還在
await sleep(1200);
await page.reload();
await page.waitForSelector('.layer-item');
ok((await count()) === 2, '重新整理後內容還在（IndexedDB）');

// 匯出 ZIP
await page.getByRole('button', { name: '匯出' }).click();
await page.waitForSelector('.export-item >> nth=3');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /全部下載/ }).click()]);
const zipPath = '/tmp/gs-export.zip';
await dl.saveAs(zipPath);
ok(fs.statSync(zipPath).size > 1000, `匯出 ZIP（${dl.suggestedFilename()}，${fs.statSync(zipPath).size} bytes）`);
await page.locator('.modal .icon-btn').first().click();

// 3D 錄影
await page.getByRole('button', { name: '3D 預覽' }).click();
await page.waitForFunction(() => !document.querySelector('.p3-loading'), null, { timeout: 30000 });
await sleep(800);
const [vd] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('button', { name: /旋轉影片/ }).click()]);
const vPath = `/tmp/${vd.suggestedFilename()}`;
await vd.saveAs(vPath);
ok(fs.statSync(vPath).size > 10000, `錄製影片（${vd.suggestedFilename()}，${fs.statSync(vPath).size} bytes）`);

await browser.close();
ok(errors.length === 0, `瀏覽器沒有錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
