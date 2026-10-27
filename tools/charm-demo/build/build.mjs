// 用法：node build.mjs --piece <資料夾> [--top <資料夾>] [--out file] [--info 說明]
// 每個資料夾放 cut.json，以及選擇性的 art.png / white.png。
// 圖只在執行時依路徑讀入，嵌進產出的 HTML，不會寫進 repo。
import { build } from 'esbuild';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const pieceDir = opt('--piece');
const topDir = opt('--top');
const outFile = opt('--out') ?? resolve(process.cwd(), 'charm-3d.html');
const info = opt('--info') ?? '磁鐵上片＋開口圈＋吊飾（3mm 壓克力）';
if (!pieceDir) {
  console.error('用法：node tools/charm-demo/build/build.mjs --piece <資料夾> [--top <資料夾>] [--out file] [--info 說明]');
  console.error('資料夾內需要 cut.json，可再放 art.png / white.png。');
  process.exit(1);
}

const uri = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const sizeOf = (p) => {
  const b = readFileSync(p);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
function piece(dir) {
  const cut = JSON.parse(readFileSync(`${dir}/cut.json`, 'utf8'));
  const mm = 25.4 / cut.texture.dpi;
  const spec = { outer: cut.outer, hole: cut.hole, centroid: cut.centroid };
  if (existsSync(`${dir}/art.png`)) {
    const [w, h] = sizeOf(`${dir}/art.png`);
    Object.assign(spec, { art: uri(`${dir}/art.png`), tex: { originMm: cut.texture.origin_mm, sizeMm: [w * mm, h * mm] } });
    if (existsSync(`${dir}/white.png`)) spec.white = uri(`${dir}/white.png`);
  } else spec.fillInset = 1.2;
  return spec;
}
const res = await build({
  entryPoints: [resolve(here, 'entry.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2019',
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync(resolve(here, 'template.html'), 'utf8')
  .replace('__INFO__', info)
  .replace('__DATA__', () => `${JSON.stringify(piece(resolve(pieceDir)))};window.TOP=${topDir ? JSON.stringify(piece(resolve(topDir))) : 'null'}`)
  .replace('__SCRIPT__', () => js);
writeFileSync(outFile, html);
console.log('ok', outFile, (html.length / 1024 / 1024).toFixed(2), 'MB');
