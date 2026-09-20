# Go Lambda の構造化ログ

Issue #490 の対象は、Makefile の `FUNCTIONS` にあるデプロイ対象19関数です。
18個のHTTPハンドラは `middleware.HandleRequest` を経由し、
`posts/reconcile_build` は非HTTPの呼び出しとしてログを初期化します。

## 記録する内容

- HTTP呼び出しの `requestId` は API Gateway のリクエストIDです。
  `lambdaRequestId` に Lambda の実行IDも記録します。
  API Gateway のIDがない場合と非HTTP呼び出しでは、Lambda の実行IDを使います。
- `traceId` は Lambda ランタイムの `_X_AMZN_TRACE_ID` を使います。
  クライアントのヘッダーは採用しません。ランタイムから提供されない場合は空文字です。
- HTTP呼び出しは完了時にステータスと処理時間を1件記録します。
  500を返す経路では、共通の `ServerError` が元のエラーを追加で記録します。
  応答の `message` は既存の固定文言を維持し、元のエラーを含めません。
- ビルド起動などの補助処理も同じ呼び出しのロガーを使います。
  記事削除後の画像清掃失敗はログに記録しますが、記事削除の204応答は維持します。
- 非HTTP呼び出しの失敗は記録後もエラーを返します。
  Lambda の再試行・失敗判定を成功扱いに変えません。

リクエスト本文、応答本文、認証ヘッダー、クレーム、クエリ全体は記録しません。
構造化フィールドの `password`、`accessToken`、`refreshToken`、`idToken`、
`token`、`secret`、`authorization` は大文字小文字を区別せずマスクします。
これはフィールド名によるマスクであり、任意の自由文に含まれる機密情報を
完全に検出する仕組みではありません。新しいログでは、入力値や認証情報を
エラーメッセージへ埋め込まないでください。

正常なHTTP呼び出しにもログが1件増えるため、CloudWatch Logs の取り込み量と
保存量は増加します。呼び出しIDをEMFのディメンションにはしません。

## 未使用実装の判断

- `internal/apierrors` は削除しました。現在のAPIはステータスと固定メッセージを
  各分岐で決めており、別のエラー型階層は必要ありません。
  応答の共通化は `middleware.MessageResponse` と `ServerError` が担当します。
- `internal/middleware/metrics.go` の未使用EMF実装と専用テストを削除しました。
  今回の目的は障害原因の記録であり、カスタムメトリクスの導入は含めません。
  既存のLambda標準メトリクスやTerraformの監視設定への変更はありません。
- デプロイ対象外の `categories/seed` とCLIの `backfill_post_slugs` は対象外です。

## 検証の範囲

各HTTPハンドラへ依存先の失敗を注入し、原因の記録、相関ID、汎用500応答、
キャッシュ禁止、リクエスト情報の非露出を確認します。
共通処理では、ログのJSON形式、秘密フィールドのマスク、呼び出し間のID分離、
Lambda IDへのフォールバック、返却エラーの記録を確認します。
非HTTPハンドラはエラーを保持したまま相関付きログを残すことを確認します。

これらはローカルのモック検証です。CloudWatchへの到達や実環境のログ保持設定は、
デプロイ後の確認が必要です。仕様の根拠は、このリポジトリの実装と回帰テストです。
