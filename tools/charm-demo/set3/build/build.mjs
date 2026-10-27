// 用法：node build.mjs --card <資料夾> --mid <資料夾> --bottom <資料夾> [--out file] [--info 說明] [--title 標題]
// 每個資料夾放 cut.json，以及選擇性的 art.png / white.png。
// 卡片的 cut.json 要有 mount.slot；中片要有 mount.tab 與掛孔。
import { build } from 'esbuild';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const a = process.argv.slice(2);
const opt = (k) => {
  const i = a.indexOf(k);
  return i >= 0 ? a[i + 1] : null;
};
const dirs = { card: opt('--card'), mid: opt('--mid'), bottom: opt('--bottom') };
const out = opt('--out') ?? resolve(process.cwd(), 'set3-3d.html');
const info = opt('--info') ?? '卡片＋中片（插片）＋開口圈＋下片吊飾・3mm 壓克力';
const title = opt('--title') ?? '壓克力磁鐵吊飾組 3D 預覽';
if (!dirs.card || !dirs.mid || !dirs.bottom) {
  console.error('用法：node tools/charm-demo/set3/build/build.mjs --card <資料夾> --mid <資料夾> --bottom <資料夾> [--out file] [--info 說明] [--title 標題]');
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
  const circles = cut.circles ?? (cut.hole ? [cut.hole] : []);
  const spec = { outer: cut.outer, circles, polyHoles: cut.polyHoles ?? [], hole: cut.hole ?? circles[0], centroid: cut.centroid, mount: cut.mount };
  if (existsSync(`${dir}/art.png`)) {
    const [w, h] = sizeOf(`${dir}/art.png`);
    Object.assign(spec, { art: uri(`${dir}/art.png`), tex: { originMm: cut.texture.origin_mm, sizeMm: [w * mm, h * mm] } });
    if (existsSync(`${dir}/white.png`)) spec.white = uri(`${dir}/white.png`);
  }
  return spec;
}
const data = { card: piece(resolve(dirs.card)), mid: piece(resolve(dirs.mid)), bottom: piece(resolve(dirs.bottom)) };
if (!data.card.mount?.slot) throw new Error('卡片 cut.json 需要 mount.slot');
if (!data.mid.mount?.tab || !data.mid.hole) throw new Error('中片 cut.json 需要 mount.tab 與掛孔');
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
  .replaceAll('壓克力磁鐵吊飾 3D 預覽', title)
  .replace('__INFO__', info)
  .replace('window.CHARM=__DATA__;', () => `window.SET=${JSON.stringify(data)};`)
  .replace('__SCRIPT__', () => js);
writeFileSync(out, html);
console.log('ok', out, (html.length / 1024 / 1024).toFixed(2), 'MB');
