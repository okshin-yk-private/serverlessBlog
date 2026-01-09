# Implementation Plan

## Task 1. Terraformプロジェクト基盤構築

- [x] 1.1 Terraformプロジェクトディレクトリ構造とバージョン制約を作成
  - `terraform/`ルートディレクトリを作成
  - `modules/`ディレクトリを作成（database, storage, auth, api, lambda, cdn, monitoring）
  - `environments/`ディレクトリを作成（dev, prd）
  - `bootstrap/`ディレクトリを作成
  - ルート`versions.tf`でTerraform >= 1.14.0とAWSプロバイダ >= 6.0を制約
  - 各モジュールに`main.tf`, `variables.tf`, `outputs.tf`の基本ファイルを配置
  - 各環境に`main.tf`, `variables.tf`, `outputs.tf`, `backend.tf`, `terraform.tfvars`を配置
  - _Requirements: 1.1, 1.2, 1.4, 1.7_

- [x] 1.2 (P) 状態バックエンド初期化用bootstrapモジュールを実装
  - S3バケット`terraform-state-{ACCOUNT_ID}`の作成リソース定義
  - S3バージョニング有効化の設定
  - SSE-S3暗号化の設定
  - パブリックアクセスブロック設定
  - `prevent_destroy`ライフサイクルルールの適用
  - アカウントID取得用`data.aws_caller_identity`の定義
  - 出力変数: `state_bucket_name`, `state_bucket_arn`, `account_id`
  - _Requirements: 1.3_

- [x] 1.3 環境別バックエンド設定と変数定義を実装
  - `environments/dev/backend.tf`でS3バックエンド設定（use_lockfile = true）
  - `environments/prd/backend.tf`でS3バックエンド設定（use_lockfile = true）
  - 共通変数定義: `environment`, `project_name`, `aws_region`
  - 変数バリデーション: `environment`は`dev`または`prd`のみ許可
  - 各環境の`terraform.tfvars`に環境固有値を設定
  - _Requirements: 1.3, 1.4, 1.5, 1.6_

## Task 2. データ層モジュール実装

- [x] 2.1 (P) DynamoDBモジュールを実装
  - BlogPostsテーブルのリソース定義（パーティションキー: `id` String）
  - PAY_PER_REQUEST課金モードの設定
  - CategoryIndex GSIの定義（パーティションキー: `category`, ソートキー: `createdAt`）
  - PublishStatusIndex GSIの定義（パーティションキー: `publishStatus`, ソートキー: `createdAt`）
  - ポイントインタイムリカバリ（PITR）の有効化
  - サーバーサイド暗号化（AWSマネージドキー）の有効化
  - 入力変数: `table_name`, `environment`, `enable_pitr`
  - 出力変数: `table_name`, `table_arn`, `category_index_name`, `publish_status_index_name`
  - 変数バリデーション: テーブル名3-255文字
  - 既存テーブルインポート用の`import`ブロックを定義
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 2.2 (P) S3ストレージモジュールを実装
  - 画像ストレージバケットのリソース定義（バージョニング有効）
  - 公開サイトバケットのリソース定義
  - 管理画面バケットのリソース定義
  - 全バケットにSSE-S3暗号化を設定
  - 全バケットにパブリックアクセスブロックを設定
  - バージョン管理用ライフサイクルポリシーの定義
  - CloudFront OACアクセス用バケットポリシーの条件付き設定
  - 入力変数: `project_name`, `environment`, `enable_access_logs`, `cloudfront_distribution_arn`
  - 出力変数: `image_bucket_name`, `image_bucket_arn`, `public_site_bucket_name`, `admin_site_bucket_name`
  - 既存バケットインポート用の`import`ブロックを定義
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

## Task 3. 認証・API層モジュール実装

- [x] 3.1 (P) Cognito認証モジュールを実装
  - User Poolリソース定義（Eメールベースサインイン）
  - パスワードポリシー設定（12文字以上、記号必須）
  - MFA設定（OPTIONAL）
  - メール検証設定
  - App Clientリソース定義（USER_PASSWORD_AUTH、USER_SRP_AUTH、REFRESH_TOKEN_AUTH）
  - トークン有効期限設定
  - 入力変数: `user_pool_name`, `environment`, `mfa_configuration`, `password_minimum_length`
  - 変数バリデーション: MFA設定はOFF/OPTIONAL/ONのみ許可
  - 出力変数: `user_pool_id`, `user_pool_arn`, `user_pool_client_id`
  - 既存User Poolインポート用の`import`ブロックを定義
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 3.2 API Gatewayモジュールを実装
  - REST APIリソース定義
  - Cognito Authorizerの設定（User Pool ARN参照）
  - CORS設定（全オリジン許可）
  - APIリソースパス定義（/posts, /auth, /images, /categories）
  - 各エンドポイントのメソッド定義（GET, POST, PUT, DELETE）
  - Lambda統合の設定（invoke_arn参照）
  - リクエストバリデーションの設定
  - デプロイステージの作成（dev/prd）
  - 入力変数: `api_name`, `environment`, `stage_name`, `cognito_user_pool_arn`, `cors_allow_origins`
  - 出力変数: `rest_api_id`, `rest_api_execution_arn`, `api_endpoint`, `authorizer_id`
  - 既存API Gatewayインポート用の`import`ブロックを定義
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

## Task 4. コンピュート層モジュール実装

- [x] 4.1 Go Lambda関数モジュールを実装
  - 11のGo Lambda関数リソース定義（createPost, getPost, getPublicPost, listPosts, updatePost, deletePost, login, logout, refresh, getUploadUrl, deleteImage）
  - ARM64アーキテクチャ、provided.al2023ランタイムの設定
  - メモリサイズとタイムアウト値の設定（現行CDK設定と同等）
  - 環境変数設定（TABLE_NAME, BUCKET_NAME, CLOUDFRONT_DOMAIN, USER_POOL_ID, USER_POOL_CLIENT_ID）
  - Goバイナリ参照（`go-functions/bin/`ディレクトリからbootstrapファイル）
  - prd環境のみX-Rayトレーシング有効化
  - 入力変数: `environment`, `table_name`, `bucket_name`, `user_pool_id`, `user_pool_client_id`, `cloudfront_domain`, `enable_xray`, `go_binary_path`
  - 出力変数: `function_arns`, `function_invoke_arns`
  - 既存Lambda関数インポート用の`import`ブロックを定義
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7_

- [x] 4.2 Lambda IAMロールとポリシーを実装
  - 関数グループ別IAMロール作成（posts, auth, images）
  - DynamoDB操作用ポリシー（posts関数グループ用）
  - S3操作用ポリシー（images関数グループ用）
  - Cognito操作用ポリシー（auth関数グループ用）
  - CloudWatch Logs書き込み用ポリシー（全関数共通）
  - X-Ray書き込み用ポリシー（prd環境のみ）
  - 最小権限原則に基づくアクション制限
  - Lambda関数へのロールアタッチ
  - _Requirements: 6.5, 12.6_

## Task 5. 配信・運用層モジュール実装

- [x] 5.1 CloudFront CDNモジュールを実装
  - 統合ディストリビューションのリソース定義
  - S3オリジン設定（public-site, admin, images）
  - Origin Access Control（OAC）の作成と設定
  - API Gatewayオリジン設定（/api/*パス用）
  - HTTPSリダイレクト強制（viewer-protocol-policy: redirect-to-https）
  - Gzip/Brotli圧縮有効化
  - キャッシュ動作設定（適切なTTL: 24時間デフォルト）
  - PRICE_CLASS_100の設定
  - 入力変数: `environment`, `image_bucket_name`, `public_site_bucket_name`, `admin_site_bucket_name`, `rest_api_id`, `price_class`
  - 出力変数: `distribution_id`, `distribution_domain_name`, `distribution_arn`
  - 既存ディストリビューションインポート用の`import`ブロックを定義
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 5.2 モニタリングモジュールを実装（prd環境専用機能含む）
  - Lambda関数用CloudWatchアラーム（エラー、実行時間、スロットル）
  - DynamoDB用CloudWatchアラーム（読み取り/書き込みスロットル）
  - API Gateway用CloudWatchアラーム（4XX/5XX、レイテンシ）
  - SNSトピックの作成（アラーム通知用）
  - メールサブスクリプションの設定
  - CloudWatchダッシュボード作成（Lambda, DynamoDB, API Gatewayウィジェット）
  - 入力変数: `environment`, `alarm_email` (sensitive), `lambda_function_names`, `dynamodb_table_names`, `api_gateway_names`, `enable_alarms`
  - 出力変数: `alarm_topic_arn`, `dashboard_name`
  - prd環境のみアラーム作成（`enable_alarms`フラグ制御）
  - 既存リソースインポート用の`import`ブロックを定義
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

## Task 6. 環境統合と状態移行

- [x] 6.1 環境別main.tfでモジュール統合を実装
  - `environments/dev/main.tf`で全モジュール呼び出し
  - `environments/prd/main.tf`で全モジュール呼び出し
  - モジュール間の依存関係をoutput/variable参照で接続
  - database → storage → auth → api → lambda → cdn → monitoring の順序制御
  - 環境固有パラメータ（terraform.tfvars）の適用
  - S3バケットポリシーへのCloudFront OAC ARN設定（storage + cdn連携）
  - _Requirements: 1.6_

- [x] 6.2 既存AWSリソースのTerraformインポートを実行
  - 全リソースのCDK論理IDとTerraformリソースアドレスのマッピング文書作成
  - `terraform import`コマンドまたは`import`ブロックによる既存リソースインポート
  - DynamoDBテーブル、S3バケット、Cognito User Pool、API Gateway、Lambda関数、CloudFrontのインポート
  - `terraform plan`で差分なし（No changes）を確認
  - Terraform状態と実際のAWSリソースの整合性検証
  - _Requirements: 9.1, 9.2, 9.4_

- [x] 6.3 移行検証とロールバック手順を文書化
  - 検証スクリプトの作成（Terraform状態とAWSリソースの比較）
  - 移行失敗時のロールバック手順書作成
  - リソースインポート失敗時の手動修復手順書作成
  - 移行前後のサービス疎通テスト手順書作成
  - _Requirements: 9.2, 9.3, 9.4, 9.5_

## Task 7. CI/CDとセキュリティ統合

- [x] 7.1 GitHub Actions Terraformワークフローを実装
  - developブランチプッシュ時のterraform fmt、validate、planジョブ
  - mainブランチマージ時の本番デプロイジョブ（承認ゲート付き）
  - OIDC認証によるAWS認証情報設定
  - Terraform plan出力のアーティファクト保存
  - terraform testの実行ジョブ
  - 環境別デプロイ（dev自動、prd承認後）
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 7.2 (P) セキュリティスキャン（Checkov）をCIに統合
  - GitHub ActionsにCheckovスキャンステップ追加
  - `soft_fail: true`での初期導入（Phase 1）
  - SARIF出力形式でGitHub Security tabへの送信設定
  - `.checkov.yaml`スキップルール設定ファイル作成
  - スキップルールの正当な理由文書化
  - _Requirements: 12.1, 12.3, 12.4_

- [x] 7.3 (P) ローカルセキュリティスキャン（Trivy）を設定
  - `.pre-commit-config.yaml`にTrivyフック追加
  - HIGH/CRITICAL重大度の問題ブロック設定
  - `.trivyignore`例外ファイル作成
  - 開発者向けセキュリティツールセットアップドキュメント作成
  - _Requirements: 12.2, 12.5, 12.10_

- [x] 7.4 セキュリティベストプラクティスの検証
  - IAMポリシー最小権限アクセスの確認
  - 保存データ暗号化設定の確認（S3 SSE-S3、DynamoDB暗号化）
  - HTTPS強制設定の確認（CloudFront、API Gateway）
  - sensitive変数マーキングの確認（alarm_email等）
  - _Requirements: 12.6, 12.7, 12.8, 12.9_

## Task 8. テストとドキュメント

- [x] 8.1 (P) Terraformモジュールテストを実装
  - 重要モジュール（database, lambda, api）のterraform test作成
  - 変数バリデーションテスト
  - 出力値の型・存在テスト
  - モジュール間依存関係テスト
  - _Requirements: 11.3_

- [x] 8.2 (P) プロジェクトドキュメントを作成
  - `terraform/README.md`でプロジェクト概要と使用方法を記載
  - 各モジュールのREADME.md作成（terraform-docs使用）
  - `terraform/examples/`に完全なデプロイ例を配置
  - pre-commitフック設定（terraform fmt、validate、terraform-docs）
  - _Requirements: 11.1, 11.2, 11.4, 11.5_

## Requirements Coverage

| 要件 | タスク |
|------|-------|
| 1.1, 1.2, 1.4, 1.7 | 1.1 |
| 1.3 | 1.2, 1.3 |
| 1.4, 1.5, 1.6 | 1.3, 6.1 |
| 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 | 2.1 |
| 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 | 2.2 |
| 4.1, 4.2, 4.3, 4.4, 4.5 | 3.1 |
| 5.1, 5.2, 5.3, 5.4, 5.5, 5.6 | 3.2 |
| 6.1, 6.2, 6.3, 6.4, 6.6, 6.7 | 4.1 |
| 6.5, 12.6 | 4.2 |
| 7.1, 7.2, 7.3, 7.4, 7.5, 7.6 | 5.1 |
| 8.1, 8.2, 8.3, 8.4, 8.5 | 5.2 |
| 9.1, 9.2, 9.4 | 6.2 |
| 9.2, 9.3, 9.4, 9.5 | 6.3 |
| 10.1, 10.2, 10.3, 10.4, 10.5 | 7.1 |
| 12.1, 12.3, 12.4 | 7.2 |
| 12.2, 12.5, 12.10 | 7.3 |
| 12.6, 12.7, 12.8, 12.9 | 7.4 |
| 11.3 | 8.1 |
| 11.1, 11.2, 11.4, 11.5 | 8.2 |
