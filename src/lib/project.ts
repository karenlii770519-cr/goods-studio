import { uid } from './id';
import { defaultOptions, getProduct } from './products';
import { measureText } from './render';
import type { FilmId, ImageLayer, Layer, Process, ProductId, Project, ShapeKind, ShapeLayer, TextLayer } from './types';

export const DEFAULT_FONT = '"PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", "Microsoft JhengHei", system-ui, sans-serif';

export const FONT_CHOICES: { label: string; value: string }[] = [
  { label: '黑體（系統）', value: DEFAULT_FONT },
  { label: '明體（系統）', value: '"Songti TC", "Noto Serif TC", "Noto Serif CJK TC", "PMingLiU", serif' },
  { label: '圓體（系統）', value: '"Yuanti TC", "jf-openhuninn", ui-rounded, "Arial Rounded MT Bold", "PingFang TC", "Noto Sans TC", sans-serif' },
  { label: '等寬', value: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace' },
];

export function newProject(productId: ProductId, name?: string): Project {
  const p = getProduct(productId);
  const now = Date.now();
  return {
    id: uid('p'),
    name: name ?? `${p.name}－未命名`,
    productId,
    width: p.width,
    height: p.height,
    options: defaultOptions(productId),
    layers: [],
    createdAt: now,
    updatedAt: now,
  };
}

const base = (process: Process, name: string) => ({
  id: uid('l'),
  name,
  process,
  film: 'gold' as FilmId,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
});

export function makeText(text: string, x: number, y: number, opts: Partial<TextLayer> = {}): TextLayer {
  const l: TextLayer = {
    ...base(opts.process ?? 'print', opts.name ?? '文字'),
    type: 'text',
    text,
    x,
    y,
    width: 10,
    height: 10,
    fontSize: 8,
    fontWeight: 700,
    fontFamily: DEFAULT_FONT,
    fill: '#1f2430',
    align: 'center',
    ...opts,
  } as TextLayer;
  return fitText(l);
}

export function fitText(l: TextLayer): TextLayer {
  const m = measureText(l);
  return { ...l, width: m.width, height: m.height };
}

export function makeShape(shape: ShapeKind, x: number, y: number, w: number, h: number, opts: Partial<ShapeLayer> = {}): ShapeLayer {
  const names: Record<ShapeKind, string> = { rect: '矩形', ellipse: '圓形', star: '星形', heart: '愛心' };
  return {
    ...base(opts.process ?? 'print', opts.name ?? names[shape]),
    type: 'shape',
    shape,
    x,
    y,
    width: w,
    height: h,
    fill: '#5b6cff',
    stroke: 'transparent',
    strokeWidth: 0,
    cornerRadius: shape === 'rect' ? 2 : 0,
    ...opts,
  } as ShapeLayer;
}

export function makeImage(src: string, x: number, y: number, w: number, h: number, opts: Partial<ImageLayer> = {}): ImageLayer {
  return {
    ...base(opts.process ?? 'print', opts.name ?? '圖片'),
    type: 'image',
    src,
    x,
    y,
    width: w,
    height: h,
    ...opts,
  } as ImageLayer;
}

export function cloneLayer(l: Layer): Layer {
  return { ...l, id: uid('l'), name: `${l.name} 複本`, x: l.x + 3, y: l.y + 3 };
}

export const PROCESS_LABEL: Record<Process, string> = {
  print: '印刷',
  foil: '燙金／膜',
  white: '白墨',
  cut: '刀模',
};

export const PROCESS_HINT: Record<Process, string> = {
  print: '彩色印刷的圖案與底圖',
  foil: '燙金、燙銀與雷射膜，會在 3D 預覽反光',
  white: '壓克力或透明材質上的白色打底',
  cut: '額外的切割線（外框由系統自動產生）',
};

export const PROCESS_ORDER: Process[] = ['foil', 'white', 'print', 'cut'];
