import { useEffect, useState } from 'react';

/** 用 hash 路由，GitHub Pages 不需要額外設定 404 轉址 */
export function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function navigate(path: string) {
  window.location.hash = path;
}
