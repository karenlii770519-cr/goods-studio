import { useEffect, useRef } from 'react';
import { FILMS } from '../lib/films';
import { getProduct } from '../lib/products';
import { FONT_CHOICES, PROCESS_LABEL } from '../lib/project';
import type { FilmId, Layer, Process, Project, ProjectOptions } from '../lib/types';
import { Icon } from './Icon';

const PT = 0.3528; // 1pt = 0.3528mm

function Num({
  label,
  value,
  onChange,
  step = 0.5,
  min,
  max,
  unit,
  digits = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  digits?: number;
}) {
  return (
    <label className="field num">
      <span className="field-label">{label}</span>
      <span className="num-wrap">
        <input
          type="number"
          className="input"
          value={Number(value.toFixed(digits))}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, v) : v) : v);
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const isNone = !value || value === 'transparent';
  return (
    <label className="field color">
      <span className="field-label">{label}</span>
      <span className="color-wrap">
        <input type="color" value={isNone ? '#ffffff' : value} onChange={(e) => onChange(e.target.value)} />
        <span className="mono small">{isNone ? '無' : value.toUpperCase()}</span>
      </span>
    </label>
  );
}

export function FilmPicker({ value, onChange }: { value: FilmId; onChange: (f: FilmId) => void }) {
  return (
    <div className="film-grid" role="radiogroup" aria-label="膜材">
      {FILMS.map((f) => (
        <button
          key={f.id}
          role="radio"
          aria-checked={value === f.id}
          className={`film-btn ${value === f.id ? 'active' : ''}`}
          onClick={() => onChange(f.id)}
          title={f.name}
        >
          <span className="film-swatch" style={{ background: `linear-gradient(135deg, ${f.swatch.join(',')})` }} />
          <span>{f.name}</span>
        </button>
      ))}
    </div>
  );
}

interface Props {
  project: Project;
  layer: Layer | null;
  onLayer: (patch: Partial<Layer>, mergeKey?: string) => void;
  onOptions: (patch: Partial<ProjectOptions>, mergeKey?: string) => void;
  onProject: (patch: Partial<Project>, mergeKey?: string) => void;
  onAction: (a: 'up' | 'down' | 'duplicate' | 'delete' | 'center' | 'bw2alpha') => void;
  focusText: number;
  /** 正在編輯卡片背面（純印刷，不提供雷射底材） */
  backSide?: boolean;
}

export function Properties({ project, layer, onLayer, onOptions, onProject, onAction, focusText, backSide }: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusText && textRef.current) {
      textRef.current.focus();
      textRef.current.select();
    }
  }, [focusText]);
  const product = getProduct(project.productId);
  const o = project.options;

  if (!layer) {
    const isAcrylic = product.family === 'acrylic';
    return (
      <div className="props">
        <h3 className="props-title">作品設定</h3>
        <label className="field">
          <span className="field-label">名稱</span>
          <input className="input" value={project.name} onChange={(e) => onProject({ name: e.target.value }, 'name')} />
        </label>
        <div className="field-row">
          <span className="field-label">品項</span>
          <span>
            {product.name}　<span className="muted">{product.shape === 'circle' ? `⌀${project.width}mm` : `${project.width} × ${project.height} mm`}</span>
          </span>
        </div>
        {isAcrylic && (
          <div className="grid2">
            <Num label="畫布寬" unit="mm" value={project.width} min={15} max={300} step={1} digits={0} onChange={(v) => onProject({ width: v }, 'w')} />
            <Num label="畫布高" unit="mm" value={project.height} min={15} max={300} step={1} digits={0} onChange={(v) => onProject({ height: v }, 'h')} />
          </div>
        )}
        {!isAcrylic && (
          <div className="grid2">
            <Num label="出血" unit="mm" value={o.bleed} min={0} max={10} step={0.5} onChange={(v) => onOptions({ bleed: v }, 'bleed')} />
            <Num label="安全區" unit="mm" value={o.safe} min={0} max={15} step={0.5} onChange={(v) => onOptions({ safe: v }, 'safe')} />
          </div>
        )}
        {!isAcrylic && (
          <div className="field">
            <span className="field-label">底色</span>
            <div className="row gap">
              <input type="color" value={o.background ?? '#ffffff'} onChange={(e) => onOptions({ background: e.target.value }, 'bg')} />
              <button className={`chip ${o.background === null ? 'active' : ''}`} onClick={() => onOptions({ background: null })}>
                透明
              </button>
              <button className={`chip ${o.background === '#ffffff' ? 'active' : ''}`} onClick={() => onOptions({ background: '#ffffff' })}>
                白色
              </button>
            </div>
          </div>
        )}
        {backSide && <p className="props-hint">背面：一般紙張純印刷（不含雷射、白墨）。上傳背面圖後拉滿整張卡即可。</p>}
        {product.family === 'paper' && (
          <>
            <h4 className="props-sub">表面覆膜</h4>
            <div className="seg" role="radiogroup" aria-label="表面覆膜">
              <button className={(o.lamination ?? 'gloss') !== 'matte' ? 'active' : ''} onClick={() => onOptions({ lamination: 'gloss' })}>
                亮膜
              </button>
              <button className={o.lamination === 'matte' ? 'active' : ''} onClick={() => onOptions({ lamination: 'matte' })}>
                霧膜
              </button>
            </div>
            <p className="props-hint">
              {backSide
                ? '背面可以另外選。亮膜有反光帶，霧膜則把閃光壓成柔和的霧面。'
                : '亮膜會有一道清楚的反光帶掃過；霧膜沒有銳利高光，雷射和燙金的閃光會被壓柔。'}
            </p>
          </>
        )}
        {!isAcrylic && !backSide && (
          <>
            <h4 className="props-sub">底材</h4>
            <div className="seg">
              <button className={!o.substrate ? 'active' : ''} onClick={() => onOptions({ substrate: null, background: o.background ?? '#ffffff' })}>
                一般紙張
              </button>
              <button className={o.substrate ? 'active' : ''} onClick={() => onOptions({ substrate: 'holo', background: null })}>
                雷射卡底材
              </button>
            </div>
            {o.substrate && (
              <>
                <FilmPicker value={o.substrate} onChange={(f) => onOptions({ substrate: f })} />
                <label className="field">
                  <span className="field-label">
                    印刷透光 <b>{Math.round((o.inkClarity ?? 0.6) * 100)}%</b>
                  </span>
                  <input type="range" min={0} max={1} step={0.05} value={o.inkClarity ?? 0.6} onChange={(e) => onOptions({ inkClarity: +e.target.value }, 'ink')} />
                </label>
                <p className="muted xsmall">整張卡印在雷射膜上。白墨圖層下方的印刷不透光；沒有白墨的地方會透出雷射，顏色被圖案染色。</p>
              </>
            )}
          </>
        )}
        {isAcrylic && (
          <>
            <h4 className="props-sub">壓克力</h4>
            <label className="field">
              <span className="field-label">
                外框外擴 <b>{o.outlineOffset.toFixed(1)} mm</b>
              </span>
              <input type="range" min={0.5} max={6} step={0.1} value={o.outlineOffset} onChange={(e) => onOptions({ outlineOffset: +e.target.value }, 'offset')} />
            </label>
            {project.productId === 'acrylic-charm' && (
              <label className="field">
                <span className="field-label">
                  掛孔直徑 <b>{o.holeDiameter.toFixed(1)} mm</b>
                </span>
                <input type="range" min={2} max={6} step={0.5} value={o.holeDiameter} onChange={(e) => onOptions({ holeDiameter: +e.target.value }, 'hole')} />
              </label>
            )}
            {project.productId === 'acrylic-stand' && (
              <div className="grid2">
                <Num label="底座寬" unit="mm" value={o.baseWidth} min={20} max={200} step={1} digits={0} onChange={(v) => onOptions({ baseWidth: v }, 'bw')} />
                <Num label="底座深" unit="mm" value={o.baseDepth} min={10} max={100} step={1} digits={0} onChange={(v) => onOptions({ baseDepth: v }, 'bd')} />
              </div>
            )}
            <Num label="板厚" unit="mm" value={o.thickness} min={1} max={10} step={0.5} onChange={(v) => onOptions({ thickness: v }, 'th')} />
            <p className="muted xsmall">外框會依圖稿（印刷＋白墨＋燙金）的輪廓自動往外擴。白墨放在彩色圖案下面，3D 預覽才會不透光。</p>
          </>
        )}
        <p className="hint">點畫布上的圖案可以選取；從左側工具列加入圖片、文字或圖形。</p>
      </div>
    );
  }

  const key = (k: string) => `${layer.id}:${k}`;
  return (
    <div className="props">
      <div className="props-head">
        <h3 className="props-title">{layer.type === 'image' ? '圖片' : layer.type === 'text' ? '文字' : '圖形'}</h3>
        <div className="row">
          <button className="icon-btn sm" title="上移一層" onClick={() => onAction('up')}>
            <Icon name="up" size={15} />
          </button>
          <button className="icon-btn sm" title="下移一層" onClick={() => onAction('down')}>
            <Icon name="down" size={15} />
          </button>
          <button className="icon-btn sm" title="複製（Ctrl+D）" onClick={() => onAction('duplicate')}>
            <Icon name="copy" size={15} />
          </button>
          <button className="icon-btn sm danger" title="刪除（Delete）" onClick={() => onAction('delete')}>
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field-label">工藝</span>
        <select className="input" value={layer.process} onChange={(e) => onLayer({ process: e.target.value as Process })}>
          {(['print', 'foil', 'white', 'cut'] as Process[]).map((p) => (
            <option key={p} value={p}>
              {PROCESS_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      {layer.process === 'foil' && (
        <div className="field">
          <span className="field-label">膜材</span>
          <FilmPicker value={layer.film} onChange={(film) => onLayer({ film })} />
        </div>
      )}

      {layer.type === 'text' && (
        <>
          <label className="field">
            <span className="field-label">內容</span>
            <textarea ref={textRef} className="input" rows={2} value={layer.text} onChange={(e) => onLayer({ text: e.target.value }, key('text'))} />
          </label>
          <label className="field">
            <span className="field-label">字型</span>
            <select className="input" value={layer.fontFamily} onChange={(e) => onLayer({ fontFamily: e.target.value })}>
              {FONT_CHOICES.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid2">
            <Num label="字級" unit="pt" value={layer.fontSize / PT} min={4} max={400} step={1} digits={0} onChange={(v) => onLayer({ fontSize: v * PT }, key('fs'))} />
            <label className="field">
              <span className="field-label">粗細</span>
              <select className="input" value={layer.fontWeight} onChange={(e) => onLayer({ fontWeight: +e.target.value })}>
                <option value={300}>細</option>
                <option value={400}>標準</option>
                <option value={500}>中</option>
                <option value={700}>粗</option>
                <option value={900}>特粗</option>
              </select>
            </label>
          </div>
          <div className="grid2">
            <Color label="顏色" value={layer.fill} onChange={(v) => onLayer({ fill: v }, key('fill'))} />
            <div className="field">
              <span className="field-label">對齊</span>
              <div className="seg">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button key={a} className={layer.align === a ? 'active' : ''} onClick={() => onLayer({ align: a })}>
                    {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {layer.type === 'shape' && (
        <>
          <div className="grid2">
            <Color label="填色" value={layer.fill} onChange={(v) => onLayer({ fill: v }, key('fill'))} />
            <Color label="外框色" value={layer.stroke} onChange={(v) => onLayer({ stroke: v, strokeWidth: layer.strokeWidth || 0.5 }, key('stroke'))} />
          </div>
          <div className="grid2">
            <Num label="外框粗" unit="mm" value={layer.strokeWidth} min={0} max={20} step={0.1} onChange={(v) => onLayer({ strokeWidth: v }, key('sw'))} />
            {layer.shape === 'rect' && <Num label="圓角" unit="mm" value={layer.cornerRadius} min={0} max={100} step={0.5} onChange={(v) => onLayer({ cornerRadius: v }, key('cr'))} />}
          </div>
          <div className="row gap">
            <button className="chip" onClick={() => onLayer({ fill: 'transparent' })}>
              無填色
            </button>
            <button className="chip" onClick={() => onLayer({ stroke: 'transparent', strokeWidth: 0 })}>
              無外框
            </button>
          </div>
        </>
      )}

      {layer.type === 'image' && layer.process === 'white' && (
        <div className="field">
          <button className="btn block" onClick={() => onAction('bw2alpha')}>
            把黑白遮罩轉成白墨（黑＝有白墨）
          </button>
          <span className="muted xsmall">放進白墨的是黑白圖時按這個：黑色變成白墨，白色變成透明。</span>
        </div>
      )}

      <h4 className="props-sub">位置與大小</h4>
      <div className="grid2">
        <Num label="X" unit="mm" value={layer.x} step={0.5} onChange={(v) => onLayer({ x: v }, key('x'))} />
        <Num label="Y" unit="mm" value={layer.y} step={0.5} onChange={(v) => onLayer({ y: v }, key('y'))} />
        <Num label="寬" unit="mm" value={layer.width} min={1} step={0.5} onChange={(v) => onLayer(layer.type === 'text' ? {} : { width: v }, key('w'))} />
        <Num label="高" unit="mm" value={layer.height} min={1} step={0.5} onChange={(v) => onLayer(layer.type === 'text' ? {} : { height: v }, key('h'))} />
        <Num label="旋轉" unit="°" value={layer.rotation} step={1} digits={0} onChange={(v) => onLayer({ rotation: v }, key('r'))} />
        <label className="field">
          <span className="field-label">不透明度 {Math.round(layer.opacity * 100)}%</span>
          <input type="range" min={0} max={1} step={0.01} value={layer.opacity} onChange={(e) => onLayer({ opacity: +e.target.value }, key('op'))} />
        </label>
      </div>
      <button className="btn block" onClick={() => onAction('center')}>
        水平置中到成品
      </button>
    </div>
  );
}
