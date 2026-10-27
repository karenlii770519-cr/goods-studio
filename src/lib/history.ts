import { useCallback, useRef, useState } from 'react';

export interface History<T> {
  present: T;
  canUndo: boolean;
  canRedo: boolean;
  /** 更新內容；mergeKey 相同且在 1 秒內的連續更新會合併成一步（例如拖曳滑桿） */
  set: (next: T | ((prev: T) => T), mergeKey?: string) => void;
  undo: () => void;
  redo: () => void;
  reset: (value: T) => void;
}

const LIMIT = 120;

export function useHistory<T>(initial: T): History<T> {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const lastMerge = useRef<{ key: string; t: number } | null>(null);

  const set = useCallback((next: T | ((prev: T) => T), mergeKey?: string) => {
    setState((s) => {
      const value = typeof next === 'function' ? (next as (p: T) => T)(s.present) : next;
      if (value === s.present) return s;
      const now = Date.now();
      const merge = mergeKey && lastMerge.current && lastMerge.current.key === mergeKey && now - lastMerge.current.t < 1000;
      lastMerge.current = mergeKey ? { key: mergeKey, t: now } : null;
      if (merge) return { ...s, present: value, future: [] };
      const past = [...s.past, s.present];
      if (past.length > LIMIT) past.shift();
      return { past, present: value, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    lastMerge.current = null;
    setState((s) => {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    lastMerge.current = null;
    setState((s) => {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return { past: [...s.past, s.present], present: next, future: rest };
    });
  }, []);

  const reset = useCallback((value: T) => {
    lastMerge.current = null;
    setState({ past: [], present: value, future: [] });
  }, []);

  return { present: state.present, canUndo: state.past.length > 0, canRedo: state.future.length > 0, set, undo, redo, reset };
}
