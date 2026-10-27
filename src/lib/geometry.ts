/** 幾何工具：單位換算、出血/安全區矩形、外框偏移等 */

export const MM_PER_INCH = 25.4;

export function mmToPx(mm: number, dpi = 300): number {
  return (mm / MM_PER_INCH) * dpi;
}

export function pxToMm(px: number, dpi = 300): number {
  return (px / dpi) * MM_PER_INCH;
}

export function pxPerMm(dpi = 300): number {
  return dpi / MM_PER_INCH;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 成品（裁切線）矩形，原點在左上角 */
export function trimRect(width: number, height: number): Rect {
  return { x: 0, y: 0, width, height };
}

/** 出血矩形：裁切線往外擴 bleed */
export function bleedRect(width: number, height: number, bleed: number): Rect {
  return { x: -bleed, y: -bleed, width: width + bleed * 2, height: height + bleed * 2 };
}

/** 安全區矩形：裁切線往內縮 safe（不會小於 0） */
export function safeRect(width: number, height: number, safe: number): Rect {
  const s = Math.max(0, Math.min(safe, width / 2, height / 2));
  return { x: s, y: s, width: width - s * 2, height: height - s * 2 };
}

export function insetRect(r: Rect, d: number): Rect {
  return { x: r.x + d, y: r.y + d, width: Math.max(0, r.width - 2 * d), height: Math.max(0, r.height - 2 * d) };
}

export interface Pt {
  x: number;
  y: number;
}

/** 多邊形面積（有號，順時針為負/正依座標系） */
export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function polygonBounds(pts: Pt[]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** 旋轉後圖層的外接框（圖層以左上角為旋轉中心，同 Konva） */
export function rotatedBounds(x: number, y: number, w: number, h: number, deg: number): Rect {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const corners: Pt[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ].map((p) => ({ x: x + p.x * c - p.y * s, y: y + p.x * s + p.y * c }));
  return polygonBounds(corners);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
