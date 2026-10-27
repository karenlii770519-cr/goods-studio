import type { FilmId } from './types';

export interface Film {
  id: FilmId;
  name: string;
  /** 0 = 金屬, 1 = 彩虹雷射, 2 = 亮片雷射, 3 = 碎玻璃雷射 */
  kind: 0 | 1 | 2 | 3;
  /** 線性 RGB 0–1 基底色 */
  color: [number, number, number];
  /** 0 = 鏡面, 1 = 霧面 */
  roughness: number;
  /** 2D 編輯器裡的示意漸層 */
  swatch: string[];
}

export const FILMS: Film[] = [
  { id: 'gold', name: '亮金', kind: 0, color: [1.0, 0.72, 0.29], roughness: 0.18, swatch: ['#a8741a', '#f7dc8a', '#c99a2e', '#fff1c1', '#b5852a'] },
  { id: 'rosegold', name: '玫瑰金', kind: 0, color: [0.98, 0.6, 0.52], roughness: 0.2, swatch: ['#a5604f', '#f6c4b4', '#c9806c', '#ffe3d8', '#b46f5d'] },
  { id: 'silver', name: '亮銀', kind: 0, color: [0.92, 0.93, 0.95], roughness: 0.15, swatch: ['#8d939c', '#f2f4f7', '#aab0b9', '#ffffff', '#9aa1aa'] },
  { id: 'antique', name: '古銅金', kind: 0, color: [0.72, 0.5, 0.25], roughness: 0.42, swatch: ['#6e4b22', '#c69a5c', '#8a6232', '#d9b27a', '#7a5528'] },
  { id: 'matteblack', name: '霧黑', kind: 0, color: [0.035, 0.035, 0.04], roughness: 0.62, swatch: ['#1b1b1e', '#3a3a40', '#222226', '#45454b', '#1e1e22'] },
  { id: 'holo', name: '彩虹雷射', kind: 1, color: [0.85, 0.87, 0.9], roughness: 0.15, swatch: ['#ff9ad5', '#ffe58a', '#9dffc6', '#8fd3ff', '#c7a2ff'] },
  { id: 'glitter', name: '亮片雷射', kind: 2, color: [0.8, 0.82, 0.86], roughness: 0.2, swatch: ['#d6d9e0', '#ffffff', '#c0f0ff', '#ffd6f5', '#e6e9ee'] },
  { id: 'shatter', name: '碎玻璃雷射', kind: 3, color: [0.85, 0.86, 0.9], roughness: 0.12, swatch: ['#b8f1ff', '#ffc7e8', '#fff3b0', '#c8ffd9', '#d6c8ff'] },
];

export function getFilm(id: FilmId): Film {
  return FILMS.find((f) => f.id === id) ?? FILMS[0];
}

export function filmIndex(id: FilmId): number {
  return Math.max(0, FILMS.findIndex((f) => f.id === id));
}
