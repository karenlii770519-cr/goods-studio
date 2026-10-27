import { describe, expect, it } from 'vitest';
import { bleedRect, mmToPx, pxToMm, rotatedBounds, safeRect, trimRect, polygonArea, polygonBounds } from '../src/lib/geometry';
import { buildAcrylicOutline, dilateMask, stampDisc, stampRect, traceContours } from '../src/lib/outline';
import { PRODUCTS, defaultOptions, getProduct } from '../src/lib/products';

describe('單位換算', () => {
  it('25.4mm = 1 吋 = 300px @300dpi', () => {
    expect(mmToPx(25.4)).toBeCloseTo(300);
    expect(mmToPx(100)).toBeCloseTo(1181.1, 1);
    expect(pxToMm(300)).toBeCloseTo(25.4);
    expect(pxToMm(mmToPx(58, 600), 600)).toBeCloseTo(58);
  });
});

describe('出血與安全區', () => {
  it('卡片 100×148 出血 3mm → 106×154', () => {
    const r = bleedRect(100, 148, 3);
    expect(r).toEqual({ x: -3, y: -3, width: 106, height: 154 });
    expect(mmToPx(r.width)).toBeCloseTo(1251.97, 1);
  });
  it('安全區往內縮', () => {
    expect(safeRect(100, 148, 3)).toEqual({ x: 3, y: 3, width: 94, height: 142 });
    expect(trimRect(54, 86)).toEqual({ x: 0, y: 0, width: 54, height: 86 });
  });
  it('安全區不會縮成負的', () => {
    const r = safeRect(4, 10, 5);
    expect(r.width).toBeGreaterThanOrEqual(0);
    expect(r.height).toBeGreaterThanOrEqual(0);
  });
  it('旋轉 90° 外接框', () => {
    const b = rotatedBounds(0, 0, 10, 20, 90);
    expect(b.width).toBeCloseTo(20);
    expect(b.height).toBeCloseTo(10);
  });
});

describe('品項模板', () => {
  it('尺寸正確', () => {
    expect(getProduct('card')).toMatchObject({ width: 100, height: 148 });
    expect(getProduct('polaroid')).toMatchObject({ width: 54, height: 86 });
    expect(getProduct('badge')).toMatchObject({ width: 58, shape: 'circle' });
    expect(PRODUCTS).toHaveLength(9);
    expect(getProduct('tradingcard')).toMatchObject({ width: 63, height: 88 });
    expect(defaultOptions('card').bleed).toBe(3);
    expect(defaultOptions('card').safe).toBe(3);
  });
});

describe('外框偏移（距離擴張）', () => {
  const k = 10; // 10 px/mm
  const make = (wMm: number, hMm: number) => {
    const w = wMm * k, h = hMm * k;
    return { w, h, m: new Uint8Array(w * h) };
  };

  it('10mm 方塊擴 2mm → 約 14mm 寬、面積 ≈ 100+80+4π', () => {
    const { w, h, m } = make(30, 30);
    stampRect(m, w, h, 10 * k, 10 * k, 10 * k, 10 * k);
    const d = dilateMask(m, w, h, 2 * k);
    const c = traceContours(d, w, h);
    expect(c.length).toBe(1);
    const b = polygonBounds(c[0]);
    expect(b.width / k).toBeCloseTo(14, 0);
    expect(b.height / k).toBeCloseTo(14, 0);
    const area = Math.abs(polygonArea(c[0])) / (k * k);
    expect(area).toBeGreaterThan(190);
    expect(area).toBeLessThan(196);
  });

  it('兩塊分開的圖，擴張後會合成一塊', () => {
    const { w, h, m } = make(40, 20);
    stampRect(m, w, h, 5 * k, 5 * k, 10 * k, 10 * k);
    stampRect(m, w, h, 18 * k, 5 * k, 10 * k, 10 * k);
    expect(traceContours(m, w, h).length).toBe(2);
    expect(traceContours(dilateMask(m, w, h, 2 * k), w, h).length).toBe(1);
  });

  it('吊飾外框含掛孔，孔在圖稿上方', () => {
    const { w, h, m } = make(40, 40);
    stampDisc(m, w, h, 20 * k, 24 * k, 8 * k);
    const o = buildAcrylicOutline(
      { data: m, width: w, height: h, originX: -5, originY: -5, pxPerMm: k },
      { offset: 2.5, kind: 'charm', holeDiameter: 3 },
    );
    expect(o.polygon.length).toBeGreaterThan(10);
    expect(o.hole).not.toBeNull();
    expect(o.hole!.r).toBeCloseTo(1.5);
    // 圖稿頂端在 y = 16mm - 5（origin）= 11mm；孔應在上方
    expect(o.hole!.y).toBeLessThan(11);
    const b = polygonBounds(o.polygon);
    // 外框要包住孔
    expect(b.y).toBeLessThan(o.hole!.y - o.hole!.r);
    // 左右擴張 2.5mm：圖稿 x 範圍 [7,23]mm → 外框約 [4.5,25.5]
    expect(b.x).toBeCloseTo(4.5, 0);
    expect(b.x + b.width).toBeCloseTo(25.5, 0);
  });

  it('立牌外框含插腳', () => {
    const { w, h, m } = make(40, 60);
    stampRect(m, w, h, 10 * k, 10 * k, 20 * k, 40 * k);
    const o = buildAcrylicOutline(
      { data: m, width: w, height: h, originX: 0, originY: 0, pxPerMm: k },
      { offset: 2, kind: 'stand', holeDiameter: 3, tabWidth: 12 },
    );
    expect(o.tab).not.toBeNull();
    expect(o.tab!.width).toBeCloseTo(12, 0);
    const b = polygonBounds(o.polygon);
    expect(b.y + b.height).toBeGreaterThan(52 + 4);
  });

  it('空白圖稿 → 沒有外框', () => {
    const { w, h, m } = make(10, 10);
    const o = buildAcrylicOutline({ data: m, width: w, height: h, originX: 0, originY: 0, pxPerMm: k }, { offset: 2, kind: 'charm', holeDiameter: 3 });
    expect(o.polygon).toEqual([]);
  });
});
