import { useEffect, useRef, useState } from 'react';
import { downloadBlob, safeFileName } from '../lib/download';
import { getFilm } from '../lib/films';
import type { AcrylicOutline } from '../lib/outline';
import type { FilmId, Project } from '../lib/types';
import { ProductViewer, type LightState, type VideoMotion } from '../three/viewer';
import { Icon } from './Icon';
import { FilmPicker } from './Properties';

interface Props {
  project: Project;
  outline: AcrylicOutline | null;
  onFilm: (layerId: string, film: FilmId) => void;
  onSubstrate: (film: FilmId) => void;
  onClose: () => void;
}

type DOE = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

export function Preview3D({ project, outline, onFilm, onSubstrate, onClose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ProductViewer | null>(null);
  const [light, setLight] = useState<LightState>({ az: -35, el: 32 });
  const [intensity, setIntensity] = useState(1);
  const [auto, setAuto] = useState(false);
  const [gyro, setGyro] = useState<'off' | 'on' | 'denied'>('off');
  const [rec, setRec] = useState<null | number>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [motion, setMotion] = useState<VideoMotion>('tilt');
  const [portrait, setPortrait] = useState(true);
  const [clean, setClean] = useState(true);
  const foils = project.layers.filter((l) => l.process === 'foil' && l.visible);
  const [filmTarget, setFilmTarget] = useState<'all' | string>('all');
  const hasGyro = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  useEffect(() => {
    let v: ProductViewer;
    try {
      v = new ProductViewer(host.current!);
    } catch {
      setError('這個瀏覽器無法啟動 3D（WebGL）。');
      return;
    }
    viewer.current = v;
    v.onLightChange = (l) => setLight({ ...l });
    (window as unknown as { __viewer?: ProductViewer }).__viewer = v;
    return () => {
      v.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    let alive = true;
    const t = setTimeout(() => {
      v.setProject(project, outline).then(() => alive && setReady(true));
    }, 60);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [project, outline]);

  useEffect(() => {
    viewer.current?.setIntensity(intensity);
  }, [intensity]);
  useEffect(() => {
    if (viewer.current) viewer.current.autoRotate = auto;
  }, [auto]);

  const moveLight = (l: LightState) => {
    setLight(l);
    viewer.current?.setLight(l);
  };

  // 陀螺儀
  useEffect(() => {
    if (gyro !== 'on') return;
    const on = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0, gamma = e.gamma ?? 0;
      const x = Math.max(-0.6, Math.min(0.6, ((beta - 40) / 60) * 0.6));
      const y = Math.max(-0.7, Math.min(0.7, (gamma / 50) * 0.7));
      viewer.current?.setTilt(x, y);
    };
    window.addEventListener('deviceorientation', on);
    return () => {
      window.removeEventListener('deviceorientation', on);
      viewer.current?.stopTilt();
    };
  }, [gyro]);

  const enableGyro = async () => {
    if (gyro === 'on') {
      setGyro('off');
      return;
    }
    const D = DeviceOrientationEvent as DOE;
    try {
      if (typeof D.requestPermission === 'function') {
        const r = await D.requestPermission();
        setGyro(r === 'granted' ? 'on' : 'denied');
      } else setGyro('on');
    } catch {
      setGyro('denied');
    }
  };

  const record = async () => {
    const v = viewer.current;
    if (!v || rec !== null) return;
    const secs = 6;
    setRec(secs);
    const iv = setInterval(() => setRec((r) => (r !== null && r > 1 ? r - 1 : r)), 1000);
    try {
      const { blob, ext } = await v.record({ seconds: secs, motion, clean, width: 1080, height: portrait ? 1350 : 1080 });
      downloadBlob(blob, `${safeFileName(project.name)}-3D預覽.${ext}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearInterval(iv);
      setRec(null);
    }
  };

  // 光源盤：把 az/el 對應到圓盤
  const pad = useRef<HTMLDivElement>(null);
  const padDrag = (e: React.PointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    let u = ((e.clientX - r.left) / r.width) * 2 - 1;
    let w = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const len = Math.hypot(u, w);
    if (len > 1) {
      u /= len;
      w /= len;
    }
    moveLight({ az: u * 80, el: w * 75 });
  };
  const dot = { left: `${50 + (light.az / 80) * 50}%`, top: `${50 - (light.el / 75) * 50}%` };

  const currentFilm: FilmId = (filmTarget === 'all' ? foils[0]?.film : foils.find((f) => f.id === filmTarget)?.film) ?? 'gold';

  return (
    <div className="preview3d" role="dialog" aria-label="3D 預覽">
      <div className="p3-stage" ref={host}>
        {!ready && !error && <div className="p3-loading">正在產生 3D…</div>}
        {error && <div className="p3-loading error">{error}</div>}
        <div className="p3-hint">拖曳旋轉・滾輪縮放・拖曳<span className="sun-dot" />光球改變光源</div>
        {rec !== null && <div className="p3-rec">● 錄影中 {rec}s</div>}
      </div>
      <aside className="p3-panel">
        <div className="p3-head">
          <h3>3D 預覽</h3>
          <button className="icon-btn" onClick={onClose} title="關閉（Esc）">
            <Icon name="close" />
          </button>
        </div>

        <section>
          <h4 className="props-sub">光源</h4>
          <div
            className="light-pad"
            ref={pad}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              padDrag(e);
            }}
            onPointerMove={(e) => e.buttons && padDrag(e)}
          >
            <span className="light-dot" style={dot} />
            <span className="pad-label l">左</span>
            <span className="pad-label r">右</span>
            <span className="pad-label t">上</span>
          </div>
          <label className="field">
            <span className="field-label">亮度 {Math.round(intensity * 100)}%</span>
            <input type="range" min={0.3} max={2} step={0.05} value={intensity} onChange={(e) => setIntensity(+e.target.value)} />
          </label>
        </section>

        {project.options.substrate && (
          <section>
            <h4 className="props-sub">雷射卡底材</h4>
            <FilmPicker value={project.options.substrate} onChange={onSubstrate} />
          </section>
        )}

        {foils.length > 0 && (
          <section>
            <h4 className="props-sub">燙金／膜材</h4>
            {foils.length > 1 && (
              <select className="input" value={filmTarget} onChange={(e) => setFilmTarget(e.target.value)}>
                <option value="all">全部燙金圖層</option>
                {foils.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}（{getFilm(f.film).name}）
                  </option>
                ))}
              </select>
            )}
            <FilmPicker
              value={currentFilm}
              onChange={(film) => {
                if (filmTarget === 'all') foils.forEach((f) => onFilm(f.id, film));
                else onFilm(filmTarget, film);
              }}
            />
          </section>
        )}

        <section className="p3-actions">
          <label className="bar-toggle">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自動旋轉
          </label>
          {hasGyro && (
            <button className={`btn ${gyro === 'on' ? 'primary' : ''}`} onClick={enableGyro}>
              <Icon name="phone" size={16} /> {gyro === 'on' ? '關閉陀螺儀' : gyro === 'denied' ? '陀螺儀未授權' : '用手機傾斜看反光'}
            </button>
          )}
          <button
            className="btn"
            onClick={() => {
              viewer.current?.resetView();
              viewer.current?.resetRotation();
            }}
          >
            <Icon name="fit" size={16} /> 重設視角
          </button>
          <h4 className="props-sub">影片</h4>
          <div className="seg">
            <button className={motion === 'tilt' ? 'active' : ''} onClick={() => setMotion('tilt')}>傾斜擺動</button>
            <button className={motion === 'spin' ? 'active' : ''} onClick={() => setMotion('spin')}>旋轉一圈</button>
          </div>
          <div className="seg">
            <button className={portrait ? 'active' : ''} onClick={() => setPortrait(true)}>直式 1080×1350</button>
            <button className={!portrait ? 'active' : ''} onClick={() => setPortrait(false)}>方形 1080×1080</button>
          </div>
          <label className="bar-toggle">
            <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} /> 簡報模式（影片不出現光球）
          </label>
          <button className="btn primary" onClick={record} disabled={rec !== null || !ready}>
            <Icon name="video" size={16} /> {rec !== null ? `錄影中…${rec}s` : '匯出 6 秒影片'}
          </button>
          <p className="muted xsmall">傾斜擺動是頭尾相接的循環影片，光源固定。瀏覽器支援時存成 MP4，否則為 WebM。</p>
        </section>
      </aside>
    </div>
  );
}
