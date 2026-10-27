/**
 * 以 Canvas 2D 繪製設計稿：匯出 PNG、遮罩、3D 貼圖、壓克力外框都共用這裡。
 * 座標單位為 mm，透過 pxPerMm 縮放。
 */
import { getFilm, filmIndex } from './films';
import type { Rect } from './geometry';
import { buildAcrylicOutline, type AcrylicOutline } from './outline';
import { getProduct } from './products';
import type { Layer, Process, Project, ShapeKind, TextLayer } from './types';

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('圖片載入失敗'));
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export const TEXT_LINE_HEIGHT = 1.2;

export function fontString(l: Pick<TextLayer, 'fontWeight' | 'fontSize' | 'fontFamily'>, scale = 1): string {
  return `${l.fontWeight} ${l.fontSize * scale}px ${l.fontFamily}`;
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** 量測文字寬高（mm） */
export function measureText(l: Pick<TextLayer, 'text' | 'fontWeight' | 'fontSize' | 'fontFamily'>): { width: number; height: number } {
  if (!measureCtx) measureCtx = createCanvas(4, 4).getContext('2d')!;
  // 用 100 倍放大量測避免小字號誤差
  measureCtx.font = fontString(l, 100);
  const lines = l.text.split('\n');
  const w = Math.max(...lines.map((s) => measureCtx!.measureText(s || ' ').width)) / 100;
  return { width: Math.max(w, l.fontSize * 0.5), height: lines.length * l.fontSize * TEXT_LINE_HEIGHT };
}

export function shapePath(ctx: CanvasRenderingContext2D | Path2D, kind: ShapeKind, w: number, h: number, r = 0) {
  switch (kind) {
    case 'rect': {
      const rr = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.moveTo(rr, 0);
      ctx.lineTo(w - rr, 0);
      ctx.arcTo(w, 0, w, rr, rr);
      ctx.lineTo(w, h - rr);
      ctx.arcTo(w, h, w - rr, h, rr);
      ctx.lineTo(rr, h);
      ctx.arcTo(0, h, 0, h - rr, rr);
      ctx.lineTo(0, rr);
      ctx.arcTo(0, 0, rr, 0, rr);
      ctx.closePath();
      break;
    }
    case 'ellipse':
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.closePath();
      break;
    case 'star': {
      const pts = starPoints(w, h);
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
      break;
    }
    case 'heart': {
      // 用兩段三次貝茲曲線組成的愛心
      ctx.moveTo(w / 2, h * 0.28);
      ctx.bezierCurveTo(w * 0.5, h * 0.05, w * 0.05, h * -0.02, w * 0.02, h * 0.32);
      ctx.bezierCurveTo(0, h * 0.62, w * 0.35, h * 0.78, w / 2, h);
      ctx.bezierCurveTo(w * 0.65, h * 0.78, w, h * 0.62, w * 0.98, h * 0.32);
      ctx.bezierCurveTo(w * 0.95, h * -0.02, w * 0.5, h * 0.05, w / 2, h * 0.28);
      ctx.closePath();
      break;
    }
  }
}

/** 五角星頂點（相對於 w×h 框） */
export function starPoints(w: number, h: number, spikes = 5, innerRatio = 0.45): number[] {
  const pts: number[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / spikes;
    const rr = i % 2 === 0 ? 1 : innerRatio;
    pts.push(w / 2 + (Math.cos(a) * rr * w) / 2, h * 0.53 + (Math.sin(a) * rr * h) / 2 / 1.05);
  }
  return pts;
}

export type DrawMode =
  /** 實際顏色（燙金以示意漸層、白墨以白色呈現） */
  | 'color'
  /** 原色，不替換燙金顏色（印刷層用） */
  | 'raw';

function makeGradient(ctx: CanvasRenderingContext2D, w: number, h: number, stops: string[]) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  stops.forEach((c, i) => g.addColorStop(i / Math.max(1, stops.length - 1), c));
  return g;
}

/** 在已設好 transform 的 ctx 上畫一個圖層（0,0 為圖層左上角，單位 mm） */
async function drawLayerContent(ctx: CanvasRenderingContext2D, l: Layer, fillOverride?: string | CanvasGradient) {
  ctx.globalAlpha = l.opacity;
  if (l.type === 'image') {
    const img = await loadImage(l.src);
    ctx.drawImage(img, 0, 0, l.width, l.height);
  } else if (l.type === 'text') {
    ctx.font = fontString(l);
    ctx.fillStyle = fillOverride ?? l.fill;
    ctx.textBaseline = 'middle';
    ctx.textAlign = l.align;
    const ax = l.align === 'left' ? 0 : l.align === 'center' ? l.width / 2 : l.width;
    l.text.split('\n').forEach((line, i) => {
      ctx.fillText(line, ax, (i + 0.5) * l.fontSize * TEXT_LINE_HEIGHT);
    });
  } else {
    ctx.beginPath();
    shapePath(ctx, l.shape, l.width, l.height, l.cornerRadius);
    if (l.fill && l.fill !== 'transparent') {
      ctx.fillStyle = fillOverride ?? l.fill;
      ctx.fill();
    }
    if (l.strokeWidth > 0 && l.stroke && l.stroke !== 'transparent') {
      ctx.lineWidth = l.strokeWidth;
      ctx.strokeStyle = fillOverride ?? l.stroke;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function applyLayerTransform(ctx: CanvasRenderingContext2D, l: Layer, region: Rect, k: number) {
  ctx.setTransform(k, 0, 0, k, (l.x - region.x) * k, (l.y - region.y) * k);
  ctx.rotate((l.rotation * Math.PI) / 180);
}

/** 單一圖層以「上色」方式畫進一張與 region 同大小的暫存畫布 */
async function renderLayerTinted(l: Layer, region: Rect, k: number, tint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = createCanvas(region.width * k, region.height * k);
  const ctx = c.getContext('2d')!;
  applyLayerTransform(ctx, l, region, k);
  await drawLayerContent(ctx, l);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  tint(ctx, c.width, c.height);
  return c;
}

export interface RenderOptions {
  region: Rect;
  pxPerMm: number;
  processes: Process[];
  mode: DrawMode;
  /** 只畫某種膜材 */
  filmFilter?: string;
  background?: string | null;
  /** 以膜材示意漸層當底（雷射卡底材） */
  backgroundFilm?: string | null;
  /** 裁切形狀（null = 不裁） */
  clip?: 'rect' | 'circle' | null;
  clipRect?: Rect;
  includeHidden?: boolean;
}

export async function renderLayers(project: Project, o: RenderOptions): Promise<HTMLCanvasElement> {
  const k = o.pxPerMm;
  const c = createCanvas(o.region.width * k, o.region.height * k);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const clip = () => {
    if (!o.clip || !o.clipRect) return;
    const r = o.clipRect;
    ctx.setTransform(k, 0, 0, k, -o.region.x * k, -o.region.y * k);
    ctx.beginPath();
    if (o.clip === 'circle') ctx.ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
    else ctx.rect(r.x, r.y, r.width, r.height);
    ctx.clip();
  };
  ctx.save();
  clip();
  if (o.backgroundFilm) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = makeGradient(ctx, c.width, c.height, getFilm(o.backgroundFilm as never).swatch);
    ctx.fillRect(0, 0, c.width, c.height);
  } else if (o.background) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  const order: Process[] = ['white', 'print', 'foil', 'cut'];
  const layers = order.flatMap((p) => project.layers.filter((l) => l.process === p));
  for (const l of layers) {
    if (!o.includeHidden && !l.visible) continue;
    if (!o.processes.includes(l.process)) continue;
    if (o.filmFilter && (l.process !== 'foil' || l.film !== o.filmFilter)) continue;
    if (o.mode === 'color' && l.process === 'foil') {
      const film = getFilm(l.film);
      const t = await renderLayerTinted(l, o.region, k, (tc, w, h) => {
        tc.fillStyle = makeGradient(tc, w, h, film.swatch);
        tc.fillRect(0, 0, w, h);
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(t, 0, 0);
    } else if (o.mode === 'color' && l.process === 'white') {
      const t = await renderLayerTinted(l, o.region, k, (tc, w, h) => {
        tc.fillStyle = 'rgba(255,255,255,0.96)';
        tc.fillRect(0, 0, w, h);
      });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(t, 0, 0);
    } else {
      applyLayerTransform(ctx, l, o.region, k);
      await drawLayerContent(ctx, l);
    }
  }
  ctx.restore();
  return c;
}

/** 把畫布上的所有內容轉成黑色（保留透明度），再墊白底 → 黑白遮罩 */
export function toBlackWhiteMask(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = createCanvas(src.width, src.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  // 二值化：alpha > 50% 視為有
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] > 127;
    d[i] = d[i + 1] = d[i + 2] = on ? 0 : 255;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** 3D 用：膜材索引貼圖。R = 膜材編號，A = 覆蓋率 */
export async function renderFoilIdMap(project: Project, region: Rect, k: number): Promise<HTMLCanvasElement> {
  const c = createCanvas(region.width * k, region.height * k);
  const ctx = c.getContext('2d')!;
  for (const l of project.layers) {
    if (!l.visible || l.process !== 'foil') continue;
    const idx = filmIndex(l.film);
    const t = await renderLayerTinted(l, region, k, (tc, w, h) => {
      tc.fillStyle = `rgb(${idx * 32 + 16},0,0)`;
      tc.fillRect(0, 0, w, h);
    });
    ctx.drawImage(t, 0, 0);
  }
  return c;
}

/* ------------------------------------------------------------------ */
/* 區域與裁切形狀                                                       */
/* ------------------------------------------------------------------ */

/** 壓克力外框運算時，畫布四周預留的空間 mm */
export function acrylicPad(project: Project): number {
  const o = project.options;
  return Math.ceil(o.outlineOffset + o.holeDiameter + Math.max(o.outlineOffset, 2) + 10);
}

/** 設計稿的「完整範圍」：紙類 = 出血範圍；壓克力 = 畫布加預留 */
export function designRegion(project: Project): Rect {
  const p = getProduct(project.productId);
  if (p.family === 'acrylic') {
    const pad = acrylicPad(project);
    return { x: -pad, y: -pad, width: project.width + pad * 2, height: project.height + pad * 2 + (project.productId === 'acrylic-stand' ? 10 : 0) };
  }
  const b = project.options.bleed;
  return { x: -b, y: -b, width: project.width + b * 2, height: project.height + b * 2 };
}

/* ------------------------------------------------------------------ */
/* 壓克力外框                                                           */
/* ------------------------------------------------------------------ */

const outlineCache = new Map<string, AcrylicOutline>();

function outlineKey(project: Project): string {
  const layers = project.layers
    .filter((l) => l.visible && l.process !== 'cut')
    .map((l) => {
      const { src, ...rest } = l as Layer & { src?: string };
      return { ...rest, src: src ? src.length + src.slice(-32) : undefined };
    });
  const o = project.options;
  return JSON.stringify([project.productId, project.width, project.height, o.outlineOffset, o.holeDiameter, o.thickness, o.baseWidth, layers]);
}

export async function computeAcrylicOutline(project: Project): Promise<AcrylicOutline> {
  const key = outlineKey(project);
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const k = 6; // 遮罩解析度 px/mm
  const region = designRegion(project);
  const canvas = await renderLayers(project, { region, pxPerMm: k, processes: ['print', 'foil', 'white'], mode: 'raw' });
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const mask = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < mask.length; i++) mask[i] = img[i * 4 + 3] > 24 ? 1 : 0;
  const isStand = project.productId === 'acrylic-stand';
  const res = buildAcrylicOutline(
    { data: mask, width: canvas.width, height: canvas.height, originX: region.x, originY: region.y, pxPerMm: k },
    {
      offset: project.options.outlineOffset,
      kind: isStand ? 'stand' : 'charm',
      holeDiameter: project.options.holeDiameter,
      tabWidth: Math.min(project.options.baseWidth * 0.5, 30),
      tabHeight: project.options.thickness,
    },
  );
  if (outlineCache.size > 30) outlineCache.clear();
  outlineCache.set(key, res);
  return res;
}

/**
 * 把「黑白遮罩」圖片轉成白墨圖層用的透明度圖：黑 = 有白墨（不透明），白 = 沒有白墨（透明）。
 * 會先做 50% 門檻，邊緣保留 1px 反鋸齒。
 */
export async function blackWhiteToAlpha(src: string): Promise<string> {
  const img = await loadImage(src);
  const c = createCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const lum = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    const a = (p[i + 3] / 255) * (1 - lum / 255);
    // 把灰階拉陡，接近二值，但留一點過渡避免鋸齒
    const t = Math.min(1, Math.max(0, (a - 0.35) / 0.3));
    p[i] = p[i + 1] = p[i + 2] = 255;
    p[i + 3] = Math.round(t * 255);
  }
  ctx.putImageData(d, 0, 0);
  return c.toDataURL('image/png');
}
