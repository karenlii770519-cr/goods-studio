import type { ProductId, ProjectOptions } from './types';

export type ProductFamily = 'paper' | 'badge' | 'acrylic';

export interface ProductTemplate {
  id: ProductId;
  name: string;
  family: ProductFamily;
  width: number; // mm
  height: number; // mm
  shape: 'rect' | 'circle';
  cornerRadius: number; // mm
  description: string;
  /** 紙張/板材厚度 mm（3D 預覽用） */
  thickness: number;
}

export const PRODUCTS: ProductTemplate[] = [
  { id: 'card', name: '卡片', family: 'paper', width: 100, height: 148, shape: 'rect', cornerRadius: 3, thickness: 0.45, description: '100 × 148 mm' },
  { id: 'tradingcard', name: '收藏卡', family: 'paper', width: 63, height: 88, shape: 'rect', cornerRadius: 3, thickness: 0.35, description: '63 × 88 mm（閃卡尺寸）' },
  { id: 'polaroid', name: '拍立得', family: 'paper', width: 54, height: 86, shape: 'rect', cornerRadius: 2, thickness: 0.45, description: '54 × 86 mm' },
  { id: 'postcard', name: '明信片', family: 'paper', width: 148, height: 100, shape: 'rect', cornerRadius: 0, thickness: 0.4, description: '148 × 100 mm' },
  { id: 'bookmark', name: '書籤', family: 'paper', width: 50, height: 150, shape: 'rect', cornerRadius: 3, thickness: 0.45, description: '50 × 150 mm' },
  { id: 'colorboard', name: '色板', family: 'paper', width: 135, height: 135, shape: 'rect', cornerRadius: 0, thickness: 0.8, description: '135 × 135 mm' },
  { id: 'badge', name: '徽章', family: 'badge', width: 58, height: 58, shape: 'circle', cornerRadius: 0, thickness: 4, description: '⌀ 58 mm 圓形' },
  { id: 'acrylic-stand', name: '壓克力立牌', family: 'acrylic', width: 80, height: 120, shape: 'rect', cornerRadius: 0, thickness: 3, description: '畫布 80 × 120 mm，依圖自動切外框＋底座' },
  { id: 'acrylic-charm', name: '壓克力吊飾', family: 'acrylic', width: 50, height: 50, shape: 'rect', cornerRadius: 0, thickness: 3, description: '畫布 50 × 50 mm，依圖自動切外框＋掛孔' },
];

export function getProduct(id: ProductId): ProductTemplate {
  return PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0];
}

export function defaultOptions(id: ProductId): ProjectOptions {
  const p = getProduct(id);
  return {
    bleed: p.family === 'acrylic' ? 0 : 3,
    safe: 3,
    outlineOffset: 2.5,
    holeDiameter: 3,
    thickness: p.thickness,
    baseWidth: 60,
    baseDepth: 30,
    background: p.family === 'acrylic' ? null : '#ffffff',
    substrate: null,
    inkClarity: 0.6,
  };
}

export const FAMILY_LABEL: Record<ProductFamily, string> = {
  paper: '紙製品',
  badge: '徽章',
  acrylic: '壓克力',
};
