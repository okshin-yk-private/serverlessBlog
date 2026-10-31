# CSP段階導入（Issue #680）

公開/管理画面は別のCloudFrontレスポンスヘッダーポリシーを持つ。既存Report-Onlyポリシーを昇格するコードを用意したが、DEV/PRDとも `enforce_strict_csp_public=false`、`enforce_strict_csp_admin=false` が既定。今回のコードだけでは強制化しない。

## AWSを使わないブラウザ検証

ルートと各フロントエンドの依存をロックファイルどおりにインストールした後、次の順で実行する。

```bash
(cd frontend/admin && VITE_ENABLE_MSW_MOCK=true VITE_API_URL= VITE_API_BASE_URL= bunx vite build --config vite.csp-test.config.ts --mode test)
(cd frontend/public-astro && MOCK_PORT=4358 SITE_URL=http://127.0.0.1:4317 bash tests/build-with-mock.sh)
bunx playwright test --config=playwright.csp-local.config.ts
```

専用のローカルサーバーがTerraform内の厳格CSPを読み、ビルド済みHTMLに強制ヘッダーを付ける。通常のVite開発サーバーのinline/HMR許可に依存しない。ポート4317が使用中なら停止し、既存サーバーを流用しない。管理画面の `dist-csp-test` はモック入りの専用出力であり、配信・デプロイしてはならない。通常のproductionビルド設定は変更していない。

ローカル検証は検索・テーマ保持・モックログイン・編集・モック画像アップロードを確認する。外部HTTP通信はブラウザの経路で遮断する。実CognitoのMFA/passkey、S3署名URL/CORS、CloudFrontキャッシュ/ポリシー反映は証明できない。

## 昇格の受入条件（DEV操作は別承認）

1. Report-OnlyのままDEVで、新規/既存セッションのログイン、ログアウト、MFA/passkey、記事編集・保存・公開、画像選択/貼付け/ドラッグアップロード、検索、テーマ変更と再読込みを確認する。CSP DOMイベント/コンソールとネットワークを記録し、違反ゼロと機能成功を両方要求する。
2. Cognitoは対象リージョンのIdP、画像送信は対象バケットのregional endpointのみ許可されていることを確認する。別ホストへ署名されるなら許可先と生成元を調査し、ワイルドカードを戻して隠さない。Tiptapの動的スタイルに必要なstyle-srcのunsafe-inlineは今回残す。
3. 公開側から `enforce_strict_csp_public=true` を承認して適用する。管理側はfalseのまま。ブラウザ検証とヘッダーを再確認する。
4. 管理側のDEV証拠が揃ってから `enforce_strict_csp_admin=true` を別途承認して適用・再検証する。Report-Onlyヘッダーは同じ厳格値で残るため、ヘッダー名だけで強制化を判断せずContent-Security-Policyの値を見る。
5. PRDへの昇格はDEV結果、適用差分、復旧担当を添えて別承認する。問題が起きた場合、対象フラグだけfalseへ戻すコード変更・適用を承認し、配信ヘッダーと機能復旧を確認する。

現状はブラウザ内の違反捕捉のみで、サーバーへCSPレポートを集約する新しい受信基盤は作らない。検証に使ったrevision、ブラウザ、時刻、操作、違反内容、実際の応答ヘッダーを証跡として残す。
