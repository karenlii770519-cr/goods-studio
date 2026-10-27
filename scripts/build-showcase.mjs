#!/usr/bin/env node
/**
 * 產生「雷射卡即時 3D 展示」單一 HTML（three.js 與圖片全部內嵌，雙擊即可離線開啟）。
 * 圖片不會進 repo：由參數指定本機路徑。
 *
 * 用法：
 *   node scripts/build-showcase.mjs --out 展示.html [--title 標題] [--subtitle 說明] [--back back.jpg] \
 *     --card "左上・紅|art.jpg|mask.png" --card "中上・白傘|art2.jpg|mask2.png" ...
 * mask 為黑白遮罩：黑 = 白墨（不透光），其餘透出彩色雷射。可省略。
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = { cards: [], title: '雷射卡即時 3D 預覽', subtitle: '滑鼠移到卡片上（手機用手指左右拖）卡片會跟著傾斜；點卡片或按「翻面」看背面。' };
for (let i = 0; i < args.length; i++) {
  const k = args[i], v = args[++i];
  if (k === '--card') opt.cards.push(v);
  else if (k === '--out') opt.out = v;
  else if (k === '--back') opt.back = v;
  else if (k === '--title') opt.title = v;
  else if (k === '--subtitle') opt.subtitle = v;
  else if (k === '--clarity') opt.inkClarity = Number(v);
  else throw new Error('未知參數 ' + k);
}
if (!opt.out || !opt.cards.length) throw new Error('需要 --out 與至少一個 --card');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const dataUri = (p) => `data:${MIME[extname(p).toLowerCase()] ?? 'application/octet-stream'};base64,${readFileSync(p).toString('base64')}`;

const data = {
  cards: opt.cards.map((s, i) => {
    const [label, art, mask] = s.split('|');
    return { id: 'c' + i, label, art: dataUri(art), mask: mask ? dataUri(mask) : undefined };
  }),
  back: opt.back ? dataUri(opt.back) : undefined,
  film: 'holo',
  inkClarity: opt.inkClarity ?? 0.6,
};

const res = await build({
  entryPoints: [resolve(root, 'showcase/entry.ts')],
  bundle: true, minify: true, format: 'iife', target: 'es2019', write: false, legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = readFileSync(resolve(root, 'showcase/template.html'), 'utf8')
  .replaceAll('__TITLE__', esc(opt.title))
  .replace('__SUBTITLE__', () => esc(opt.subtitle))
  .replace('__DATA__', () => JSON.stringify(data).replace(/</g, '\\u003c'))
  .replace('__SCRIPT__', () => js);
writeFileSync(opt.out, html);
console.log(`${opt.out}  ${(html.length / 1024 / 1024).toFixed(2)} MB（JS ${(js.length / 1024).toFixed(0)} KB）`);
