/**
 * 範例圖稿：全部是本專案自己用 SVG 畫的，沒有使用任何外部素材。
 */
import { makeImage, makeShape, makeText, newProject } from './project';
import type { Project } from './types';

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** 夜空背景：漸層＋星點＋山丘 */
export function nightSkySvg(w = 106, h = 154): string {
  let dots = '';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * w, y = rnd() * h * 0.62, r = 0.25 + rnd() * 0.55;
    dots += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="#fff" opacity="${(0.35 + rnd() * 0.6).toFixed(2)}"/>`;
  }
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 10}" height="${h * 10}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#28306b"/><stop offset="0.55" stop-color="#5b5fb3"/><stop offset="1" stop-color="#f2a7c3"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#sky)"/>${dots}
<path d="M0 ${h * 0.78} Q ${w * 0.25} ${h * 0.68} ${w * 0.5} ${h * 0.77} T ${w} ${h * 0.74} V ${h} H0Z" fill="#7a6fc4" opacity="0.85"/>
<path d="M0 ${h * 0.86} Q ${w * 0.3} ${h * 0.8} ${w * 0.62} ${h * 0.87} T ${w} ${h * 0.84} V ${h} H0Z" fill="#4b4596"/>
</svg>`);
}

/** 小糰子角色（透明背景） */
export function mascotSvg(body = '#ffe7ef', cheek = '#ff9db8'): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="1200" height="1200">
<ellipse cx="60" cy="112" rx="34" ry="5" fill="#000" opacity="0.12"/>
<path d="M60 14 C 92 14 108 44 106 70 C 104 98 84 110 60 110 C 36 110 16 98 14 70 C 12 44 28 14 60 14 Z" fill="${body}" stroke="#3a2f4a" stroke-width="3.2"/>
<path d="M38 22 C 30 8 22 6 18 12 C 16 20 24 30 32 32" fill="${body}" stroke="#3a2f4a" stroke-width="3.2" stroke-linejoin="round"/>
<path d="M82 22 C 90 8 98 6 102 12 C 104 20 96 30 88 32" fill="${body}" stroke="#3a2f4a" stroke-width="3.2" stroke-linejoin="round"/>
<ellipse cx="44" cy="64" rx="4.2" ry="5.4" fill="#3a2f4a"/><ellipse cx="76" cy="64" rx="4.2" ry="5.4" fill="#3a2f4a"/>
<circle cx="45.5" cy="62" r="1.5" fill="#fff"/><circle cx="77.5" cy="62" r="1.5" fill="#fff"/>
<ellipse cx="34" cy="76" rx="7" ry="4" fill="${cheek}" opacity="0.8"/><ellipse cx="86" cy="76" rx="7" ry="4" fill="${cheek}" opacity="0.8"/>
<path d="M54 74 Q 60 80 66 74" fill="none" stroke="#3a2f4a" stroke-width="2.6" stroke-linecap="round"/>
<path d="M40 96 Q 60 104 80 96" fill="none" stroke="#3a2f4a" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
</svg>`);
}

/** 月亮（燙金用，單色剪影即可） */
export function moonSvg(): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="800" height="800">
<path d="M62 8 A 44 44 0 1 0 92 70 A 36 36 0 1 1 62 8 Z" fill="#000"/>
</svg>`);
}

export function sampleCard(): Project {
  const p = newProject('card', '範例－晚安小糰子');
  const W = p.width, H = p.height, b = p.options.bleed;
  p.layers = [
    makeImage(nightSkySvg(W + b * 2, H + b * 2), -b, -b, W + b * 2, H + b * 2, { name: '夜空背景', locked: true }),
    makeImage(mascotSvg(), W / 2 - 30, H * 0.4, 60, 60, { name: '小糰子' }),
    makeText('晚安，小糰子', 0, H * 0.83, { name: '標題', fill: '#ffffff', fontSize: 9 }),
    makeImage(moonSvg(), W * 0.6, 12, 26, 26, { name: '月亮', process: 'foil', film: 'holo' }),
    makeShape('star', 14, 18, 12, 12, { name: '大星星', process: 'foil', film: 'holo', fill: '#000' }),
    makeShape('star', 30, 36, 6, 6, { name: '小星星', process: 'foil', film: 'holo', fill: '#000', rotation: 12 }),
    makeShape('star', 78, 52, 7, 7, { name: '小星星 2', process: 'foil', film: 'holo', fill: '#000', rotation: -10 }),
    makeText('GOOD NIGHT', 0, H * 0.33, { name: '燙金字', process: 'foil', film: 'holo', fontSize: 7.5, fontWeight: 800, fill: '#000' }),
  ];
  // 文字置中
  for (const l of p.layers) if (l.type === 'text') l.x = (W - l.width) / 2;
  return p;
}

export function sampleCharm(): Project {
  const p = newProject('acrylic-charm', '範例－小糰子吊飾');
  p.layers = [
    makeImage(mascotSvg(), 5, 7, 40, 40, { name: '小糰子' }),
    makeImage(mascotSvg('#ffffff', '#ffffff'), 5, 7, 40, 40, { name: '白墨打底', process: 'white', opacity: 1 }),
    makeShape('star', 34, 8, 9, 9, { name: '雷射星星', process: 'foil', film: 'holo', fill: '#000', rotation: 15 }),
  ];
  return p;
}

export function sampleStand(): Project {
  const p = newProject('acrylic-stand', '範例－小糰子立牌');
  p.layers = [
    makeImage(mascotSvg('#e3f3ff', '#ffb3c7'), 8, 20, 64, 64, { name: '小糰子' }),
    makeText('ZZZ', 46, 10, { name: '睡覺字', fontSize: 9, fill: '#5b6cff' }),
  ];
  return p;
}

export function sampleBadge(): Project {
  const p = newProject('badge', '範例－小糰子徽章');
  p.options.background = '#ffd9e6';
  p.layers = [
    makeImage(mascotSvg(), 9, 10, 40, 40, { name: '小糰子' }),
    makeShape('ellipse', 3, 3, 52, 52, { name: '雷射外圈', process: 'foil', film: 'holo', fill: 'transparent', stroke: '#000', strokeWidth: 2.2 }),
  ];
  return p;
}
