/**
 * 壓克力自動外框：從圖稿的透明度產生遮罩 → 依距離擴張（offset）→ 描出外輪廓多邊形。
 * 全部是純函式，方便單元測試；瀏覽器端只負責把圖稿畫成 alpha 遮罩。
 */
import { polygonArea, type Pt } from './geometry';

const INF = 1e20;

/** 1D 平方距離轉換（Felzenszwalb & Huttenlocher） */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** 回傳每個像素到最近「有圖」像素的平方距離（px²） */
export function squaredDistanceField(mask: Uint8Array, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = mask[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  // columns
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  // rows
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x];
  }
  return out;
}

/** 將遮罩往外擴 radius 像素（歐氏距離，圓角效果） */
export function dilateMask(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();
  const df = squaredDistanceField(mask, w, h);
  const r2 = radius * radius;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = df[i] <= r2 ? 1 : 0;
  return out;
}

/** 在遮罩上畫一個實心圓（union） */
export function stampDisc(mask: Uint8Array, w: number, h: number, cx: number, cy: number, r: number, value = 1) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) mask[y * w + x] = value;
    }
}

export function stampRect(mask: Uint8Array, w: number, h: number, rx: number, ry: number, rw: number, rh: number, value = 1) {
  const x0 = Math.max(0, Math.floor(rx)), x1 = Math.min(w, Math.ceil(rx + rw));
  const y0 = Math.max(0, Math.floor(ry)), y1 = Math.min(h, Math.ceil(ry + rh));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * w + x] = value;
}

/**
 * Marching squares：描出遮罩所有封閉輪廓（像素座標），回傳依面積大到小排序。
 */
export function traceContours(mask: Uint8Array, w: number, h: number): Pt[][] {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);
  // 以像素中心為格點，邊上中點為頂點。key = 邊的唯一 id
  const segs = new Map<string, string>(); // from -> to（有方向，外圈逆時針）
  const pts = new Map<string, Pt>();
  const key = (x: number, y: number) => `${x},${y}`;
  const addSeg = (ax: number, ay: number, bx: number, by: number) => {
    const ka = key(ax, ay), kb = key(bx, by);
    pts.set(ka, { x: ax, y: ay });
    pts.set(kb, { x: bx, y: by });
    segs.set(ka, kb);
  };
  // 格點 (x,y) 代表像素中心 (x+0.5, y+0.5)；cell 由 (x,y),(x+1,y),(x+1,y+1),(x,y+1) 構成
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1);
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      // 邊中點（以像素中心座標系表示）
      const cx = x + 0.5, cy = y + 0.5;
      const T: [number, number] = [cx + 0.5, cy];
      const R: [number, number] = [cx + 1, cy + 0.5];
      const B: [number, number] = [cx + 0.5, cy + 1];
      const L: [number, number] = [cx, cy + 0.5];
      const s = (a: [number, number], b: [number, number]) => addSeg(a[0], a[1], b[0], b[1]);
      // 方向：讓「有圖」那側在行進方向的左手邊（螢幕座標下為順時針外圈）
      switch (c) {
        case 1: s(L, B); break;
        case 2: s(B, R); break;
        case 3: s(L, R); break;
        case 4: s(R, T); break;
        case 5: s(L, T); s(R, B); break; // 鞍點：分開
        case 6: s(B, T); break;
        case 7: s(L, T); break;
        case 8: s(T, L); break;
        case 9: s(T, B); break;
        case 10: s(T, R); s(B, L); break;
        case 11: s(T, R); break;
        case 12: s(R, L); break;
        case 13: s(R, B); break;
        case 14: s(B, L); break;
      }
    }
  }
  const contours: Pt[][] = [];
  const visited = new Set<string>();
  for (const start of segs.keys()) {
    if (visited.has(start)) continue;
    const poly: Pt[] = [];
    let cur: string | undefined = start;
    let guard = 0;
    while (cur && !visited.has(cur) && guard++ < 10_000_000) {
      visited.add(cur);
      poly.push(pts.get(cur)!);
      cur = segs.get(cur);
    }
    if (poly.length >= 3) contours.push(poly);
  }
  contours.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  return contours;
}

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const px = a.x + t * dx, py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

/** Ramer–Douglas–Peucker 簡化（開放折線） */
export function simplifyRDP(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    let maxD = 0, idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = perpDist(pts[i], pts[i0], pts[i1]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([i0, idx], [idx, i1]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** 封閉多邊形簡化：從最遠的兩點切開再分別簡化 */
export function simplifyClosed(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 8) return pts.slice();
  let far = 0, best = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d > best) { best = d; far = i; }
  }
  const a = simplifyRDP(pts.slice(0, far + 1), eps);
  const b = simplifyRDP([...pts.slice(far), pts[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Chaikin 平滑（封閉） */
export function smoothChaikin(pts: Pt[], iterations = 2): Pt[] {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const next: Pt[] = [];
    for (let i = 0; i < cur.length; i++) {
      const p = cur[i], q = cur[(i + 1) % cur.length];
      next.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 });
      next.push({ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 });
    }
    cur = next;
  }
  return cur;
}

export interface AlphaMask {
  data: Uint8Array; // 0/1
  width: number;
  height: number;
  /** 遮罩像素 (0,0) 對應的 mm 座標 */
  originX: number;
  originY: number;
  pxPerMm: number;
}

export interface Hole {
  x: number; // 圓心 mm
  y: number;
  r: number;
}

export interface AcrylicOutline {
  /** 外框（mm，順時針），空陣列 = 無圖稿 */
  polygon: Pt[];
  hole: Hole | null;
  /** 立牌插腳（mm） */
  tab: { x: number; y: number; width: number; height: number } | null;
  /** 原圖稿外接框（mm） */
  artBounds: { x: number; y: number; width: number; height: number } | null;
}

export interface OutlineParams {
  offset: number; // mm
  kind: 'charm' | 'stand' | 'none';
  holeDiameter: number; // mm
  tabWidth?: number; // mm
  tabHeight?: number; // mm（插腳長度，通常等於底座板厚）
}

function maskBounds(m: Uint8Array, w: number, h: number) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (m[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/** 由圖稿遮罩產生壓克力外框（含掛孔/插腳） */
export function buildAcrylicOutline(src: AlphaMask, p: OutlineParams): AcrylicOutline {
  const { width: w, height: h, pxPerMm: k } = src;
  const bounds = maskBounds(src.data, w, h);
  if (!bounds) return { polygon: [], hole: null, tab: null, artBounds: null };
  const toMm = (px: number, py: number): Pt => ({ x: src.originX + px / k, y: src.originY + py / k });
  const artBounds = {
    x: src.originX + bounds.minX / k,
    y: src.originY + bounds.minY / k,
    width: (bounds.maxX - bounds.minX + 1) / k,
    height: (bounds.maxY - bounds.minY + 1) / k,
  };
  // 先把破碎的小島連起來：擴張後的形狀只取最大的一塊
  const m = dilateMask(src.data, w, h, p.offset * k);
  let hole: Hole | null = null;
  let tab: AcrylicOutline['tab'] = null;
  const cxPx = (bounds.minX + bounds.maxX + 1) / 2;

  if (p.kind === 'charm') {
    const r = (p.holeDiameter / 2) * k;
    const ring = Math.max(p.offset, 2) * k;
    // 找中央那一欄圖稿最上緣
    let topAtCx = bounds.minY;
    const col = Math.round(cxPx);
    for (let y = 0; y < h; y++) if (src.data[y * w + col]) { topAtCx = y; break; }
    const top = Math.min(topAtCx, bounds.minY + (bounds.maxY - bounds.minY) * 0.25);
    const cy = top - r - 0.6 * k;
    stampDisc(m, w, h, cxPx, cy, r + ring);
    hole = { ...toMm(cxPx, cy), r: p.holeDiameter / 2 };
  } else if (p.kind === 'stand') {
    const tw = Math.min((p.tabWidth ?? 30) * k, (bounds.maxX - bounds.minX) * 0.8);
    // 找擴張後的最下緣
    const mb = maskBounds(m, w, h)!;
    const th = p.tabHeight ?? 5;
    const tabTop = mb.maxY - 3 * k;
    const tabH = 3 * k + th * k;
    stampRect(m, w, h, cxPx - tw / 2, tabTop, tw, tabH + 1);
    tab = { ...toMm(cxPx - tw / 2, mb.maxY + 1), width: tw / k, height: th };
  }
  const contours = traceContours(m, w, h);
  if (!contours.length) return { polygon: [], hole, tab, artBounds };
  const simplified = simplifyClosed(contours[0], 0.6);
  const smooth = p.kind === 'stand' ? simplified : smoothChaikin(simplified, 2);
  return { polygon: smooth.map((q) => toMm(q.x, q.y)), hole, tab, artBounds };
}

export function polygonToSvgPath(pts: Pt[], digits = 3): string {
  if (!pts.length) return '';
  const f = (n: number) => n.toFixed(digits);
  return `M${pts.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L')} Z`;
}
