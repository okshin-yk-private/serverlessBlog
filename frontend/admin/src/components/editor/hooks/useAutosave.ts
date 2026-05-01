import { useCallback, useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseAutosaveOptions<T> {
  /** 監視対象のデータ。変更を検知して debounce 後に save が呼ばれる。 */
  data: T;
  /** データを永続化する非同期関数。失敗時は例外を投げる。 */
  save: (data: T) => Promise<void>;
  /** 自動保存を有効にするか (default: true)。false の間は何もしない。 */
  enabled?: boolean;
  /** debounce 待機時間 (ms, default: 1500)。 */
  debounceMs?: number;
  /**
   * 保存可否の述語。新規記事ではタイトル非空時のみ保存する等の用途。
   * default: () => true
   */
  isReady?: (data: T) => boolean;
}

export interface UseAutosaveResult {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  /** UI 表示用ラベル ("未保存" / "保存中..." / "保存済み Xs" / "保存失敗") */
  savedAgoLabel: string;
  /** Pending な変更を即座に保存する。in-flight 中は完了を待つ。 */
  flush: () => Promise<void>;
  /**
   * 外部で明示保存が完了したときに呼ぶ。現在の data を baseline にし、
   * isDirty を false に戻す (autosave hook 経由でない保存に対応するため)。
   */
  markClean: () => void;
  error: Error | null;
  /** dirty (last saved との差分があるか) */
  isDirty: boolean;
}

const DEFAULT_DEBOUNCE_MS = 1500;
const TICK_INTERVAL_MS = 5000;

function serialize<T>(value: T): string {
  try {
    return JSON.stringify(value);
  } catch {
    return Math.random().toString();
  }
}

function formatSavedAgo(savedAt: Date | null, now: number): string {
  if (!savedAt) return '';
  const diffSec = Math.max(0, Math.floor((now - savedAt.getTime()) / 1000));
  if (diffSec < 5) return '保存済み';
  if (diffSec < 60) return `保存済み ${diffSec}秒前`;
  const min = Math.floor(diffSec / 60);
  return `保存済み ${min}分前`;
}

/**
 * 自動保存フック。data の変更を監視し、debounce 後に save() を呼ぶ。
 *
 * - 同時インフライト 1 (in-flight 中の変更は保存完了後に再 schedule)
 * - window.blur / document visibilitychange→hidden で flush
 * - status state machine: idle → saving → saved / error
 *
 * 新規記事 (id 未確定) の場合、save コールバック側で createPost → setId →
 * navigate(replace) を行うパターンを想定。フック自身は id を知らない。
 */
export function useAutosave<T>(
  options: UseAutosaveOptions<T>
): UseAutosaveResult {
  const {
    data,
    save,
    enabled = true,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    isReady,
  } = options;

  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // 最新の data / callback / config を保持する ref。
  // クロージャ依存を避け、再レンダー時に最新を参照できるようにする。
  const dataRef = useRef(data);
  const saveRef = useRef(save);
  const isReadyRef = useRef<((d: T) => boolean) | undefined>(isReady);
  const enabledRef = useRef(enabled);

  // 直近で保存済みのスナップショット (JSON シリアライズ済) と未保存変更の有無
  const lastSavedSerializedRef = useRef<string>(serialize(data));

  // 保留中の debounce タイマー
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 進行中の save Promise (同時インフライト 1 の鍵)
  const inFlightRef = useRef<Promise<void> | null>(null);

  // in-flight 中に変更が入った場合のリトライフラグ
  const pendingAfterFlightRef = useRef<boolean>(false);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    isReadyRef.current = isReady;
  }, [isReady]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const performSave = useCallback(async () => {
    const current = dataRef.current;
    const serialized = serialize(current);
    if (serialized === lastSavedSerializedRef.current) {
      return;
    }
    if (enabledRef.current === false) {
      return;
    }
    if (isReadyRef.current && !isReadyRef.current(current)) {
      return;
    }

    // 既存 in-flight があれば「完了後に再保存」を予約
    if (inFlightRef.current) {
      pendingAfterFlightRef.current = true;
      return inFlightRef.current;
    }

    setStatus('saving');
    setError(null);

    const promise = (async () => {
      try {
        await saveRef.current(current);
        // 保存成功時点で baseline を「呼び出し時点の値」に固定 (in-flight 中の追加変更は dirty 扱い継続)
        lastSavedSerializedRef.current = serialized;
        setLastSavedAt(new Date());
        setStatus('saved');
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus('error');
        throw err;
      }
    })();

    inFlightRef.current = promise;

    try {
      await promise;
    } catch {
      // 上位 catch でハンドリング済み (status=error)。
    } finally {
      inFlightRef.current = null;
      // in-flight 中に変更があれば再保存をキック
      if (pendingAfterFlightRef.current) {
        pendingAfterFlightRef.current = false;
        const stillDirty =
          serialize(dataRef.current) !== lastSavedSerializedRef.current;
        if (stillDirty) {
          // 短い debounce 経由で再 schedule (連続変更時も同様にデバウンスされる)
          clearTimer();
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            performSave();
          }, debounceMs);
        }
      }
    }
  }, [clearTimer, debounceMs]);

  const flush = useCallback(async () => {
    clearTimer();
    await performSave();
  }, [clearTimer, performSave]);

  const markClean = useCallback(() => {
    clearTimer();
    pendingAfterFlightRef.current = false;
    lastSavedSerializedRef.current = serialize(dataRef.current);
    setLastSavedAt(new Date());
    setStatus('saved');
    setError(null);
  }, [clearTimer]);

  // data 変更を検知して debounce タイマーをセット
  useEffect(() => {
    if (!enabled) {
      clearTimer();
      return;
    }
    const serialized = serialize(data);
    if (serialized === lastSavedSerializedRef.current) {
      // 変更なし
      return;
    }
    if (isReady && !isReady(data)) {
      // 未準備 (例: タイトル空) → タイマーは張らない
      clearTimer();
      return;
    }

    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      performSave();
    }, debounceMs);

    return () => {
      // 次の effect 起動時に既存タイマーをクリア (clearTimer で吸収)
    };
  }, [data, enabled, debounceMs, isReady, clearTimer, performSave]);

  // window.blur / visibilitychange→hidden で flush
  useEffect(() => {
    const handleBlur = () => {
      if (!enabledRef.current) return;
      void flush();
    };
    const handleVisibility = () => {
      if (!enabledRef.current) return;
      if (document.visibilityState === 'hidden') {
        void flush();
      }
    };
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flush]);

  // unmount 時にタイマーを片付ける (in-flight Promise は残す: 完了させる)
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  // "保存済み Xs前" を 5 秒ごとに更新
  useEffect(() => {
    if (status !== 'saved') return;
    const handle = setInterval(() => {
      setNow(Date.now());
    }, TICK_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [status]);

  const isDirty = serialize(data) !== lastSavedSerializedRef.current;

  let savedAgoLabel: string;
  if (status === 'saving') {
    savedAgoLabel = '保存中...';
  } else if (status === 'error') {
    savedAgoLabel = '保存失敗';
  } else if (status === 'saved' && lastSavedAt) {
    savedAgoLabel = formatSavedAgo(lastSavedAt, now);
  } else {
    savedAgoLabel = '未保存';
  }

  return {
    status,
    lastSavedAt,
    savedAgoLabel,
    flush,
    markClean,
    error,
    isDirty,
  };
}
