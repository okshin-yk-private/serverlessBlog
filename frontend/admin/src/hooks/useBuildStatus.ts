import { useEffect, useRef, useState } from 'react';
import {
  fetchBuildStatus,
  type BuildStatusResponse,
  type BuildStatusValue,
} from '../api/posts';

export interface UseBuildStatusOptions {
  /**
   * ポーリングを有効にするか。記事が公開直後だけバッジを表示するため、
   * 呼び出し側 (PostCreatePage / PostEditPage) は publish 完了直後に
   * `enabled: true` で渡す。
   */
  enabled: boolean;
  /**
   * ポーリング間隔(ms)。テスト用に上書き可能。デフォルト 5000ms。
   */
  intervalMs?: number;
}

export interface UseBuildStatusResult {
  status: BuildStatusValue;
  buildId?: string;
  phase?: string;
  startTime?: string;
  endTime?: string;
  error: string | null;
}

const DEFAULT_INTERVAL = 5_000;

/**
 * 直近のサイトビルドステータスをポーリングする hook (PR5b)
 *
 * 動作仕様:
 * - `enabled === false` のときは何もせず `'idle'` を返す。
 * - `enabled === true` のとき、即時 1 回フェッチして、その後 `intervalMs` 間隔で再取得。
 * - `'succeeded'` または `'failed'` を一度受け取ったらポーリングを自動停止
 *   (UI が「公開サイトを開く」または「失敗」表示に固定される)。
 * - アンマウント時にタイマーを必ず解放する。
 * - 同時インフライトを防ぐため、リクエスト中に次のタイマーを発火させない。
 */
export function useBuildStatus(
  postId: string | undefined,
  { enabled, intervalMs = DEFAULT_INTERVAL }: UseBuildStatusOptions
): UseBuildStatusResult {
  const [snapshot, setSnapshot] = useState<BuildStatusResponse>({
    status: 'idle',
  });
  const [error, setError] = useState<string | null>(null);

  // mount 状態は state 更新の取りこぼし防止に使う。
  const mountedRef = useRef(true);
  // ポーリングを止める判定に使う最新値。state ではタイマー内で stale になる。
  const stoppedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !postId) {
      // 無効化・postId 未確定時はステートを idle にリセットして終了
      setSnapshot({ status: 'idle' });
      setError(null);
      stoppedRef.current = false;
      return undefined;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    stoppedRef.current = false;

    const tick = async (): Promise<void> => {
      if (inFlight || stoppedRef.current) return;
      inFlight = true;
      try {
        const result = await fetchBuildStatus(postId);
        if (!mountedRef.current) return;
        setSnapshot(result);
        setError(null);
        if (result.status === 'succeeded' || result.status === 'failed') {
          stoppedRef.current = true;
          return;
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setError(
          err instanceof Error ? err.message : 'failed to fetch build status'
        );
      } finally {
        inFlight = false;
      }

      if (!stoppedRef.current && mountedRef.current) {
        timer = setTimeout(() => {
          void tick();
        }, intervalMs);
      }
    };

    void tick();

    return () => {
      stoppedRef.current = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [enabled, postId, intervalMs]);

  return {
    status: snapshot.status,
    buildId: snapshot.buildId,
    phase: snapshot.phase,
    startTime: snapshot.startTime,
    endTime: snapshot.endTime,
    error,
  };
}
