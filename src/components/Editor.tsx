import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from '../lib/history';
import type { AcrylicOutline } from '../lib/outline';
import { getProduct } from '../lib/products';
import { cloneLayer, fitText, hasBackSide, makeImage, makeShape, makeText, swapSides } from '../lib/project';
import { blackWhiteToAlpha, computeAcrylicOutline, loadImage } from '../lib/render';
import { navigate } from '../lib/router';
import { loadProject, saveProject } from '../lib/storage';
import { makeThumbnail } from '../lib/thumbnail';
import type { Layer, Process, Project, ProjectOptions, ShapeKind } from '../lib/types';
import { CanvasView, type CanvasHandle } from './CanvasView';
import { ExportDialog } from './ExportDialog';
import { Icon } from './Icon';
import { LayersPanel } from './LayersPanel';
import { Preview3D } from './Preview3D';
import { Properties } from './Properties';

/** 讀圖並縮到合理大小（長邊最多 3000px），保留透明度 */
async function readImageFile(file: File): Promise<{ src: string; w: number; h: number }> {
  const url = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  const img = await loadImage(url);
  const max = 3000;
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (s >= 1 || file.type === 'image/svg+xml') return { src: url, w: img.naturalWidth || 1000, h: img.naturalHeight || 1000 };
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { src: c.toDataURL('image/png'), w: c.width, h: c.height };
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function useIsMobile() {
  const q = '(max-width: 760px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

export default function Editor({ projectId }: { projectId: string }) {
  const isMobile = useIsMobile();
  const hist = useHistory<Project | null>(null);
  const doc = hist.present;
  /** 卡片正反面：背面模式時，編輯器看到的是把背面換到前面的專案 */
  const [side, setSide] = useState<'front' | 'back'>('front');
  const project = useMemo(() => (doc && side === 'back' ? swapSides(doc) : doc), [doc, side]);
  const [missing, setMissing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'idle'>('idle');
  const [outline, setOutline] = useState<AcrylicOutline | null>(null);
  const [show3D, setShow3D] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [shapeMenu, setShapeMenu] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'none' | 'layers' | 'props'>('none');
  const [focusText, setFocusText] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const loaded = useRef(false);

  useEffect(() => {
    loadProject(projectId).then((p) => {
      if (!p) setMissing(true);
      else {
        hist.reset(p);
        loaded.current = true;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // 自動儲存
  const thumbTimer = useRef<number>();
  useEffect(() => {
    if (!doc || !loaded.current) return;
    setSaveState('saving');
    const t = window.setTimeout(async () => {
      await saveProject({ ...doc, updatedAt: Date.now() });
      setSaveState('saved');
      window.clearTimeout(thumbTimer.current);
      thumbTimer.current = window.setTimeout(async () => {
        const thumbnail = await makeThumbnail(doc).catch(() => undefined);
        const latest = await loadProject(doc.id);
        if (latest && thumbnail) await saveProject({ ...latest, thumbnail });
      }, 1200);
    }, 450);
    return () => window.clearTimeout(t);
  }, [doc]);

  const product = project ? getProduct(project.productId) : null;
  const isAcrylic = product?.family === 'acrylic';

  // 壓克力外框（圖稿變動後重算）
  useEffect(() => {
    if (!doc || !isAcrylic) {
      setOutline(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      computeAcrylicOutline(doc).then((o) => alive && setOutline(o));
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [doc, isAcrylic]);

  const update = useCallback(
    (fn: (p: Project) => Project, mergeKey?: string) =>
      hist.set((p) => (p ? (side === 'back' ? swapSides(fn(swapSides(p))) : fn(p)) : p), mergeKey),
    [hist, side],
  );

  const updateLayer = useCallback(
    (id: string, patch: Partial<Layer>, mergeKey?: string) =>
      update(
        (p) => ({
          ...p,
          layers: p.layers.map((l) => {
            if (l.id !== id) return l;
            let n = { ...l, ...patch } as Layer;
            if (n.type === 'text' && ('text' in patch || 'fontSize' in patch || 'fontFamily' in patch || 'fontWeight' in patch)) {
              const before = l.type === 'text' ? l : null;
              n = fitText(n);
              // 名稱還是預設或跟著內容時，自動用文字內容當圖層名稱
              if (before && 'text' in patch && (before.name === '文字' || before.name === before.text.slice(0, 16))) n.name = n.text.slice(0, 16) || '文字';
              // 置中文字改字後維持中心點
              if (before && n.align === 'center' && !('x' in patch)) n.x = before.x + (before.width - n.width) / 2;
            }
            return n;
          }),
        }),
        mergeKey,
      ),
    [update],
  );

  const addLayer = useCallback(
    (l: Layer) => {
      update((p) => ({ ...p, layers: [...p.layers, l] }));
      setSelectedId(l.id);
    },
    [update],
  );

  const removeLayer = useCallback(
    (id: string) => {
      update((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== id) }));
      setSelectedId(null);
    },
    [update],
  );

  const moveInGroup = useCallback(
    (id: string, dir: 1 | -1) =>
      update((p) => {
        const arr = [...p.layers];
        const i = arr.findIndex((l) => l.id === id);
        if (i < 0) return p;
        let j = i + dir;
        while (j >= 0 && j < arr.length && arr[j].process !== arr[i].process) j += dir;
        if (j < 0 || j >= arr.length) return p;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        return { ...p, layers: arr };
      }),
    [update],
  );

  /** 拖曳到某個工藝群組（beforeId = 面板上排在它前面＝圖層在它之上） */
  const moveTo = useCallback(
    (id: string, process: Process, beforeId: string | null) =>
      update((p) => {
        const l = p.layers.find((x) => x.id === id);
        if (!l || id === beforeId) return p;
        const rest = p.layers.filter((x) => x.id !== id);
        const moved = { ...l, process } as Layer;
        if (beforeId) {
          const idx = rest.findIndex((x) => x.id === beforeId);
          rest.splice(idx + 1, 0, moved);
        } else {
          // 放到該群組最上面
          let last = -1;
          rest.forEach((x, i) => x.process === process && (last = i));
          rest.splice(last >= 0 ? last + 1 : rest.length, 0, moved);
        }
        return { ...p, layers: rest };
      }),
    [update],
  );

  const center = project ? { x: project.width / 2, y: project.height / 2 } : { x: 0, y: 0 };

  const addText = () => {
    if (!project) return;
    const l = makeText('輸入文字', 0, center.y - 4, { fontSize: Math.max(4, project.width * 0.08) });
    l.x = center.x - l.width / 2;
    addLayer(l);
    setFocusText((n) => n + 1);
    setMobilePanel('props');
  };

  const addShape = (kind: ShapeKind) => {
    if (!project) return;
    const s = Math.min(project.width, project.height) * 0.35;
    addLayer(makeShape(kind, center.x - s / 2, center.y - s / 2, s, s, { fill: kind === 'star' ? '#ffc93c' : kind === 'heart' ? '#ff6b9a' : '#5b6cff' }));
    setShapeMenu(false);
  };

  const addImages = async (files: FileList | File[], at: { x: number; y: number } | null) => {
    if (!project) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      const { src, w, h } = await readImageFile(f);
      const maxW = project.width * 0.7, maxH = project.height * 0.7;
      const s = Math.min(maxW / w, maxH / h);
      const iw = w * s, ih = h * s;
      const cx = at?.x ?? center.x, cy = at?.y ?? center.y;
      addLayer(makeImage(src, cx - iw / 2, cy - ih / 2, iw, ih, { name: f.name.replace(/\.[^.]+$/, '').slice(0, 24) || '圖片' }));
    }
  };

  const selected = project?.layers.find((l) => l.id === selectedId) ?? null;

  const doAction = async (a: 'up' | 'down' | 'duplicate' | 'delete' | 'center' | 'bw2alpha') => {
    if (!selected || !project) return;
    if (a === 'up') moveInGroup(selected.id, 1);
    if (a === 'down') moveInGroup(selected.id, -1);
    if (a === 'delete') removeLayer(selected.id);
    if (a === 'duplicate') addLayer(cloneLayer(selected));
    if (a === 'center') updateLayer(selected.id, { x: (project.width - selected.width) / 2 });
    if (a === 'bw2alpha' && selected.type === 'image') {
      const src = await blackWhiteToAlpha(selected.src);
      updateLayer(selected.id, { src } as Partial<Layer>);
    }
  };

  // 快捷鍵
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') {
        if (show3D) setShow3D(false);
        else if (showExport) setShowExport(false);
        else setSelectedId(null);
        return;
      }
      if (isTyping(e)) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) hist.redo();
        else hist.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        hist.redo();
      } else if (mod && e.key.toLowerCase() === 'd' && selected) {
        e.preventDefault();
        addLayer(cloneLayer(selected));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        removeLayer(selected.id);
      } else if (selected && !selected.locked && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = e.shiftKey ? 5 : 0.5;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        updateLayer(selected.id, { x: selected.x + dx, y: selected.y + dy }, `${selected.id}:nudge`);
      } else if (!mod && e.key.toLowerCase() === 't') addText();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const onOptions = (patch: Partial<ProjectOptions>, mk?: string) => update((p) => ({ ...p, options: { ...p.options, ...patch } }), mk);
  const onProject = (patch: Partial<Project>, mk?: string) => update((p) => ({ ...p, ...patch }), mk);

  const panel = useMemo(
    () =>
      project && (
        <>
          <div className="panel-section layers-section">
            <div className="panel-title">
              <Icon name="layers" size={16} /> 圖層
              <span className="muted xsmall">拖曳到群組即可換工藝</span>
            </div>
            <LayersPanel
              project={project}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
              onToggle={(id, k) => {
                const l = project.layers.find((x) => x.id === id);
                if (l) updateLayer(id, { [k]: !l[k] } as Partial<Layer>);
              }}
              onMove={moveTo}
              onRename={(id, name) => updateLayer(id, { name })}
            />
          </div>
        </>
      ),
    [project, selectedId, updateLayer, moveTo],
  );

  if (missing)
    return (
      <div className="loading-screen">
        找不到這個作品。<button className="btn" onClick={() => navigate('/')}>回首頁</button>
      </div>
    );
  if (!project || !product) return <div className="loading-screen">載入中…</div>;

  const props = (
    <Properties
      project={project}
      layer={selected}
      onLayer={(patch, mk) => selected && updateLayer(selected.id, patch, mk)}
      onOptions={onOptions}
      onProject={onProject}
      onAction={doAction}
      focusText={focusText}
      backSide={side === 'back'}
    />
  );

  return (
    <div className={`editor mp-${mobilePanel}`}>
      <header className="topbar">
        <button className="btn ghost" onClick={() => navigate('/')}>
          <Icon name="back" size={16} /> <span className="hide-sm">首頁</span>
        </button>
        <span className="top-sep" />
        <div className="title-wrap">
          <span className="product-tag">{product.name}</span>
          {hasBackSide(project.productId) && (
            <div className="seg side-toggle" role="group" aria-label="正反面">
              <button className={side === 'front' ? 'active' : ''} onClick={() => { setSide('front'); setSelectedId(null); }}>正面</button>
              <button className={side === 'back' ? 'active' : ''} onClick={() => { setSide('back'); setSelectedId(null); }}>背面</button>
            </div>
          )}
          <input className="title-input" value={project.name} onChange={(e) => onProject({ name: e.target.value }, 'name')} aria-label="作品名稱" />
        </div>
        <span className={`save-state ${saveState}`}>{saveState === 'saving' ? '儲存中…' : saveState === 'saved' ? '已自動儲存' : ''}</span>
        <div className="top-actions">
          <button className="icon-btn" onClick={hist.undo} disabled={!hist.canUndo} title="復原（Ctrl+Z）">
            <Icon name="undo" />
          </button>
          <button className="icon-btn" onClick={hist.redo} disabled={!hist.canRedo} title="重做（Ctrl+Shift+Z）">
            <Icon name="redo" />
          </button>
          <button className="btn" onClick={() => setShow3D(true)}>
            <Icon name="cube" size={16} /> <span>3D 預覽</span>
          </button>
          <button className="btn primary" onClick={() => setShowExport(true)}>
            <Icon name="download" size={16} /> <span>匯出</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        <nav className="toolbar" aria-label="工具">
          <button className="tool" title="選取" onClick={() => setSelectedId(null)}>
            <Icon name="select" />
            <span>選取</span>
          </button>
          <button className="tool" title="加入圖片" onClick={() => fileInput.current?.click()}>
            <Icon name="image" />
            <span>圖片</span>
          </button>
          <button className="tool" title="加入文字（T）" onClick={addText}>
            <Icon name="text" />
            <span>文字</span>
          </button>
          <div className="tool-wrap">
            <button className={`tool ${shapeMenu ? 'active' : ''}`} title="加入圖形" onClick={() => setShapeMenu((v) => !v)}>
              <Icon name="shape" />
              <span>圖形</span>
            </button>
            {shapeMenu && (
              <div className="shape-menu">
                {(['rect', 'ellipse', 'star', 'heart'] as ShapeKind[]).map((k) => (
                  <button key={k} className="icon-btn" onClick={() => addShape(k)} title={{ rect: '矩形', ellipse: '圓形', star: '星形', heart: '愛心' }[k]}>
                    <Icon name={k} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="tool-sep" />
          <button className="tool" title="復原" onClick={hist.undo} disabled={!hist.canUndo}>
            <Icon name="undo" />
            <span>復原</span>
          </button>
          <button className="tool" title="重做" onClick={hist.redo} disabled={!hist.canRedo}>
            <Icon name="redo" />
            <span>重做</span>
          </button>
          <span className="tool-sep only-mobile" />
          <button className={`tool only-mobile ${mobilePanel === 'layers' ? 'active' : ''}`} onClick={() => setMobilePanel((m) => (m === 'layers' ? 'none' : 'layers'))}>
            <Icon name="layers" />
            <span>圖層</span>
          </button>
          <button className={`tool only-mobile ${mobilePanel === 'props' ? 'active' : ''}`} onClick={() => setMobilePanel((m) => (m === 'props' ? 'none' : 'props'))}>
            <Icon name="settings" />
            <span>屬性</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addImages(e.target.files, null);
              e.target.value = '';
            }}
          />
        </nav>

        <main className="canvas-area">
          <CanvasView
            ref={canvasRef}
            project={project}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setShapeMenu(false);
            }}
            onChange={(id, patch) => updateLayer(id, patch)}
            outline={outline}
            onDropFiles={(f, at) => addImages(f, at)}
            onEditText={(id) => {
              setSelectedId(id);
              setFocusText((n) => n + 1);
              setMobilePanel('props');
            }}
          />
        </main>

        {!isMobile && (
          <aside className="side">
            <div className="side-layers">{panel}</div>
            <div className="panel-section props-section">{props}</div>
          </aside>
        )}
        {isMobile && (
        <div className="sheet" aria-hidden={mobilePanel === 'none'}>
          <div className="sheet-head">
            <span>{mobilePanel === 'layers' ? '圖層' : '屬性'}</span>
            <button className="icon-btn" onClick={() => setMobilePanel('none')}>
              <Icon name="close" />
            </button>
          </div>
          <div className="sheet-body">{mobilePanel === 'layers' ? panel : mobilePanel === 'props' ? props : null}</div>
        </div>
        )}
      </div>

      {show3D && (
        <Preview3D project={doc!} outline={outline} onFilm={(id, film) => updateLayer(id, { film })} onSubstrate={(substrate) => onOptions({ substrate })} onClose={() => setShow3D(false)} />
      )}
      {showExport && (
        <ExportDialog
          project={doc!}
          outline={outline}
          onClose={() => setShowExport(false)}
          onOpen3D={() => {
            setShowExport(false);
            setShow3D(true);
          }}
        />
      )}
    </div>
  );
}
