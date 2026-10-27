export type Process = 'print' | 'foil' | 'white' | 'cut';

export type FilmId =
  | 'gold'
  | 'rosegold'
  | 'silver'
  | 'antique'
  | 'matteblack'
  | 'holo'
  | 'glitter'
  | 'shatter';

export type ShapeKind = 'rect' | 'ellipse' | 'star' | 'heart';

/** 表面覆膜：亮膜有清漆反光帶，霧膜把高光壓柔 */
export type Lamination = 'gloss' | 'matte';

interface LayerBase {
  id: string;
  name: string;
  process: Process;
  /** 燙金/膜材種類，只在 process === 'foil' 時使用 */
  film: FilmId;
  /** 位置與尺寸皆為 mm，座標原點為「成品尺寸（裁切線）」左上角 */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  src: string; // data URL
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  fontSize: number; // mm
  fontWeight: number;
  fontFamily: string;
  fill: string;
  align: 'left' | 'center' | 'right';
}

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number; // mm
  cornerRadius: number; // mm, 只對 rect 有效
}

export type Layer = ImageLayer | TextLayer | ShapeLayer;

export interface ProjectOptions {
  bleed: number; // mm
  safe: number; // mm（裁切線往內）
  /** 壓克力外框往外擴的距離 mm */
  outlineOffset: number;
  /** 吊飾掛孔直徑 mm */
  holeDiameter: number;
  /** 壓克力板厚 mm */
  thickness: number;
  /** 立牌底座寬 / 深 mm */
  baseWidth: number;
  baseDepth: number;
  /** 背景色（印刷底色），null = 透明 */
  background: string | null;
  /** 卡片底材：null = 一般紙張；設定膜材 = 整張卡印在雷射／金屬膜上（雷射卡底材） */
  substrate?: FilmId | null;
  /** 沒有白墨的地方，印刷墨的透明程度（0 = 完全不透，1 = 很透） */
  inkClarity?: number;
  /** 背面底色（卡片類）；undefined = 白 */
  backBackground?: string | null;
  /** 背面的底材，目前固定為一般紙（null） */
  backSubstrate?: FilmId | null;
  /** 正面表面覆膜。舊檔可能沒有，讀取時補成亮膜 */
  lamination?: Lamination;
  /** 背面表面覆膜。舊檔可能沒有，讀取時補成霧膜 */
  backLamination?: Lamination;
}

export interface Project {
  id: string;
  name: string;
  productId: ProductId;
  /** 成品寬高（mm），由品項模板帶入，亞克力可自訂 */
  width: number;
  height: number;
  options: ProjectOptions;
  layers: Layer[];
  /** 背面圖層（卡片類，純印刷），沒有就是空白紙背 */
  backLayers?: Layer[];
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

export type ProductId =
  | 'card'
  | 'tradingcard'
  | 'polaroid'
  | 'postcard'
  | 'bookmark'
  | 'colorboard'
  | 'badge'
  | 'acrylic-stand'
  | 'acrylic-charm';
