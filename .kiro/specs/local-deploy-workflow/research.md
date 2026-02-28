# Research & Design Decisions

---
**目的**: ローカルデプロイワークフローの技術設計を裏付ける調査結果と決定事項を記録する。

**使用方法**:
- ディスカバリーフェーズでの調査活動と結果をログに記録
- `design.md`には詳細すぎる設計判断のトレードオフを文書化
- 将来の監査や再利用のための参照とエビデンスを提供
---

## サマリー
- **機能**: `local-deploy-workflow`
- **ディスカバリースコープ**: 拡張機能（既存システムへの追加）
- **主要な発見**:
  - 既存の`validate-import.sh`スクリプトが参照パターンを提供（色付き出力、前提条件チェック、構造化された検証）
  - Go Lambda Makefileが並列ビルドの基盤を提供（すでにビルドフラグが定義済み）
  - GitHub ActionsワークフローがSSMパラメータパスとTerraformコマンドシーケンスを明確化

## 調査ログ

### 既存スクリプトパターン分析
- **コンテキスト**: 既存のシェルスクリプトパターンを理解し、一貫性のあるUXを設計する
- **参照ソース**: `terraform/scripts/validate-import.sh`
- **発見**:
  - ANSI色コード（RED、GREEN、YELLOW、NC）を使用した明確な出力フォーマット
  - `set -euo pipefail`によるエラーハンドリング
  - 前提条件チェックを別関数として分離
  - セクションヘッダーによる視覚的区切り（`=====`）
  - 環境変数によるデフォルト値設定（`${1:-dev}`）
- **影響**: 同じパターンを採用してユーザー体験の一貫性を維持

### Go Lambdaビルド構成
- **コンテキスト**: GitHub Actionsと同等のビルドコマンドを確認
- **参照ソース**: `go-functions/Makefile`、`.github/workflows/deploy.yml`
- **発見**:
  - ビルドフラグ: `CGO_ENABLED=0 GOOS=linux GOARCH=arm64`
  - リンカーフラグ: `-ldflags="-s -w"`
  - ビルドタグ: `-tags="lambda.norpc"`
  - GitHub ActionsではGo 1.25.5を使用（`-trimpath`フラグ追加）
  - 11個のLambda関数: posts(6), auth(3), images(2)
  - 出力パス: `go-functions/bin/{function-name}/bootstrap`
- **影響**: Makefileの`build`ターゲットを再利用可能、または同等のシェルコマンドを使用

### SSMパラメータパス
- **コンテキスト**: 設定取得に必要なSSMパラメータパスを確認
- **参照ソース**: `.github/workflows/deploy.yml`
- **発見**:
  - Basic Auth: `/serverless-blog/{env}/basic-auth/username`, `/serverless-blog/{env}/basic-auth/password`
  - Cognito: `/serverless-blog/{env}/cognito/user-pool-id`, `/serverless-blog/{env}/cognito/user-pool-client-id`
  - S3バケット: `/serverless-blog/{env}/storage/public-site-bucket-name`, `/serverless-blog/{env}/storage/admin-site-bucket-name`
- **影響**: 同じパラメータパスを使用してCI/CDとの一貫性を確保

### Terraformワークフロー
- **コンテキスト**: Terraformデプロイの標準的なステップを確認
- **参照ソース**: `.github/workflows/deploy.yml`、`terraform/environments/dev/`
- **発見**:
  - コマンドシーケンス: `init` → `plan -out=tfplan.binary` → `apply tfplan.binary`
  - 環境変数: `TF_VAR_basic_auth_username`, `TF_VAR_basic_auth_password`
  - 出力取得: `terraform output -raw cloudfront_domain_name`, `terraform output -raw api_endpoint`
- **影響**: 同じコマンドシーケンスと環境変数設定を使用

### フロントエンドビルド構成
- **コンテキスト**: フロントエンドビルドに必要な環境変数を確認
- **参照ソース**: `.github/workflows/deploy.yml`
- **発見**:
  - パッケージマネージャー: Bun（`bun install --frozen-lockfile`）
  - Public Site: 環境変数なし、`NODE_ENV=production`のみ
  - Admin Site: `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_USER_POOL_CLIENT_ID`, `VITE_API_URL=""`
  - ビルドコマンド: `bun run build`
  - 出力ディレクトリ: `dist/`
- **影響**: Admin Siteビルド前にSSMからCognito設定を取得する必要あり

## アーキテクチャパターン評価

| オプション | 説明 | 強み | リスク/制限 | 備考 |
|----------|------|------|------------|------|
| 単一シェルスクリプト | すべての機能を1つのBashスクリプトに集約 | シンプル、依存関係なし、ポータブル | スクリプトが肥大化する可能性 | 推奨: 機能を関数として分離 |
| Make + シェルスクリプト | Makefileからシェルスクリプトを呼び出し | 既存のMakefile活用、タスク依存管理 | 複雑性増加 | Go Makefile参照 |
| シェルスクリプト + 設定ファイル | 設定を外部ファイルに分離 | 設定変更が容易 | 追加ファイルが必要 | 過剰設計の可能性 |

**選択**: 単一シェルスクリプト（機能を関数として分離）
- 理由: シンプルさ、ポータブル性、既存の`validate-import.sh`パターンとの一貫性

## 設計決定

### Decision: スクリプト言語選択
- **コンテキスト**: ローカルデプロイスクリプトの実装言語を決定
- **検討した代替案**:
  1. Bash - 標準的、ポータブル、既存パターンあり
  2. Python - リッチなライブラリ、エラーハンドリング容易
  3. Go - 型安全、テスト容易
- **選択したアプローチ**: Bash
- **理由**:
  - 既存の`validate-import.sh`との一貫性
  - 追加依存関係なし
  - CI/CDワークフローのコマンドを直接再利用可能
  - すべての開発者がすぐに使用可能
- **トレードオフ**: 複雑なエラーハンドリングは困難、テストが難しい

### Decision: 並列ビルド実装
- **コンテキスト**: Go Lambdaのビルドを並列化する方法
- **検討した代替案**:
  1. GNU Parallel - 強力だが追加依存
  2. Bash バックグラウンドジョブ (`&` + `wait`) - 標準的
  3. xargs -P - シンプル
  4. Makefile -j - 既存のMakefileを活用
- **選択したアプローチ**: Makefile `-j` オプション
- **理由**:
  - 既存の`go-functions/Makefile`を再利用
  - 依存関係管理が自動的
  - 追加実装不要
- **トレードオフ**: Makeに依存（ただし既に前提条件）

### Decision: 確認プロンプトの実装
- **コンテキスト**: 本番デプロイ前の確認方法
- **検討した代替案**:
  1. シンプルな y/n プロンプト
  2. 二重確認（prd環境のみ）
  3. 強制的なドライランモード
- **選択したアプローチ**: 二重確認（prd環境のみ）
- **理由**:
  - dev環境は迅速な開発サイクルを維持
  - prd環境は追加の安全対策が必要
  - GitHub Actionsのenvironment approvalを模倣
- **フォローアップ**: `--auto-approve`フラグで確認をスキップ可能

## リスクと緩和策
- **リスク1**: AWS認証情報の有効期限切れ
  - 緩和: スクリプト開始時に`aws sts get-caller-identity`で検証
- **リスク2**: ツールバージョンの不一致
  - 緩和: バージョンチェックと警告表示、`--strict-versions`オプション
- **リスク3**: 並列ビルドのエラーハンドリング
  - 緩和: Makefile使用時は`make`のエラー伝播に依存、失敗時は即時終了
- **リスク4**: 機密情報のログ出力
  - 緩和: SSM SecureStringは`echo`で表示しない、環境変数設定時にマスク

## 参照
- [AWS CLI SSM get-parameter](https://docs.aws.amazon.com/cli/latest/reference/ssm/get-parameter.html)
- [Terraform CLI Commands](https://developer.hashicorp.com/terraform/cli/commands)
- [Go Lambda Deployment](https://docs.aws.amazon.com/lambda/latest/dg/golang-handler.html)
- [Bash Best Practices](https://google.github.io/styleguide/shellguide.html)
