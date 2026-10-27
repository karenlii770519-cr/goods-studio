import { zipSync } from 'fflate';
import { canvasToBlob, pngWithDpi, safeFileName } from './download';
import { FILMS } from './films';
import { pxPerMm, type Rect } from './geometry';
import { polygonToSvgPath, type AcrylicOutline } from './outline';
import { getProduct } from './products';
import { createCanvas, designRegion, renderLayers, shapePath, toBlackWhiteMask } from './render';
import type { Project } from './types';
import { swapSides } from './project';

export interface ExportFile {
  name: string;
  label: string;
  blob: Blob;
  width?: number;
  height?: number;
}

export interface ExportOptions {
  dpi: number;
  includeBleed: boolean;
}

function regionFor(project: Project, outline: AcrylicOutline | null, includeBleed: boolean): Rect {
  const p = getProduct(project.productId);
  if (p.family === 'acrylic') {
    // 取畫布與外框的聯集，外加 1mm
    let x0 = 0, y0 = 0, x1 = project.width, y1 = project.height;
    for (const q of outline?.polygon ?? []) {
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
    }
    return { x: Math.floor(x0 - 1), y: Math.floor(y0 - 1), width: Math.ceil(x1 - x0 + 2), height: Math.ceil(y1 - y0 + 2) };
  }
  return includeBleed ? designRegion(project) : { x: 0, y: 0, width: project.width, height: project.height };
}

async function png(c: HTMLCanvasElement, dpi: number) {
  return pngWithDpi(await canvasToBlob(c), dpi);
}

/** 刀模線：白底黑線 */
function cutLineCanvas(project: Project, outline: AcrylicOutline | null, region: Rect, k: number): HTMLCanvasElement {
  const p = getProduct(project.productId);
  const c = createCanvas(region.width * k, region.height * k);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.setTransform(k, 0, 0, k, -region.x * k, -region.y * k);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  if (p.family === 'acrylic') {
    outline?.polygon.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    if (outline?.hole) {
      ctx.moveTo(outline.hole.x + outline.hole.r, outline.hole.y);
      ctx.arc(outline.hole.x, outline.hole.y, outline.hole.r, 0, Math.PI * 2);
    }
  } else if (p.shape === 'circle') {
    ctx.ellipse(project.width / 2, project.height / 2, project.width / 2, project.height / 2, 0, 0, Math.PI * 2);
  } else {
    shapePath(ctx, 'rect', project.width, project.height, p.cornerRadius);
  }
  ctx.stroke();
  // 使用者自己畫的刀模圖層
  for (const l of project.layers) {
    if (!l.visible || l.process !== 'cut') continue;
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate((l.rotation * Math.PI) / 180);
    ctx.beginPath();
    if (l.type === 'shape') shapePath(ctx, l.shape, l.width, l.height, l.cornerRadius);
    else ctx.rect(0, 0, l.width, l.height);
    ctx.stroke();
    ctx.restore();
  }
  return c;
}

function cutSvg(project: Project, outline: AcrylicOutline | null, region: Rect): string {
  const p = getProduct(project.productId);
  const paths: string[] = [];
  if (p.family === 'acrylic') {
    if (outline?.polygon.length) paths.push(`<path d="${polygonToSvgPath(outline.polygon)}"/>`);
    if (outline?.hole) paths.push(`<circle cx="${outline.hole.x.toFixed(3)}" cy="${outline.hole.y.toFixed(3)}" r="${outline.hole.r.toFixed(3)}"/>`);
  } else if (p.shape === 'circle') {
    paths.push(`<circle cx="${project.width / 2}" cy="${project.height / 2}" r="${project.width / 2}"/>`);
  } else {
    paths.push(`<rect x="0" y="0" width="${project.width}" height="${project.height}" rx="${p.cornerRadius}"/>`);
  }
  for (const l of project.layers) {
    if (!l.visible || l.process !== 'cut' || l.type !== 'shape') continue;
    const tr = `translate(${l.x.toFixed(3)} ${l.y.toFixed(3)}) rotate(${l.rotation})`;
    if (l.shape === 'rect') paths.push(`<rect transform="${tr}" width="${l.width.toFixed(3)}" height="${l.height.toFixed(3)}" rx="${l.cornerRadius}"/>`);
    else if (l.shape === 'ellipse') paths.push(`<ellipse transform="${tr}" cx="${(l.width / 2).toFixed(3)}" cy="${(l.height / 2).toFixed(3)}" rx="${(l.width / 2).toFixed(3)}" ry="${(l.height / 2).toFixed(3)}"/>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${region.width}mm" height="${region.height}mm" viewBox="${region.x} ${region.y} ${region.width} ${region.height}">
<g fill="none" stroke="#ff0000" stroke-width="0.1">
${paths.join('\n')}
</g>
</svg>`;
}

export async function buildExport(project: Project, outline: AcrylicOutline | null, opt: ExportOptions): Promise<ExportFile[]> {
  const p = getProduct(project.productId);
  const region = regionFor(project, outline, opt.includeBleed);
  const k = pxPerMm(opt.dpi);
  const base = safeFileName(project.name);
  const clip = p.family === 'acrylic' ? null : p.shape === 'circle' ? 'circle' : 'rect';
  const b = project.options.bleed;
  const clipRect = p.shape === 'circle' ? { x: -b, y: -b, width: project.width + 2 * b, height: project.height + 2 * b } : designRegion(project);
  const files: ExportFile[] = [];
  const add = async (name: string, label: string, c: HTMLCanvasElement) => {
    files.push({ name, label, blob: await png(c, opt.dpi), width: c.width, height: c.height });
  };

  const print = await renderLayers(project, {
    region,
    pxPerMm: k,
    processes: ['print'],
    mode: 'raw',
    background: p.family === 'acrylic' ? null : project.options.background,
    clip,
    clipRect,
  });
  await add(`${base}_印刷.png`, '印刷層（透明 PNG）', print);

  if (p.family === 'paper' && project.backLayers?.length) {
    const bp = swapSides(project);
    const back = await renderLayers(bp, { region, pxPerMm: k, processes: ['print'], mode: 'raw', background: bp.options.background, clip, clipRect });
    await add(`${base}_背面印刷.png`, '背面印刷（純印刷，不含雷射／白墨）', back);
  }

  const preview = await renderLayers(project, {
    region,
    pxPerMm: k,
    processes: ['white', 'print', 'foil'],
    mode: 'color',
    background: p.family === 'acrylic' ? null : project.options.background,
    backgroundFilm: project.options.substrate ?? null,
    clip,
    clipRect,
  });
  await add(`${base}_完稿預覽.png`, '完稿預覽（含燙金示意色）', preview);

  const foils = project.layers.filter((l) => l.visible && l.process === 'foil');
  if (foils.length) {
    const m = await renderLayers(project, { region, pxPerMm: k, processes: ['foil'], mode: 'raw', clip, clipRect });
    await add(`${base}_燙金遮罩.png`, '燙金／膜 遮罩（全部）', toBlackWhiteMask(m));
    const used = FILMS.filter((f) => foils.some((l) => l.film === f.id));
    if (used.length > 1) {
      for (const f of used) {
        const mf = await renderLayers(project, { region, pxPerMm: k, processes: ['foil'], mode: 'raw', filmFilter: f.id, clip, clipRect });
        await add(`${base}_燙金遮罩_${f.name}.png`, `燙金遮罩：${f.name}`, toBlackWhiteMask(mf));
      }
    }
  }
  if (project.layers.some((l) => l.visible && l.process === 'white')) {
    const m = await renderLayers(project, { region, pxPerMm: k, processes: ['white'], mode: 'raw', clip, clipRect });
    await add(`${base}_白墨遮罩.png`, '白墨遮罩', toBlackWhiteMask(m));
  }
  await add(`${base}_刀模線.png`, '刀模線（黑線）', cutLineCanvas(project, outline, region, k));
  files.push({ name: `${base}_刀模線.svg`, label: '刀模線（向量 SVG，mm）', blob: new Blob([cutSvg(project, outline, region)], { type: 'image/svg+xml' }) });
  return files;
}

export async function zipFiles(files: ExportFile[]): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.name] = new Uint8Array(await f.blob.arrayBuffer());
  const out = zipSync(entries, { level: 0 });
  return new Blob([out], { type: 'application/zip' });
}
