import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStuckHeight } from './useStuckHeight';

function element(position: string, height: number) {
  const el = document.createElement('div');
  el.style.position = position;
  el.getBoundingClientRect = () => ({ height }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useStuckHeight', () => {
  it('sticky 要素は高さを返す', () => {
    const ref = { current: element('sticky', 77) };
    const { result } = renderHook(() => useStuckHeight(ref));
    expect(result.current).toBe(77);
  });

  it('sticky でない要素は 0 を返す', () => {
    const ref = { current: element('relative', 77) };
    const { result } = renderHook(() => useStuckHeight(ref));
    expect(result.current).toBe(0);
  });

  it('window の resize で position の切り替わりを反映する', () => {
    const ref = { current: element('sticky', 77) };
    const { result } = renderHook(() => useStuckHeight(ref));

    ref.current.style.position = 'relative';
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(0);
  });

  it('要素が無ければ null のまま', () => {
    const { result } = renderHook(() => useStuckHeight({ current: null }));
    expect(result.current).toBeNull();
  });
});
