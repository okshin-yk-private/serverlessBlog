import React from 'react';
import { useBuildStatus } from '../hooks/useBuildStatus';

export interface BuildStatusBadgeProps {
  /** ステータスを問い合わせる対象記事の ID。`undefined` のときは描画しない。 */
  postId: string | undefined;
  /**
   * `true` のときだけポーリングを開始する。公開ボタンを押した直後に
   * `true` に切り替える運用 — 編集中ずっと走らせる必要はない。
   */
  enabled: boolean;
  /** 公開サイトの URL。succeeded 時に「公開サイトを開く」リンクを出す。 */
  publicUrl?: string;
  /** テスト用ポーリング間隔上書き。 */
  intervalMs?: number;
}

const STATUS_LABEL: Record<string, string> = {
  idle: '待機中',
  'in-progress': 'ビルド中…',
  succeeded: 'ビルド完了',
  failed: 'ビルド失敗',
};

const STATUS_CLASS: Record<string, string> = {
  idle: 'admin-badge-light',
  'in-progress': 'admin-badge-dark',
  succeeded: 'admin-badge-success',
  failed: 'admin-badge-danger',
};

/**
 * 公開直後のサイトリビルド状況をバッジで可視化する (PR5b)
 *
 * - publish 直後に `enabled=true` を渡すと 5 秒間隔で `/build-status` を
 *   ポーリングし、状態に応じたラベルを表示する。
 * - `succeeded` 時に `publicUrl` が指定されていれば「公開サイトを開く」
 *   リンクを併記する。
 */
export const BuildStatusBadge: React.FC<BuildStatusBadgeProps> = ({
  postId,
  enabled,
  publicUrl,
  intervalMs,
}) => {
  const { status, error } = useBuildStatus(postId, {
    enabled: enabled && Boolean(postId),
    intervalMs,
  });

  if (!enabled || !postId) {
    return null;
  }

  const label = STATUS_LABEL[status] ?? STATUS_LABEL.idle;
  const className = STATUS_CLASS[status] ?? STATUS_CLASS.idle;

  return (
    <div
      className="flex items-center gap-2 text-sm"
      data-testid="build-status-badge"
      data-status={status}
    >
      <span className={`admin-badge ${className}`}>{label}</span>
      {status === 'succeeded' && publicUrl && (
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="admin-inline-link"
        >
          公開サイトを開く
        </a>
      )}
      {error && (
        <span className="admin-field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
};
