import { useEffect, useState } from 'react';
import { downloadBlob, safeFileName } from '../lib/download';
import { buildExport, zipFiles, type ExportFile } from '../lib/exporter';
import { mmToPx } from '../lib/geometry';
import type { AcrylicOutline } from '../lib/outline';
import { getProduct } from '../lib/products';
import type { Project } from '../lib/types';
import { Icon } from './Icon';

interface Props {
  project: Project;
  outline: AcrylicOutline | null;
  onClose: () => void;
  onOpen3D: () => void;
}

export function ExportDialog({ project, outline, onClose, onOpen3D }: Props) {
  const [dpi, setDpi] = useState(300);
  const [bleed, setBleed] = useState(true);
  const [files, setFiles] = useState<ExportFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const p = getProduct(project.productId);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setFiles(null);
    buildExport(project, outline, { dpi, includeBleed: bleed })
      .then((f) => {
        if (!alive) return;
        setFiles(f);
        const pv: Record<string, string> = {};
        f.forEach((x) => (pv[x.name] = URL.createObjectURL(x.blob)));
        setPreviews((old) => {
          Object.values(old).forEach((u) => URL.revokeObjectURL(u));
          return pv;
        });
      })
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [project, outline, dpi, bleed]);

  const w = p.family === 'acrylic' ? null : bleed ? project.width + project.options.bleed * 2 : project.width;
  const h = p.family === 'acrylic' ? null : bleed ? project.height + project.options.bleed * 2 : project.height;

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="匯出">
        <div className="modal-head">
          <h3>匯出</h3>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="export-opts">
          <label className="field">
            <span className="field-label">解析度</span>
            <select className="input" value={dpi} onChange={(e) => setDpi(+e.target.value)}>
              <option value={150}>150 dpi（草稿）</option>
              <option value={300}>300 dpi（印刷）</option>
              <option value={600}>600 dpi（細字／燙金）</option>
            </select>
          </label>
          {p.family !== 'acrylic' && (
            <label className="bar-toggle">
              <input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} /> 含出血
            </label>
          )}
          {w && h && (
            <span className="muted small">
              {w}×{h} mm → {Math.round(mmToPx(w, dpi))}×{Math.round(mmToPx(h, dpi))} px
            </span>
          )}
        </div>
        <div className="export-list">
          {busy && <div className="muted">產生檔案中…</div>}
          {files?.map((f) => (
            <div key={f.name} className="export-item">
              <div className="export-thumb">{previews[f.name] && <img src={previews[f.name]} alt="" />}</div>
              <div className="export-meta">
                <div>{f.label}</div>
                <div className="muted xsmall">
                  {f.name}
                  {f.width ? ` · ${f.width}×${f.height}px` : ''} · {(f.blob.size / 1024).toFixed(0)} KB
                </div>
              </div>
              <button className="btn sm" onClick={() => downloadBlob(f.blob, f.name)}>
                <Icon name="download" size={15} /> 下載
              </button>
            </div>
          ))}
          <div className="export-item">
            <div className="export-thumb video">
              <Icon name="video" size={22} />
            </div>
            <div className="export-meta">
              <div>3D 旋轉預覽影片（6 秒）</div>
              <div className="muted xsmall">在 3D 預覽裡調好光源與膜材後錄製</div>
            </div>
            <button className="btn sm" onClick={onOpen3D}>
              <Icon name="cube" size={15} /> 開啟 3D
            </button>
          </div>
        </div>
        <div className="modal-foot">
          <span className="muted xsmall">遮罩為白底黑圖：黑色＝要上該工藝的位置。PNG 內含 DPI 資訊。</span>
          <button
            className="btn primary"
            disabled={!files}
            onClick={async () => files && downloadBlob(await zipFiles(files), `${safeFileName(project.name)}_完稿.zip`)}
          >
            <Icon name="download" size={16} /> 全部下載（ZIP）
          </button>
        </div>
      </div>
    </div>
  );
}
