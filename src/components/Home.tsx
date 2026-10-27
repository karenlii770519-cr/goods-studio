import { useEffect, useMemo, useState } from 'react';
import { FAMILY_LABEL, PRODUCTS, type ProductFamily, type ProductTemplate } from '../lib/products';
import { newProject } from '../lib/project';
import { navigate } from '../lib/router';
import { sampleBadge, sampleCard, sampleCharm, sampleStand } from '../lib/samples';
import { deleteProject, listProjects, saveProject } from '../lib/storage';
import { makeThumbnail } from '../lib/thumbnail';
import { uid } from '../lib/id';
import type { Project } from '../lib/types';
import { Icon } from './Icon';

function ProductGlyph({ p }: { p: ProductTemplate }) {
  // 依實際比例畫出品項外形
  const max = Math.max(p.width, p.height);
  const w = (p.width / max) * 44, h = (p.height / max) * 44;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="product-glyph" aria-hidden>
      {p.shape === 'circle' ? (
        <circle cx="28" cy="28" r="21" />
      ) : p.family === 'acrylic' ? (
        <>
          <path d={p.id === 'acrylic-charm' ? 'M28 8a4 4 0 1 1 0 .01M16 20c0-6 6-9 12-9s12 3 12 9c3 3 5 8 4 13-1 9-8 14-16 14s-15-5-16-14c-1-5 1-10 4-13z' : 'M17 8c6-2 16-2 22 2 4 6 4 14 2 20 2 6 0 12-3 15H18c-3-3-5-9-3-15-2-6-2-14 2-22zM12 46h32v4H12z'} />
        </>
      ) : (
        <rect x={28 - w / 2} y={28 - h / 2} width={w} height={h} rx={p.cornerRadius > 0 ? 3 : 0.5} />
      )}
    </svg>
  );
}

function timeAgo(t: number): string {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return '剛剛';
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  return new Date(t).toLocaleDateString('zh-TW');
}

export default function Home() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [sort, setSort] = useState<'updated' | 'name'>('updated');
  const [q, setQ] = useState('');
  const refresh = () => listProjects().then(setProjects);
  useEffect(() => {
    refresh();
  }, []);

  const families: ProductFamily[] = ['paper', 'badge', 'acrylic'];

  const create = async (p: Project) => {
    p.thumbnail = await makeThumbnail(p).catch(() => undefined);
    await saveProject(p);
    navigate(`/p/${p.id}`);
  };

  const shown = useMemo(() => {
    let list = projects ?? [];
    if (q.trim()) list = list.filter((p) => p.name.includes(q.trim()));
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    return list;
  }, [projects, sort, q]);

  const addSamples = async () => {
    for (const make of [sampleStand, sampleBadge, sampleCharm, sampleCard]) {
      const p = make();
      p.thumbnail = await makeThumbnail(p).catch(() => undefined);
      await saveProject(p);
      await new Promise((r) => setTimeout(r, 5));
    }
    refresh();
  };

  return (
    <div className="home">
      <header className="home-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <Icon name="sparkles" size={18} />
          </span>
          <span className="brand-name">周邊設計工具</span>
          <span className="brand-sub">Goods Studio</span>
        </div>
        <div className="home-top-right">
          <span className="muted small">作品只存在這台裝置的瀏覽器裡</span>
        </div>
      </header>

      <main className="home-main">
        <section className="hero">
          <h1>做一張會發光的周邊</h1>
          <p>選一個品項開始。卡片、徽章、壓克力都有實際尺寸、出血與安全區，燙金與雷射膜可以直接在 3D 裡轉著看。</p>
        </section>

        <section className="new-grid" aria-label="新建專案">
          {families.map((f) => (
            <div key={f} className="new-family">
              <h2 className="section-title">{FAMILY_LABEL[f]}</h2>
              <div className="product-list">
                {PRODUCTS.filter((p) => p.family === f).map((p) => (
                  <button key={p.id} className="product-card" onClick={() => create(newProject(p.id))}>
                    <ProductGlyph p={p} />
                    <span className="product-name">{p.name}</span>
                    <span className="product-size">{p.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="works">
          <div className="works-head">
            <h2 className="section-title">我的作品{projects ? <span className="count">{projects.length}</span> : null}</h2>
            <div className="works-tools">
              <input className="input search" placeholder="搜尋作品名稱" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="input" value={sort} onChange={(e) => setSort(e.target.value as 'updated' | 'name')} aria-label="排序">
                <option value="updated">最近編輯</option>
                <option value="name">名稱</option>
              </select>
              <button className="btn" onClick={addSamples}>
                <Icon name="sparkles" size={16} /> 加入範例作品
              </button>
            </div>
          </div>
          {projects && projects.length === 0 ? (
            <div className="empty">
              <p className="empty-title">還沒有作品</p>
              <p className="muted">從上面選一個品項開始，或按「加入範例作品」看看效果。不用登入，作品會自動存在這個瀏覽器。</p>
            </div>
          ) : (
            <div className="works-grid">
              {shown.map((p) => (
                <article key={p.id} className="work-card">
                  <button className="work-thumb" onClick={() => navigate(`/p/${p.id}`)} aria-label={`開啟 ${p.name}`}>
                    {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <span className="muted">無預覽</span>}
                  </button>
                  <div className="work-meta">
                    <div className="work-name" title={p.name}>
                      {p.name}
                    </div>
                    <div className="muted small">
                      {PRODUCTS.find((x) => x.id === p.productId)?.name} · {timeAgo(p.updatedAt)}
                    </div>
                  </div>
                  <div className="work-actions">
                    <button
                      className="icon-btn"
                      title="重新命名"
                      onClick={async () => {
                        const name = prompt('作品名稱', p.name);
                        if (name && name.trim()) {
                          await saveProject({ ...p, name: name.trim() });
                          refresh();
                        }
                      }}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      title="複製一份"
                      onClick={async () => {
                        await saveProject({ ...p, id: uid('p'), name: `${p.name} 複本`, createdAt: Date.now(), updatedAt: Date.now() });
                        refresh();
                      }}
                    >
                      <Icon name="copy" size={16} />
                    </button>
                    <button
                      className="icon-btn danger"
                      title="刪除"
                      onClick={async () => {
                        if (confirm(`確定要刪除「${p.name}」？刪除後無法復原。`)) {
                          await deleteProject(p.id);
                          refresh();
                        }
                      }}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
      <footer className="home-foot muted small">周邊設計工具 v0.1 · 個人使用版</footer>
    </div>
  );
}
