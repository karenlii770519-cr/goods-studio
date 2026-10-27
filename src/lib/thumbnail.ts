import { getProduct } from './products';
import { designRegion, renderLayers } from './render';
import type { Project } from './types';

export async function makeThumbnail(project: Project): Promise<string> {
  const p = getProduct(project.productId);
  const region = p.family === 'acrylic' ? { x: 0, y: 0, width: project.width, height: project.height } : designRegion(project);
  const k = 320 / Math.max(region.width, region.height);
  const clip = p.shape === 'circle' ? 'circle' : 'rect';
  const c = await renderLayers(project, {
    region,
    pxPerMm: k,
    processes: ['print', 'white', 'foil'],
    mode: 'color',
    background: p.family === 'acrylic' ? null : project.options.background,
    backgroundFilm: project.options.substrate ?? null,
    clip: p.family === 'acrylic' ? null : clip,
    clipRect: p.shape === 'circle' ? { x: -project.options.bleed, y: -project.options.bleed, width: project.width + project.options.bleed * 2, height: project.height + project.options.bleed * 2 } : region,
  });
  return c.toDataURL('image/webp', 0.8);
}
