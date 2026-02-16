import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMindmapHistory } from './useMindmapHistory';
import type { MindmapNode } from '../api/mindmaps';

const makeNode = (text: string): MindmapNode => ({
  id: 'root',
  text,
  children: [],
});

describe('useMindmapHistory', () => {
  it('should start with canUndo=false, canRedo=false', () => {
    const { result } = renderHook(() => useMindmapHistory(makeNode('initial')));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('should enable canUndo after pushing state', () => {
    const { result } = renderHook(() => useMindmapHistory(makeNode('initial')));

    act(() => {
      result.current.pushState(makeNode('state-1'));
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('should undo to previous state', () => {
    const { result } = renderHook(() => useMindmapHistory(makeNode('initial')));

    act(() => {
      result.current.pushState(makeNode('state-1'));
    });

    let undone: MindmapNode | null = null;
    act(() => {
      undone = result.current.undo();
    });

    expect(undone).not.toBeNull();
    expect(undone!.text).toBe('initial');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('should redo to next state', () => {
    const { result } = renderHook(() => useMindmapHistory(makeNode('initial')));

    act(() => {
      result.current.pushState(makeNode('state-1'));
    });
    act(() => {
      result.current.undo();
    });

    let redone: MindmapNode | null = null;
    act(() => {
      redone = result.current.redo();
    });

    expect(redone).not.toBeNull();
    expect(redone!.text).toBe('state-1');
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('should clear future on new push after undo', () => {
    const { result } = renderHook(() => useMindmapHistory(makeNode('initial')));

    act(() => {
      result.current.pushState(makeNode('state-1'));
    });
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.pushState(makeNode('state-2'));
    });

    expect(result.current.canRedo).toBe(false);
  });

  it('should return null when undoing with empty history', () => {
    const { result } = renderHook(() => useMindmapHistory(makeNode('initial')));

    let undone: MindmapNode | null = null;
    act(() => {
      undone = result.current.undo();
    });

    expect(undone).toBeNull();
  });

  it('should return null when redoing with empty future', () => {
    const { result } = renderHook(() => useMindmapHistory(makeNode('initial')));

    let redone: MindmapNode | null = null;
    act(() => {
      redone = result.current.redo();
    });

    expect(redone).toBeNull();
  });

  it('should handle multiple undo/redo operations', () => {
    const { result } = renderHook(() => useMindmapHistory(makeNode('s0')));

    act(() => result.current.pushState(makeNode('s1')));
    act(() => result.current.pushState(makeNode('s2')));
    act(() => result.current.pushState(makeNode('s3')));

    // Undo twice
    let state: MindmapNode | null = null;
    act(() => {
      state = result.current.undo();
    });
    expect(state!.text).toBe('s2');

    act(() => {
      state = result.current.undo();
    });
    expect(state!.text).toBe('s1');

    // Redo once
    act(() => {
      state = result.current.redo();
    });
    expect(state!.text).toBe('s2');

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);
  });

  it('should reset history clearing past and future', () => {
    const { result } = renderHook(() => useMindmapHistory(makeNode('initial')));

    act(() => result.current.pushState(makeNode('s1')));
    act(() => result.current.pushState(makeNode('s2')));

    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.reset(makeNode('loaded-data'));
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    // Undo should return null since history was reset
    let undone: MindmapNode | null = null;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBeNull();
  });
});
