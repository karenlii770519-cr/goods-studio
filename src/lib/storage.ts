import { createStore, del, get, keys, set, values } from 'idb-keyval';
import type { Project } from './types';

const store = createStore('goods-studio', 'projects');

export async function listProjects(): Promise<Project[]> {
  const all = (await values(store)) as Project[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return (await get(id, store)) as Project | undefined;
}

export async function saveProject(p: Project): Promise<void> {
  await set(p.id, p, store);
}

export async function deleteProject(id: string): Promise<void> {
  await del(id, store);
}

export async function projectCount(): Promise<number> {
  return (await keys(store)).length;
}
