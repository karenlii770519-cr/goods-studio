import { useEffect, useState } from 'react';
import { getFilm } from '../lib/films';
import { loadImage } from '../lib/render';
import type { FilmId, Process } from '../lib/types';

const tintCache = new Map<string, HTMLCanvasElement>();

function tint(img: HTMLImageElement, key: string, fill: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const hit = tintCache.get(key);
  if (hit) return hit;
  const max = 1600;
  const s = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((img.naturalWidth || 512) * s));
  c.height = Math.max(1, Math.round((img.naturalHeight || 512) * s));
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'source-in';
  fill(ctx, c.width, c.height);
  if (tintCache.size > 60) tintCache.clear();
  tintCache.set(key, c);
  return c;
}

/** 載入圖片；燙金/白墨圖層會換成示意色 */
export function useLayerImage(src: string, process: Process, film: FilmId): CanvasImageSource | undefined {
  const [out, setOut] = useState<CanvasImageSource>();
  useEffect(() => {
    let alive = true;
    loadImage(src)
      .then((img) => {
        if (!alive) return;
        if (process === 'foil') {
          const f = getFilm(film);
          setOut(
            tint(img, `${src.length}:${src.slice(-40)}:${film}`, (ctx, w, h) => {
              const g = ctx.createLinearGradient(0, 0, w, h);
              f.swatch.forEach((c, i) => g.addColorStop(i / (f.swatch.length - 1), c));
              ctx.fillStyle = g;
              ctx.fillRect(0, 0, w, h);
            }),
          );
        } else if (process === 'white') {
          setOut(
            tint(img, `${src.length}:${src.slice(-40)}:white`, (ctx, w, h) => {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, w, h);
            }),
          );
        } else setOut(img);
      })
      .catch(() => setOut(undefined));
    return () => {
      alive = false;
    };
  }, [src, process, film]);
  return out;
}
