import Konva from 'konva';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KImage, Layer as KLayer, Line, Rect, Shape, Stage, Text as KText, Transformer } from 'react-konva';
import { getFilm } from '../lib/films';
import { bleedRect, safeRect } from '../lib/geometry';
import type { AcrylicOutline } from '../lib/outline';
import { getProduct } from '../lib/products';
import { fitText } from '../lib/project';
import { designRegion, shapePath, TEXT_LINE_HEIGHT } from '../lib/render';
import type { Layer, Process, Project } from '../lib/types';
import { Icon } from './Icon';
import { useLayerImage } from './useImage';

export interface CanvasHandle {
  fit: () => void;
  zoomBy: (f: number) => void;
}

interface Props {
  project: Project;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<Layer>) => void;
  outline: AcrylicOutline | null;
  onDropFiles: (files: FileList, at: { x: number; y: number } | null) => void;
  onEditText: (id: string) => void;
}

const ACCENT = '#5b6cff';
const CUT = '#e0245e';
const BLEED = '#f05252';
const SAFE = '#2f9bf0';
const RENDER_ORDER: Process[] = ['white', 'print', 'foil', 'cut'];

function makeChecker(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#e9ebf0';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillRect(8, 8, 8, 8);
  return c;
}

function gradientProps(l: Layer, w: number, h: number) {
  if (l.process !== 'foil') return {};
  const f = getFilm(l.film);
  const stops: (number | string)[] = [];
  f.swatch.forEach((c, i) => stops.push(i / (f.swatch.length - 1), c));
  return {
    fillPriority: 'linear-gradient',
    fillLinearGradientStartPoint: { x: 0, y: 0 },
    fillLinearGradientEndPoint: { x: w, y: h },
    fillLinearGradientColorStops: stops,
  };
}

interface NodeProps {
  layer: Layer;
  scale: number;
  register: (id: string, n: Konva.Node | null) => void;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<Layer>) => void;
  onEditText: (id: string) => void;
}

function ImageNode({ layer, common }: { layer: Extract<Layer, { type: 'image' }>; common: Record<string, unknown> }) {
  const img = useLayerImage(layer.src, layer.process, layer.film);
  return <KImage {...common} image={img} width={layer.width} height={layer.height} />;
}

function LayerNode({ layer, scale, register, onSelect, onChange, onEditText }: NodeProps) {
  const isCut = layer.process === 'cut';
  const common = {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    rotation: layer.rotation,
    opacity: isCut && layer.type !== 'shape' ? 0.45 : layer.opacity,
    visible: layer.visible,
    draggable: !layer.locked,
    listening: !layer.locked,
    ref: (n: Konva.Node | null) => register(layer.id, n),
    onMouseDown: () => onSelect(layer.id),
    onTap: () => onSelect(layer.id),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onChange(layer.id, { x: e.target.x(), y: e.target.y() }),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const n = e.target;
      const sx = n.scaleX(), sy = n.scaleY();
      n.scaleX(1);
      n.scaleY(1);
      const base = { x: n.x(), y: n.y(), rotation: n.rotation() };
      if (layer.type === 'text') {
        const t = fitText({ ...layer, ...base, fontSize: Math.max(1, layer.fontSize * sy) });
        onChange(layer.id, { ...base, fontSize: t.fontSize, width: t.width, height: t.height });
      } else {
        onChange(layer.id, { ...base, width: Math.max(1, layer.width * sx), height: Math.max(1, layer.height * sy) });
      }
    },
  };
  if (layer.type === 'image') return <ImageNode layer={layer} common={common} />;
  if (layer.type === 'text') {
    return (
      <KText
        {...common}
        {...gradientProps(layer, layer.width, layer.height)}
        onDblClick={() => onEditText(layer.id)}
        onDblTap={() => onEditText(layer.id)}
        text={layer.text}
        fontSize={layer.fontSize}
        fontFamily={layer.fontFamily}
        fontStyle={String(layer.fontWeight)}
        fill={layer.process === 'white' ? '#ffffff' : layer.fill}
        align={layer.align}
        lineHeight={TEXT_LINE_HEIGHT}
        wrap="none"
        shadowColor={layer.process === 'white' ? '#9aa3b5' : undefined}
        shadowBlur={layer.process === 'white' ? 2 / scale : 0}
      />
    );
  }
  const hasFill = !isCut && layer.fill && layer.fill !== 'transparent';
  return (
    <Shape
      {...common}
      {...(hasFill ? gradientProps(layer, layer.width, layer.height) : {})}
      width={layer.width}
      height={layer.height}
      fill={hasFill ? (layer.process === 'white' ? '#ffffff' : layer.fill) : undefined}
      fillEnabled={!!hasFill}
      stroke={isCut ? CUT : layer.process === 'foil' ? getFilm(layer.film).swatch[1] : layer.stroke}
      strokeWidth={isCut ? 1.6 / scale : layer.strokeWidth}
      strokeEnabled={isCut || (layer.strokeWidth > 0 && layer.stroke !== 'transparent')}
      dash={isCut ? [6 / scale, 4 / scale] : undefined}
      hitStrokeWidth={isCut ? 10 / scale : 'auto'}
      sceneFunc={(ctx, shape) => {
        ctx.beginPath();
        shapePath(ctx as unknown as CanvasRenderingContext2D, layer.shape, layer.width, layer.height, layer.cornerRadius);
        ctx.fillStrokeShape(shape);
      }}
    />
  );
}

export const CanvasView = forwardRef<CanvasHandle, Props>(function CanvasView(
  { project, selectedId, onSelect, onChange, outline, onDropFiles, onEditText },
  ref,
) {
  const wrap = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodes = useRef(new Map<string, Konva.Node>());
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ scale: 4, x: 0, y: 0 });
  const [showGuides, setShowGuides] = useState(true);
  const checker = useMemo(makeChecker, []);
  const product = getProduct(project.productId);
  const isAcrylic = product.family === 'acrylic';
  const region = designRegion(project);
  const W = project.width, H = project.height, o = project.options;
  const fittedFor = useRef('');

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const vis = isAcrylic
      ? { x: -6, y: -6, width: W + 12, height: H + 12 + (project.productId === 'acrylic-stand' ? o.baseDepth + 16 : 0) }
      : bleedRect(W, H, o.bleed);
    const padX = size.w < 600 ? 24 : 80, padY = size.w < 600 ? 70 : 140;
    const s = Math.max(0.5, Math.min((size.w - padX) / vis.width, (size.h - padY) / vis.height));
    setView({ scale: s, x: size.w / 2 - (vis.x + vis.width / 2) * s, y: (size.h - (size.w < 600 ? 30 : 50)) / 2 - (vis.y + vis.height / 2) * s });
  }, [W, H, o.bleed, o.baseDepth, size.w, size.h, isAcrylic, project.productId]);

  useEffect(() => {
    const key = `${project.id}:${size.w}x${size.h}`;
    if (size.w > 10 && fittedFor.current !== key) {
      fittedFor.current = key;
      fit();
    }
  }, [project.id, size.w, size.h, fit]);

  const zoomAt = useCallback((factor: number, cx = size.w / 2, cy = size.h / 2) => {
    setView((v) => {
      const s = Math.max(0.3, Math.min(80, v.scale * factor));
      const k = s / v.scale;
      return { scale: s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, [size.w, size.h]);

  useImperativeHandle(ref, () => ({ fit, zoomBy: (f: number) => zoomAt(f) }), [fit, zoomAt]);

  // 變形工具附著到選取的圖層
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const layer = project.layers.find((l) => l.id === selectedId);
    const n = selectedId ? nodes.current.get(selectedId) : undefined;
    if (n && layer && !layer.locked && layer.visible) {
      tr.nodes([n]);
      tr.keepRatio(layer.type !== 'shape');
      tr.enabledAnchors(
        layer.type === 'text'
          ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
          : ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'],
      );
    } else tr.nodes([]);
    tr.getLayer()?.batchDraw();
  }, [selectedId, project.layers]);

  const register = useCallback((id: string, n: Konva.Node | null) => {
    if (n) nodes.current.set(id, n);
    else nodes.current.delete(id);
  }, []);

  const s = view.scale;
  const bleedR = bleedRect(W, H, o.bleed);
  const safeR = safeRect(W, H, o.safe);
  const circle = product.shape === 'circle';
  const corner = product.cornerRadius;

  const sorted = useMemo(
    () => RENDER_ORDER.flatMap((p) => project.layers.filter((l) => l.process === p)),
    [project.layers],
  );

  // 觸控雙指縮放
  const pinch = useRef<{ d: number; cx: number; cy: number } | null>(null);
  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length !== 2) return;
    e.evt.preventDefault();
    const rect = wrap.current!.getBoundingClientRect();
    const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const cx = (t[0].clientX + t[1].clientX) / 2 - rect.left;
    const cy = (t[0].clientY + t[1].clientY) / 2 - rect.top;
    const st = stageRef.current!;
    if (st.isDragging()) st.stopDrag();
    if (pinch.current) {
      const f = d / pinch.current.d;
      const dx = cx - pinch.current.cx, dy = cy - pinch.current.cy;
      setView((v) => {
        const ns = Math.max(0.3, Math.min(80, v.scale * f));
        const k = ns / v.scale;
        return { scale: ns, x: cx - (cx - v.x) * k + dx, y: cy - (cy - v.y) * k + dy };
      });
    }
    pinch.current = { d, cx, cy };
  };

  const trimPath = (ctx: Konva.Context | CanvasRenderingContext2D) => {
    const c = ctx as unknown as CanvasRenderingContext2D;
    if (circle) c.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
    else shapePath(c, 'rect', W, H, corner);
  };

  return (
    <div
      className="canvas-wrap"
      ref={wrap}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!e.dataTransfer.files.length) return;
        const r = wrap.current!.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        onDropFiles(e.dataTransfer.files, { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale });
      }}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        x={view.x}
        y={view.y}
        scaleX={s}
        scaleY={s}
        draggable
        onDragEnd={(e) => {
          if (e.target === stageRef.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
        }}
        onWheel={(e) => {
          e.evt.preventDefault();
          const st = stageRef.current!;
          const p = st.getPointerPosition() ?? { x: size.w / 2, y: size.h / 2 };
          if (e.evt.ctrlKey || e.evt.metaKey) zoomAt(Math.exp(-e.evt.deltaY * 0.0025), p.x, p.y);
          else setView((v) => ({ ...v, x: v.x - e.evt.deltaX, y: v.y - e.evt.deltaY }));
        }}
        onTouchMove={onTouchMove}
        onTouchEnd={() => (pinch.current = null)}
        onMouseDown={(e) => {
          if (e.target === stageRef.current || e.target.name() === 'bg') onSelect(null);
        }}
        onTap={(e) => {
          if (e.target === stageRef.current || e.target.name() === 'bg') onSelect(null);
        }}
      >
        {/* 底：紙張 / 透明棋盤 */}
        <KLayer>
          {isAcrylic ? (
            <>
              <Rect name="bg" x={region.x} y={region.y} width={region.width} height={region.height} fill="rgba(0,0,0,0)" />
              <Rect name="bg" x={0} y={0} width={W} height={H} fillPatternImage={checker as unknown as HTMLImageElement} fillPatternScale={{ x: 1 / s, y: 1 / s }} shadowColor="#1b2240" shadowOpacity={0.08} shadowBlur={18} shadowOffsetY={4} />
              {outline && outline.polygon.length > 0 && (
                <Line
                  name="bg"
                  points={outline.polygon.flatMap((p) => [p.x, p.y])}
                  closed
                  fill="rgba(214,236,255,0.55)"
                  stroke="rgba(120,160,200,0.35)"
                  strokeWidth={1 / s}
                />
              )}
            </>
          ) : (
            <>
              <Shape
                name="bg"
                sceneFunc={(ctx, shape) => {
                  ctx.beginPath();
                  if (circle) ctx.ellipse(W / 2, H / 2, W / 2 + o.bleed, H / 2 + o.bleed, 0, 0, Math.PI * 2);
                  else ctx.rect(bleedR.x, bleedR.y, bleedR.width, bleedR.height);
                  ctx.fillStrokeShape(shape);
                }}
                fill={o.background ?? undefined}
                fillPatternImage={o.background || o.substrate ? undefined : (checker as unknown as HTMLImageElement)}
                {...(o.substrate
                  ? (() => {
                      const f = getFilm(o.substrate);
                      const stops: (number | string)[] = [];
                      f.swatch.forEach((c, i) => stops.push(i / (f.swatch.length - 1), c));
                      return {
                        fillPriority: 'linear-gradient',
                        fillLinearGradientStartPoint: { x: bleedR.x, y: bleedR.y },
                        fillLinearGradientEndPoint: { x: bleedR.x + bleedR.width, y: bleedR.y + bleedR.height },
                        fillLinearGradientColorStops: stops,
                      };
                    })()
                  : {})}
                fillPatternScale={{ x: 1 / s, y: 1 / s }}
                shadowColor="#1b2240"
                shadowOpacity={0.12}
                shadowBlur={24}
                shadowOffsetY={6}
              />
            </>
          )}
        </KLayer>

        {/* 圖稿 */}
        <KLayer>
          <Group
            clipFunc={
              isAcrylic
                ? undefined
                : (ctx) => {
                    if (circle) ctx.ellipse(W / 2, H / 2, W / 2 + o.bleed, H / 2 + o.bleed, 0, 0, Math.PI * 2);
                    else ctx.rect(bleedR.x, bleedR.y, bleedR.width, bleedR.height);
                  }
            }
          >
            {sorted.map((l) => (
              <LayerNode key={l.id} layer={l} scale={s} register={register} onSelect={onSelect} onChange={onChange} onEditText={onEditText} />
            ))}
          </Group>
          <Transformer
            ref={trRef}
            rotateEnabled
            borderStroke={ACCENT}
            anchorStroke={ACCENT}
            anchorFill="#fff"
            anchorSize={9}
            anchorCornerRadius={3}
            rotateAnchorOffset={22}
            padding={2}
            ignoreStroke
            boundBoxFunc={(oldB, newB) => (Math.abs(newB.width) < 4 || Math.abs(newB.height) < 4 ? oldB : newB)}
          />
        </KLayer>

        {/* 參考線 */}
        <KLayer listening={false} visible={showGuides}>
          {!isAcrylic && (
            <>
              {/* 出血區淡化 */}
              <Shape
                sceneFunc={(ctx) => {
                  const c = ctx._context;
                  c.beginPath();
                  if (circle) c.ellipse(W / 2, H / 2, W / 2 + o.bleed, H / 2 + o.bleed, 0, 0, Math.PI * 2);
                  else c.rect(bleedR.x, bleedR.y, bleedR.width, bleedR.height);
                  trimPath(c);
                  c.fillStyle = 'rgba(255,255,255,0.42)';
                  c.fill('evenodd');
                }}
              />
              {o.bleed > 0 &&
                (circle ? (
                  <Circle x={W / 2} y={H / 2} radius={W / 2 + o.bleed} stroke={BLEED} strokeWidth={1 / s} dash={[5 / s, 4 / s]} />
                ) : (
                  <Rect {...bleedR} stroke={BLEED} strokeWidth={1 / s} dash={[5 / s, 4 / s]} />
                ))}
              <Shape
                sceneFunc={(ctx, shape) => {
                  ctx.beginPath();
                  trimPath(ctx);
                  ctx.strokeShape(shape);
                }}
                stroke="#1f2430"
                strokeWidth={1.2 / s}
              />
              {o.safe > 0 &&
                (circle ? (
                  <Circle x={W / 2} y={H / 2} radius={Math.max(1, W / 2 - o.safe)} stroke={SAFE} strokeWidth={1 / s} dash={[3 / s, 3 / s]} />
                ) : (
                  <Rect {...safeR} cornerRadius={Math.max(0, corner - o.safe)} stroke={SAFE} strokeWidth={1 / s} dash={[3 / s, 3 / s]} />
                ))}
              <KText x={bleedR.x} y={bleedR.y - 14 / s} text={`出血 ${o.bleed}mm`} fontSize={10 / s} fill={BLEED} />
              <KText x={safeR.x + 3 / s} y={safeR.y + 3 / s} text={`安全區 ${o.safe}mm`} fontSize={10 / s} fill={SAFE} />
              <KText
                x={0}
                y={bleedR.y + bleedR.height + 6 / s}
                width={W}
                align="center"
                text={circle ? `⌀ ${W} mm` : `${W} × ${H} mm`}
                fontSize={11 / s}
                fill="#6b7280"
              />
            </>
          )}
          {isAcrylic && (
            <>
              <Rect x={0} y={0} width={W} height={H} stroke="#9aa1ad" strokeWidth={1 / s} dash={[4 / s, 4 / s]} />
              <KText x={0} y={-14 / s} text={`畫布 ${W} × ${H} mm`} fontSize={10 / s} fill="#6b7280" />
              {outline && outline.polygon.length > 0 && (
                <Line points={outline.polygon.flatMap((p) => [p.x, p.y])} closed stroke={CUT} strokeWidth={1.6 / s} />
              )}
              {outline?.hole && <Circle x={outline.hole.x} y={outline.hole.y} radius={outline.hole.r} stroke={CUT} strokeWidth={1.6 / s} fill="#eef0f4" />}
              {outline?.tab && (() => {
                const t = outline.tab;
                const cx = t.x + t.width / 2;
                const by = t.y + t.height + 8;
                return (
                  <>
                    <Rect x={cx - o.baseWidth / 2} y={by} width={o.baseWidth} height={o.baseDepth} cornerRadius={4} fill="rgba(214,236,255,0.55)" stroke={CUT} strokeWidth={1.6 / s} />
                    <Rect x={cx - t.width / 2 - 0.1} y={by + o.baseDepth / 2 - o.thickness / 2} width={t.width + 0.2} height={o.thickness} stroke={CUT} strokeWidth={1.2 / s} />
                    <KText x={cx - o.baseWidth / 2} y={by + o.baseDepth + 4 / s} width={o.baseWidth} align="center" text={`底座 ${o.baseWidth} × ${o.baseDepth} mm`} fontSize={10 / s} fill="#6b7280" />
                  </>
                );
              })()}
              {outline && outline.polygon.length === 0 && (
                <KText x={0} y={H / 2 - 4} width={W} align="center" text="放入圖片後會自動產生外框" fontSize={12 / s} fill="#9aa1ad" />
              )}
            </>
          )}
        </KLayer>
      </Stage>

      <div className="canvas-bar">
        <button className="icon-btn sm" onClick={() => zoomAt(1 / 1.25)} title="縮小">
          <Icon name="minus" size={15} />
        </button>
        <span className="zoom-label">{Math.round((s / 3.78) * 100)}%</span>
        <button className="icon-btn sm" onClick={() => zoomAt(1.25)} title="放大">
          <Icon name="plus" size={15} />
        </button>
        <button className="icon-btn sm" onClick={fit} title="符合畫面">
          <Icon name="fit" size={15} />
        </button>
        <span className="bar-sep" />
        <span className="bar-text">{circle ? `⌀${W}mm` : `${W}×${H}mm`}</span>
        <span className="bar-sep" />
        <label className="bar-toggle">
          <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} /> 參考線
        </label>
      </div>
    </div>
  );
});
