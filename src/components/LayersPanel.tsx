import { useState } from 'react';
import { getFilm } from '../lib/films';
import { getProduct } from '../lib/products';
import { PROCESS_HINT, PROCESS_LABEL, PROCESS_ORDER } from '../lib/project';
import type { Layer, Process, Project } from '../lib/types';
import { Icon } from './Icon';

interface Props {
  project: Project;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, key: 'visible' | 'locked') => void;
  onMove: (id: string, process: Process, beforeId: string | null) => void;
  onRename: (id: string, name: string) => void;
}

function typeIcon(l: Layer) {
  if (l.type === 'image') return 'image';
  if (l.type === 'text') return 'text';
  return l.shape;
}

export function LayersPanel({ project, selectedId, onSelect, onToggle, onMove, onRename }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ process: Process; before: string | null } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const product = getProduct(project.productId);
  const isAcrylic = product.family === 'acrylic';

  const drop = (process: Process, before: string | null) => {
    if (dragId) onMove(dragId, process, before);
    setDragId(null);
    setOver(null);
  };

  return (
    <div className="layers">
      {PROCESS_ORDER.map((proc) => {
        // 面板上方 = 最上層，所以反過來顯示
        const items = project.layers.filter((l) => l.process === proc).reverse();
        return (
          <section
            key={proc}
            className={`layer-group g-${proc} ${over?.process === proc ? 'drop-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!over || over.process !== proc) setOver({ process: proc, before: null });
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(proc, over?.process === proc ? over.before : null);
            }}
          >
            <header className="group-head" title={PROCESS_HINT[proc]}>
              <span className={`group-icon pi-${proc}`}>
                <Icon name={proc} size={15} />
              </span>
              <span className="group-name">{PROCESS_LABEL[proc]}</span>
              <span className="group-count">{items.length}</span>
            </header>
            <ul className="layer-list">
              {proc === 'cut' && (
                <li className="layer-auto">
                  <Icon name="cut" size={14} />
                  <div>
                    <div className="auto-title">{isAcrylic ? '自動外框' : product.shape === 'circle' ? '圓形刀模（自動）' : '成品裁切線（自動）'}</div>
                    <div className="muted xsmall">
                      {isAcrylic
                        ? `依圖稿外擴 ${project.options.outlineOffset}mm${project.productId === 'acrylic-charm' ? ` · 掛孔 ⌀${project.options.holeDiameter}mm` : ' · 含插腳與底座'}`
                        : '依品項外形，不用另外畫'}
                    </div>
                  </div>
                </li>
              )}
              {items.map((l) => (
                <li
                  key={l.id}
                  className={`layer-item ${l.id === selectedId ? 'selected' : ''} ${!l.visible ? 'is-hidden' : ''} ${over?.before === l.id ? 'drop-before' : ''}`}
                  draggable={editing !== l.id}
                  onDragStart={(e) => {
                    setDragId(l.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (over?.before !== l.id) setOver({ process: proc, before: l.id });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    drop(proc, l.id);
                  }}
                  onClick={() => onSelect(l.id)}
                >
                  <span className="layer-type">
                    <Icon name={typeIcon(l)} size={14} />
                  </span>
                  {editing === l.id ? (
                    <input
                      className="layer-rename"
                      autoFocus
                      defaultValue={l.name}
                      onBlur={(e) => {
                        onRename(l.id, e.target.value.trim() || l.name);
                        setEditing(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
                  ) : (
                    <span className="layer-name" onDoubleClick={() => setEditing(l.id)}>
                      {l.name}
                    </span>
                  )}
                  {l.process === 'foil' && (
                    <span className="film-chip" title={getFilm(l.film).name}>
                      <span className="film-dot" style={{ background: `linear-gradient(135deg, ${getFilm(l.film).swatch.join(',')})` }} />
                      {getFilm(l.film).name}
                    </span>
                  )}
                  <button
                    className="icon-btn xs"
                    title={l.visible ? '隱藏' : '顯示'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(l.id, 'visible');
                    }}
                  >
                    <Icon name={l.visible ? 'eye' : 'eyeOff'} size={14} />
                  </button>
                  <button
                    className={`icon-btn xs ${l.locked ? 'on' : ''}`}
                    title={l.locked ? '解鎖' : '鎖定'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(l.id, 'locked');
                    }}
                  >
                    <Icon name={l.locked ? 'lock' : 'unlock'} size={14} />
                  </button>
                </li>
              ))}
              {items.length === 0 && proc !== 'cut' && <li className="layer-empty">把圖層拖到這裡，就會套用{PROCESS_LABEL[proc]}</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
