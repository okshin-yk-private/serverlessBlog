import { useState, useCallback, useRef } from 'react';
import type { MindmapNode } from '../api/mindmaps';

const MAX_HISTORY = 50;

export interface MindmapHistoryActions {
  pushState: (state: MindmapNode) => void;
  undo: () => MindmapNode | null;
  redo: () => MindmapNode | null;
  reset: (state: MindmapNode) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useMindmapHistory(
  initialState: MindmapNode
): MindmapHistoryActions {
  const pastRef = useRef<MindmapNode[]>([]);
  const presentRef = useRef<MindmapNode>(initialState);
  const futureRef = useRef<MindmapNode[]>([]);
  // Force re-render when history changes (for canUndo/canRedo)
  const [, setVersion] = useState(0);

  const pushState = useCallback((state: MindmapNode) => {
    pastRef.current = [...pastRef.current, presentRef.current].slice(
      -MAX_HISTORY
    );
    presentRef.current = state;
    futureRef.current = [];
    setVersion((v) => v + 1);
  }, []);

  const undo = useCallback((): MindmapNode | null => {
    if (pastRef.current.length === 0) return null;
    const previous = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [presentRef.current, ...futureRef.current];
    presentRef.current = previous;
    setVersion((v) => v + 1);
    return previous;
  }, []);

  const redo = useCallback((): MindmapNode | null => {
    if (futureRef.current.length === 0) return null;
    const next = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, presentRef.current];
    presentRef.current = next;
    setVersion((v) => v + 1);
    return next;
  }, []);

  const reset = useCallback((state: MindmapNode) => {
    pastRef.current = [];
    presentRef.current = state;
    futureRef.current = [];
    setVersion((v) => v + 1);
  }, []);

  return {
    pushState,
    undo,
    redo,
    reset,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
