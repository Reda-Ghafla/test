import { useCallback, useState } from 'react';

const LIMIT = 100;

interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

/** Snapshot-based undo/redo. State objects are treated as immutable. */
export function useHistory<T>(initial: T) {
  const [h, setH] = useState<History<T>>({ past: [], present: initial, future: [] });

  const commit = useCallback((update: (s: T) => T) => {
    setH((cur) => {
      const next = update(cur.present);
      if (next === cur.present) return cur;
      return { past: [...cur.past, cur.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setH((cur) =>
      cur.past.length
        ? { past: cur.past.slice(0, -1), present: cur.past[cur.past.length - 1], future: [cur.present, ...cur.future] }
        : cur,
    );
  }, []);

  const redo = useCallback(() => {
    setH((cur) =>
      cur.future.length
        ? { past: [...cur.past, cur.present], present: cur.future[0], future: cur.future.slice(1) }
        : cur,
    );
  }, []);

  return {
    state: h.present,
    commit,
    undo,
    redo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    dirty: h.past.length > 0,
  };
}
