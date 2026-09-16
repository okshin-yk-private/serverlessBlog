import React, { useEffect, useState } from 'react';
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
  /** 保存操作に対応するサイトcontent revision。 */
  targetRevision?: number;
}

const STATUS_LABEL: Record<string, string> = {
  idle: '待機中',
  queued: '反映待ち…',
  'in-progress': 'ビルド中…',
  succeeded: 'ビルド完了',
  failed: 'ビルド失敗',
};

const STATUS_CLASS: Record<string, string> = {
  idle: 'admin-badge-light',
  queued: 'admin-badge-warning',
  'in-progress': 'admin-badge-dark',
  succeeded: 'admin-badge-success',
  failed: 'admin-badge-danger',
};

const PHASES: Record<string, { label: string; step: number }> = {
  SUBMITTED: { label: '受付中', step: 0 },
  QUEUED: { label: '順番待ち', step: 0 },
  PROVISIONING: { label: '実行環境を準備中', step: 1 },
  DOWNLOAD_SOURCE: { label: 'ソースを取得中', step: 1 },
  INSTALL: { label: 'ビルドツールを準備中', step: 1 },
  PRE_BUILD: { label: '依存関係を準備中', step: 1 },
  BUILD: { label: 'ページを生成中', step: 2 },
  POST_BUILD: { label: 'ファイル配置・配信先切替中', step: 3 },
  UPLOAD_ARTIFACTS: { label: 'ビルドの後処理中', step: 3 },
  FINALIZING: { label: 'ビルドの終了処理中', step: 3 },
  COMPLETED: { label: '完了結果を確認中', step: 3 },
};
const STEP_LABELS = ['順番待ち', '準備', 'ページ生成', '公開処理'];

function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return value < 60
    ? `${value}秒`
    : `${Math.floor(value / 60)}分${value % 60}秒`;
}

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
  targetRevision,
}) => {
  const {
    status,
    phase,
    phases,
    failedPhase,
    startTime,
    endTime,
    progressUnavailable,
    error,
  } = useBuildStatus(postId, {
    enabled: enabled && Boolean(postId),
    intervalMs,
    targetRevision,
  });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled || status !== 'in-progress' || !startTime || endTime) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled, status, startTime, endTime]);

  if (!enabled || !postId) {
    return null;
  }

  const label = STATUS_LABEL[status] ?? STATUS_LABEL.idle;
  const className = STATUS_CLASS[status] ?? STATUS_CLASS.idle;
  const currentPhase = PHASES[failedPhase || phase || ''];
  const currentStep =
    status === 'succeeded'
      ? STEP_LABELS.length
      : status === 'queued'
        ? 0
        : (currentPhase?.step ?? -1);
  const started = startTime ? Date.parse(startTime) : NaN;
  // Never keep a clock ticking after completion if final timestamps are missing.
  const ended = endTime
    ? Date.parse(endTime)
    : status === 'in-progress'
      ? now
      : NaN;
  const elapsed =
    Number.isFinite(started) && Number.isFinite(ended)
      ? formatDuration((ended - started) / 1000)
      : undefined;

  return (
    <div
      className="admin-build-progress"
      data-testid="build-status-badge"
      data-status={status}
    >
      <div className="admin-build-progress-heading">
        <div role="status" className="admin-build-progress-status">
          <span className={`admin-badge ${className}`}>{label}</span>
          <span>
            {status === 'succeeded'
              ? '配信先の切替が完了しました'
              : status === 'queued'
                ? '保存した内容の反映を待っています'
                : failedPhase
                  ? `${currentPhase?.label.replace(/中$/, '') ?? '工程'}で失敗`
                  : status === 'in-progress'
                    ? (currentPhase?.label ?? '工程を確認中')
                    : ''}
          </span>
        </div>
        {elapsed && (
          <span className="admin-build-progress-time">
            ビルド開始から {elapsed}
          </span>
        )}
      </div>
      <ol className="admin-build-progress-steps" aria-label="公開までの工程">
        {STEP_LABELS.map((stepLabel, index) => {
          const stepState =
            index < currentStep
              ? 'done'
              : index === currentStep
                ? status === 'failed' || failedPhase
                  ? 'failed'
                  : 'active'
                : 'pending';
          const stateLabel =
            stepState === 'done'
              ? '完了'
              : stepState === 'failed'
                ? '失敗'
                : stepState === 'active'
                  ? status === 'queued'
                    ? '待機中'
                    : '処理中'
                  : currentStep < 0
                    ? '未確認'
                    : '未着手';
          return (
            <li
              key={stepLabel}
              data-state={stepState}
              aria-current={stepState === 'active' ? 'step' : undefined}
            >
              <span className="admin-build-progress-track" aria-hidden="true" />
              <span>{stepLabel}</span>
              <span className="admin-build-progress-step-state">
                {stateLabel}
              </span>
            </li>
          );
        })}
      </ol>
      {status === 'queued' && (
        <p>前のビルドがある場合は、その完了後に反映します。</p>
      )}
      {status === 'succeeded' && (
        <p>閲覧先によって反映まで少し時間がかかる場合があります。</p>
      )}
      {status === 'failed' && (
        <p>記事の保存は完了しています。公開処理に失敗しました。</p>
      )}
      {progressUnavailable && (
        <p>工程の詳細を一時的に取得できません。反映状況のみ表示しています。</p>
      )}
      {phases && phases.length > 0 && (
        <details className="admin-build-progress-details">
          <summary>工程の詳細</summary>
          <dl>
            {phases.map((item, index) => (
              <div key={`${item.name}-${index}`}>
                <dt>{PHASES[item.name]?.label ?? item.name}</dt>
                <dd>
                  {item.durationSeconds !== undefined
                    ? formatDuration(item.durationSeconds)
                    : '—'}
                  {['FAILED', 'FAULT', 'TIMED_OUT', 'STOPPED'].includes(
                    item.status
                  )
                    ? '（失敗）'
                    : ''}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
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
