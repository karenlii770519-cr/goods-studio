// 產生預覽截圖：node scripts/screenshots.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:4173/goods-studio/';
const OUT = process.argv[3] ?? '/workspace/goods-studio-preview';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup(ctxOpts) {
  const ctx = await browser.newContext({ acceptDownloads: true, ...ctxOpts });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE);
  await page.getByRole('button', { name: '加入範例作品' }).click();
  await page.waitForSelector('.work-card >> nth=3');
  await sleep(600);
  return { ctx, page };
}

async function openWork(page, name) {
  await page.goto(BASE);
  await page.getByRole('button', { name: `開啟 ${name}` }).click();
  await page.waitForSelector('.konvajs-content canvas');
  await sleep(1200);
}

async function open3D(page) {
  await page.getByRole('button', { name: '3D 預覽' }).click();
  await page.waitForSelector('.p3-stage canvas');
  await page.waitForFunction(() => !document.querySelector('.p3-loading'), null, { timeout: 30000 });
  await sleep(2500);
}

async function dragPad(page, u, v) {
  const pad = page.locator('.light-pad');
  const b = await pad.boundingBox();
  const x = b.x + b.width * (0.5 + u / 2), y = b.y + b.height * (0.5 - v / 2);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.up();
  await sleep(1500);
}

// ---------- 桌機 ----------
{
  const { ctx, page } = await setup({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.screenshot({ path: `${OUT}/01-desktop-home.png` });

  await openWork(page, '範例－晚安小糰子');
  await page.screenshot({ path: `${OUT}/02-desktop-editor-card.png` });

  await page.locator('.layer-item', { hasText: '月亮' }).click();
  await sleep(500);
  await page.screenshot({ path: `${OUT}/03-desktop-editor-card-foil-selected.png` });
  await page.locator('.side').screenshot({ path: `${OUT}/04-desktop-layers-panel.png` });

  await open3D(page);
  // 主視覺：彩虹雷射（範例預設膜材），兩個不同光源角度
  await dragPad(page, -0.45, 0.4);
  await page.screenshot({ path: `${OUT}/05-desktop-3d-holo-light-left.png` });
  await dragPad(page, 0.55, 0.3);
  await page.screenshot({ path: `${OUT}/06-desktop-3d-holo-light-right.png` });
  // 旋轉影片（彩虹雷射）
  {
    const [vd] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /旋轉影片/ }).click()]);
    const ext = vd.suggestedFilename().split('.').pop();
    await vd.saveAs(`${OUT}/goods-studio-3d-holo.${ext}`);
    await sleep(800);
  }
  // 額外：亮片雷射，看完換回彩虹雷射
  await page.locator('.p3-panel .film-btn', { hasText: '亮片雷射' }).click();
  await dragPad(page, -0.2, 0.15);
  await page.screenshot({ path: `${OUT}/07-desktop-3d-glitter-extra.png` });
  await page.locator('.p3-panel .film-btn', { hasText: '彩虹雷射' }).click();
  await sleep(300);
  await page.keyboard.press('Escape');

  await openWork(page, '範例－小糰子吊飾');
  await page.screenshot({ path: `${OUT}/08-desktop-editor-charm-outline.png` });
  await open3D(page);
  await page.screenshot({ path: `${OUT}/09-desktop-3d-charm.png` });
  await page.keyboard.press('Escape');

  await openWork(page, '範例－小糰子立牌');
  await page.screenshot({ path: `${OUT}/10-desktop-editor-stand.png` });
  await open3D(page);
  await page.screenshot({ path: `${OUT}/11-desktop-3d-stand.png` });
  await page.keyboard.press('Escape');

  await openWork(page, '範例－小糰子徽章');
  await open3D(page);
  await page.screenshot({ path: `${OUT}/12-desktop-3d-badge-holo.png` });
  await page.keyboard.press('Escape');

  await openWork(page, '範例－晚安小糰子');
  await page.getByRole('button', { name: '匯出' }).click();
  await page.waitForSelector('.export-item >> nth=4', { timeout: 30000 });
  await sleep(800);
  await page.screenshot({ path: `${OUT}/13-desktop-export.png` });
  await ctx.close();
}

// ---------- 手機 ----------
{
  const { ctx, page } = await setup({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.screenshot({ path: `${OUT}/20-mobile-home.png` });
  await openWork(page, '範例－晚安小糰子');
  await page.screenshot({ path: `${OUT}/21-mobile-editor-card.png` });
  await page.locator('.toolbar .tool', { hasText: '圖層' }).click();
  await sleep(600);
  await page.screenshot({ path: `${OUT}/22-mobile-layers-sheet.png` });
  await page.locator('.sheet .icon-btn').first().click();
  await open3D(page);
  await dragPad(page, 0.6, 0.3);
  await page.screenshot({ path: `${OUT}/23-mobile-3d-holo.png` });
  await page.keyboard.press('Escape');
  await openWork(page, '範例－小糰子吊飾');
  await page.screenshot({ path: `${OUT}/24-mobile-editor-charm.png` });
  await ctx.close();
}

await browser.close();
if (errors.length) {
  console.log('瀏覽器錯誤：');
  for (const e of errors) console.log(' -', e);
} else console.log('沒有瀏覽器錯誤');
