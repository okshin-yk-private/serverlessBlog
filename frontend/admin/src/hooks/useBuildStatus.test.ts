import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../api/posts');
const postsApi = await import('../api/posts');
const mockedFetch = vi.mocked(postsApi.fetchBuildStatus);

const { useBuildStatus } = await import('./useBuildStatus');

/**
 * Flushes pending microtasks so awaited promises resolve while fake
 * timers are active. Calling `vi.advanceTimersByTimeAsync(0)` inside
 * `act` is the recommended pattern for jsdom + vitest fake timers.
 */
const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe('useBuildStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns idle and does not fetch when disabled', () => {
    const { result } = renderHook(() =>
      useBuildStatus('post-1', { enabled: false, intervalMs: 100 })
    );

    expect(result.current.status).toBe('idle');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('returns idle when postId is undefined', () => {
    const { result } = renderHook(() =>
      useBuildStatus(undefined, { enabled: true, intervalMs: 100 })
    );

    expect(result.current.status).toBe('idle');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('fetches once immediately when enabled and reflects in-progress', async () => {
    mockedFetch.mockResolvedValueOnce({
      status: 'in-progress',
      buildId: 'b-1',
      phase: 'BUILD',
    });

    const { result } = renderHook(() =>
      useBuildStatus('post-1', { enabled: true, intervalMs: 1000 })
    );

    await flush();
    expect(result.current.status).toBe('in-progress');
    expect(result.current.buildId).toBe('b-1');
    expect(result.current.phase).toBe('BUILD');
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps polling on the configured interval until succeeded', async () => {
    mockedFetch
      .mockResolvedValueOnce({ status: 'in-progress', buildId: 'b-1' })
      .mockResolvedValueOnce({ status: 'in-progress', buildId: 'b-1' })
      .mockResolvedValueOnce({ status: 'succeeded', buildId: 'b-1' })
      .mockResolvedValue({ status: 'succeeded', buildId: 'b-1' });

    const { result } = renderHook(() =>
      useBuildStatus('post-1', { enabled: true, intervalMs: 1000 })
    );

    // initial fetch
    await flush();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('in-progress');

    // tick 1 -> still in-progress
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mockedFetch).toHaveBeenCalledTimes(2);

    // tick 2 -> succeeded, polling should stop
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.status).toBe('succeeded');
    expect(mockedFetch).toHaveBeenCalledTimes(3);

    // further ticks should NOT trigger more fetches
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mockedFetch).toHaveBeenCalledTimes(3);
  });

  it('stops polling on failed', async () => {
    mockedFetch
      .mockResolvedValueOnce({ status: 'in-progress', buildId: 'b-1' })
      .mockResolvedValueOnce({ status: 'failed', buildId: 'b-1' })
      .mockResolvedValue({ status: 'failed', buildId: 'b-1' });

    const { result } = renderHook(() =>
      useBuildStatus('post-1', { enabled: true, intervalMs: 500 })
    );

    await flush();
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.status).toBe('failed');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('captures fetch errors without stopping the loop', async () => {
    mockedFetch
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ status: 'succeeded', buildId: 'b-1' });

    const { result } = renderHook(() =>
      useBuildStatus('post-1', { enabled: true, intervalMs: 200 })
    );

    await flush();
    expect(result.current.error).toBe('network down');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(result.current.status).toBe('succeeded');
    // error is cleared once a subsequent call succeeds
    expect(result.current.error).toBeNull();
  });

  it('stops polling on unmount', async () => {
    mockedFetch.mockResolvedValue({ status: 'in-progress', buildId: 'b-1' });

    const { unmount } = renderHook(() =>
      useBuildStatus('post-1', { enabled: true, intervalMs: 200 })
    );

    await flush();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('resets when enabled flips to false mid-flight', async () => {
    mockedFetch.mockResolvedValue({ status: 'in-progress', buildId: 'b-1' });

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useBuildStatus('post-1', { enabled, intervalMs: 200 }),
      { initialProps: { enabled: true } }
    );

    await flush();
    expect(result.current.status).toBe('in-progress');

    rerender({ enabled: false });
    expect(result.current.status).toBe('idle');

    // no new fetches after disable
    const callsBefore = mockedFetch.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockedFetch).toHaveBeenCalledTimes(callsBefore);
  });
});
