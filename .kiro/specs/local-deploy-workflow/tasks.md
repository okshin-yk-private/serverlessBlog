# 実装計画

## タスク一覧

- [x] 1. スクリプト基盤とCLI引数解析の実装
- [x] 1.1 スクリプトファイルの作成とCLI引数パーサーの実装
  - `scripts/local-deploy.sh`ファイルを作成し、実行権限を付与
  - `set -euo pipefail`でエラーハンドリングを設定
  - 色付き出力用の定数を定義（RED、GREEN、YELLOW、NC）
  - getoptsまたは手動解析でCLI引数を処理
  - `--env`、`--component`、`--dry-run`、`--auto-approve`、`--skip-prereq-check`、`--no-invalidation`、`--lambda`、`--frontend`、`--parallel`、`--verbose`、`--strict-versions`、`--help`オプションをサポート
  - デフォルト値の設定（env=dev、component=all、parallel=true）
  - 無効な引数の場合はエラーメッセージとヘルプを表示
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

- [x] 1.2 使用方法ヘルプ表示機能の実装
  - `show_usage()`関数を作成
  - すべてのオプションと説明を表示
  - 使用例を含める
  - `--help`または引数なしで呼び出し
  - _Requirements: 1.2_

- [x] 2. 前提条件検証機能の実装
- [x] 2.1 (P) AWS認証情報検証機能の実装
  - `validate_aws()`関数を作成
  - `command -v aws`でAWS CLIの存在を確認
  - `aws sts get-caller-identity`で認証情報を検証
  - アカウントID、リージョン、ユーザー名を表示
  - 失敗時はインストール/設定ガイダンスを表示
  - ~/.aws/credentials、環境変数、AWS SSOをサポート
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 2.2 (P) ツールバージョン検証機能の実装
  - `validate_prereq()`関数を作成
  - Go 1.25+のバージョンチェック（`go version`から抽出）
  - Terraform 1.14+のバージョンチェック
  - Bunのインストール確認
  - Node.js 22+のバージョンチェック
  - GitHub Actionsの期待バージョンとの比較と警告表示
  - `--strict-versions`時はバージョン不一致でエラー終了
  - `--skip-prereq-check`時はスキップ
  - 成功時は確認メッセージを表示
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 11.1, 11.2, 11.3, 11.4_

- [x] 3. SSMパラメータ取得機能の実装
- [x] 3.1 SSMパラメータ取得ユーティリティの実装
  - `fetch_ssm()`関数を作成
  - パラメータ名と復号フラグを引数として受け取る
  - `aws ssm get-parameter`でパラメータ値を取得
  - SecureString用に`--with-decryption`オプションをサポート
  - パラメータ未検出時はエラーメッセージとパスを表示
  - 機密値はログにマスク出力
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 4. Go Lambdaビルド機能の実装
- [x] 4.1 Lambda並列ビルド機能の実装
  - `build_lambdas()`関数を作成
  - 既存の`go-functions/Makefile`を活用
  - 全11関数のビルド（posts: 6, auth: 3, images: 2）
  - 並列ビルド: `make -j$(nproc) build`
  - ビルドフラグ: CGO_ENABLED=0、GOOS=linux、GOARCH=arm64、-trimpath、-ldflags="-s -w"、-tags="lambda.norpc"
  - ビルド時間を計測して表示
  - 失敗時はエラーを表示して終了
  - 成功時はビルド数と合計時間を表示
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

- [x] 4.2 単一Lambdaビルド機能の実装
  - `--lambda`オプションで指定された関数のみビルド
  - `make build-one FUNC={domain}/{function}`を使用
  - 有効な関数名リストを定義
  - 無効な関数名の場合はエラーと有効な名前リストを表示
  - _Requirements: 10.1, 10.4, 10.5_

- [x] 5. Terraformデプロイ機能の実装
- [x] 5.1 Terraform初期化とプラン機能の実装
  - `run_terraform()`関数を作成
  - 環境ディレクトリへの移動（terraform/environments/{env}/）
  - `terraform init`の実行
  - SSMからBasic Auth認証情報を取得してTF_VAR環境変数に設定
  - `terraform plan -out=tfplan.binary`の実行
  - プラン結果を表示
  - 変更なしの場合は"No changes required"を表示
  - _Requirements: 5.1, 5.2, 5.3, 5.8, 12.1_

- [x] 5.2 Terraform適用と確認プロンプト機能の実装
  - 変更がある場合の確認プロンプトを実装
  - prd環境では二重確認（"I understand this is production"入力を要求）
  - `--auto-approve`時は確認をスキップ
  - `--dry-run`時はapplyをスキップ
  - `terraform apply tfplan.binary`の実行
  - 失敗時はエラーを表示して終了
  - 成功時はCloudFrontドメインとAPIエンドポイントを表示
  - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.9, 5.10_

- [x] 5.3 ターゲット指定Terraform適用機能の実装
  - 単一Lambda関数デプロイ用の`-target`オプション対応
  - Lambda関数名からTerraformリソース名へのマッピング
  - _Requirements: 10.4_

- [x] 6. フロントエンドビルド機能の実装
- [x] 6.1 (P) Public Siteビルド機能の実装
  - `build_frontend()`関数を作成
  - `frontend/public/`ディレクトリで実行
  - `bun install --frozen-lockfile`で依存関係インストール
  - `NODE_ENV=production bun run build`でビルド
  - ビルド時間と出力サイズを計測して表示
  - 失敗時はエラーを表示して終了
  - _Requirements: 6.1, 6.3, 6.4, 6.7, 6.8_

- [x] 6.2 (P) Admin Siteビルド機能の実装
  - SSMからCognito設定を取得
  - VITE_COGNITO_USER_POOL_ID、VITE_COGNITO_USER_POOL_CLIENT_ID環境変数を設定
  - `frontend/admin/`ディレクトリで実行
  - `bun install --frozen-lockfile`で依存関係インストール
  - `NODE_ENV=production bun run build`でビルド
  - ビルド時間と出力サイズを計測して表示
  - 失敗時はエラーを表示して終了
  - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 12.2_

- [x] 6.3 選択的フロントエンドビルド機能の実装
  - `--frontend public`または`--frontend admin`で個別ビルド
  - 対応するサイトのみビルドしてデプロイ
  - _Requirements: 10.2, 10.3_

- [x] 7. S3デプロイとCloudFront無効化機能の実装
- [x] 7.1 S3同期デプロイ機能の実装
  - `deploy_s3()`関数を作成
  - SSMからバケット名を取得
  - `aws s3 sync frontend/public/dist/ s3://{bucket}/ --delete`
  - `aws s3 sync frontend/admin/dist/ s3://{bucket}/ --delete`
  - アップロード/削除ファイル数を表示
  - 失敗時はエラーを表示して終了
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 12.3_

- [x] 7.2 CloudFront無効化機能の実装
  - `invalidate_cf()`関数を作成
  - Terraform outputからCloudFront配信IDを取得
  - `aws cloudfront create-invalidation --distribution-id {id} --paths "/*"`
  - 無効化IDを表示
  - 配信ID未検出時は警告を表示して続行
  - `--no-invalidation`時はスキップ
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 8. デプロイサマリーとメインフロー統合の実装
- [x] 8.1 デプロイサマリー表示機能の実装
  - `show_summary()`関数を作成
  - デプロイ開始時刻を記録
  - デプロイ完了コンポーネント一覧を表示
  - 合計デプロイ時間を表示
  - 環境名、CloudFront URL、APIエンドポイントURLを表示
  - 失敗したステップがあればその内容を表示
  - `--verbose`時は各ステップの詳細出力を表示
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 8.2 メインデプロイフローの統合
  - すべての関数を適切な順序で呼び出し
  - コンポーネント選択に応じた条件分岐
  - `--component infrastructure`: Lambda + Terraform
  - `--component frontend`: Frontend + S3 + CloudFront
  - `--component all`: 全コンポーネント
  - 終了コード管理（0: 成功、1: 失敗）
  - _Requirements: 1.6, 1.7, 1.8, 1.9, 9.5_

- [x] 9. 手動テストと検証
- [x] 9.1 基本機能の手動テスト
  - ヘルプ表示の確認（`--help`と引数なし）
  - 前提条件検証の確認（ツールあり/なしの両方）
  - AWS認証検証の確認（有効/無効な認証情報）
  - dry-runモードの確認
  - _Requirements: 1.2, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 1.10_

- [x] 9.2 デプロイ機能の手動テスト
  - dev環境フルデプロイの確認
  - コンポーネント別デプロイの確認
  - 単一Lambda/フロントエンドデプロイの確認
  - prd環境の二重確認プロンプトの確認
  - _Requirements: 4.1, 5.1, 5.2, 6.1, 6.2, 7.1, 7.2, 8.1, 10.1, 10.2, 10.3, 5.7_

## 要件カバレッジ

| 要件 | タスク |
|------|--------|
| 1.1-1.10 | 1.1, 1.2, 8.2 |
| 2.1-2.6 | 2.1 |
| 3.1-3.7 | 2.2 |
| 4.1-4.10 | 4.1 |
| 5.1-5.10 | 5.1, 5.2, 5.3 |
| 6.1-6.8 | 6.1, 6.2, 6.3 |
| 7.1-7.5 | 7.1 |
| 8.1-8.5 | 7.2 |
| 9.1-9.6 | 8.1 |
| 10.1-10.5 | 4.2, 5.3, 6.3 |
| 11.1-11.4 | 2.2 |
| 12.1-12.5 | 3.1 |
