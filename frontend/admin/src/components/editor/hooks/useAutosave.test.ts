import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave } from './useAutosave';

interface Data {
  title: string;
  content: string;
}

/**
 * useAutosave のテストは fake timers を使うため waitFor が回らない。
 * `await vi.runAllTimersAsync()` で setTimeout + microtask を全て drain
 * してから同期的にアサーションする。
 */

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初期状態は idle で、初回マウントでは save を呼ばない', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const data: Data = { title: '', content: '' };
    const { result } = renderHook(() =>
      useAutosave({ data, save, isReady: () => true })
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.lastSavedAt).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('data 変更後 1.5s で save が呼ばれ status が saved になる', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const initial: Data = { title: '', content: '' };
    const { result, rerender } = renderHook(
      ({ data }: { data: Data }) =>
        useAutosave({ data, save, isReady: () => true }),
      { initialProps: { data: initial } }
    );

    rerender({ data: { title: 'hello', content: '' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: 'hello', content: '' });
    expect(result.current.status).toBe('saved');
    expect(result.current.lastSavedAt).toBeInstanceOf(Date);
  });

  it('連続変更時はデバウンスされ最後の値で 1 回だけ呼ばれる', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const initial: Data = { title: '', content: '' };
    const { rerender } = renderHook(
      ({ data }: { data: Data }) =>
        useAutosave({ data, save, isReady: () => true }),
      { initialProps: { data: initial } }
    );

    rerender({ data: { title: 'a', content: '' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    rerender({ data: { title: 'ab', content: '' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    rerender({ data: { title: 'abc', content: '' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: 'abc', content: '' });
  });

  it('flush() を呼ぶと debounce 待たずに即座に保存', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const initial: Data = { title: '', content: '' };
    const { result, rerender } = renderHook(
      ({ data }: { data: Data }) =>
        useAutosave({ data, save, isReady: () => true }),
      { initialProps: { data: initial } }
    );

    rerender({ data: { title: 'hi', content: '' } });

    await act(async () => {
      await result.current.flush();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: 'hi', content: '' });
  });

  it('window.blur イベントで flush される', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const initial: Data = { title: '', content: '' };
    const { rerender } = renderHook(
      ({ data }: { data: Data }) =>
        useAutosave({ data, save, isReady: () => true }),
      { initialProps: { data: initial } }
    );

    rerender({ data: { title: 'changed', content: '' } });

    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      await vi.runAllTimersAsync();
    });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('visibilitychange (hidden) で flush される', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const initial: Data = { title: '', content: '' };
    const { rerender } = renderHook(
      ({ data }: { data: Data }) =>
        useAutosave({ data, save, isReady: () => true }),
      { initialProps: { data: initial } }
    );

    rerender({ data: { title: 'changed', content: '' } });

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.runAllTimersAsync();
    });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('save が失敗すると status=error と error が設定される', async () => {
    const save = vi.fn().mockRejectedValue(new Error('boom'));
    const initial: Data = { title: '', content: '' };
    const { result, rerender } = renderHook(
      ({ data }: { data: Data }) =>
        useAutosave({ data, save, isReady: () => true }),
      { initialProps: { data: initial } }
    );

    rerender({ data: { title: 'x', content: '' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('boom');
  });

  it('isReady が false の間は save されない', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const initial: Data = { title: '', content: '' };
    const isReady = (d: Data) => d.title.trim().length > 0;
    const { rerender } = renderHook(
      ({ data }: { data: Data }) => useAutosave({ data, save, isReady }),
      { initialProps: { data: initial } }
    );

    rerender({ data: { title: '   ', content: '' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(save).not.toHaveBeenCalled();

    rerender({ data: { title: 'OK', content: '' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: 'OK', content: '' });
  });

  it('enabled=false の間は save されない', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const initial: Data = { title: '', content: '' };
    const { rerender } = renderHook(
      ({ data, enabled }: { data: Data; enabled: boolean }) =>
        useAutosave({ data, save, isReady: () => true, enabled }),
      { initialProps: { data: initial, enabled: false } }
    );

    rerender({ data: { title: 'changed', content: '' }, enabled: false });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('save 中に data が変わると、現在の保存完了後にもう一度 save される', async () => {
    let resolveFirst: (() => void) | null = null;
    const save = vi.fn().mockImplementation(() => {
      return new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
    });
    const initial: Data = { title: '', content: '' };
    const { result, rerender } = renderHook(
      ({ data }: { data: Data }) =>
        useAutosave({ data, save, isReady: () => true }),
      { initialProps: { data: initial } }
    );

    rerender({ data: { title: 'A', content: '' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith({ title: 'A', content: '' });
    expect(result.current.status).toBe('saving');

    rerender({ data: { title: 'AB', content: '' } });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst!();
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ title: 'AB', content: '' });
  });

  it('unmount で pending タイマーがクリーンアップされる', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const initial: Data = { title: '', content: '' };
    const { rerender, unmount } = renderHook(
      ({ data }: { data: Data }) =>
        useAutosave({ data, save, isReady: () => true }),
      { initialProps: { data: initial } }
    );

    rerender({ data: { title: 'x', content: '' } });
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(save).not.toHaveBeenCalled();
  });

  it('markClean() は現在の data を baseline 化し isDirty=false にする', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const initial: Data = { title: '', content: '' };
    const { result, rerender } = renderHook(
      ({ data }: { data: Data }) =>
        useAutosave({ data, save, isReady: () => true }),
      { initialProps: { data: initial } }
    );

    rerender({ data: { title: 'externally-saved', content: '' } });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.markClean();
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.status).toBe('saved');
    expect(result.current.lastSavedAt).toBeInstanceOf(Date);

    // 後続の自動保存はキックされない (data が baseline と一致)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('savedAgoLabel に日本語の状態が反映される', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const initial: Data = { title: '', content: '' };
    const { result, rerender } = renderHook(
      ({ data }: { data: Data }) =>
        useAutosave({ data, save, isReady: () => true }),
      { initialProps: { data: initial } }
    );

    expect(result.current.savedAgoLabel).toBe('未保存');

    rerender({ data: { title: 'x', content: '' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(result.current.savedAgoLabel).toMatch(/保存済み/);
  });
});
