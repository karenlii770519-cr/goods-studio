import { createStore, del, get, keys, set, values } from 'idb-keyval';
import { migrateProject } from './project';
import type { Project } from './types';

const store = createStore('goods-studio', 'projects');

export async function listProjects(): Promise<Project[]> {
  const all = (await values(store)) as Project[];
  return all.map(migrateProject).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const p = (await get(id, store)) as Project | undefined;
  return p ? migrateProject(p) : undefined;
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
