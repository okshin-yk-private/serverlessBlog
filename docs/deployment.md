# デプロイメントガイド

> **⚠️ 要更新**: このドキュメントの多くのセクションはCDK時代のものです。
> 現在のインフラはTerraformで管理されています（`terraform/` ディレクトリ参照）。
> バックエンドはGo Lambda（`go-functions/`）、パッケージマネージャーはBunを使用しています。

## 概要

このドキュメントでは、Serverless Blog PlatformのAWS環境へのデプロイ手順とCI/CDパイプラインの設定について説明します。

## 前提条件

### 必要なツール
- **Bun**: パッケージマネージャー兼ランタイム
- **Go 1.25.x**: Lambda関数のビルド
- **Terraform**: インフラストラクチャ管理
- **AWS CLI**: AWSアカウントへのアクセス設定済み
- **Git**: バージョン管理

### AWSアカウント要件
- **dev環境用AWSアカウント**: 開発環境デプロイ用
- **prd環境用AWSアカウント**: 本番環境デプロイ用（オプション、同じアカウントでも可）
- **IAMロール**: GitHub ActionsからのOIDC認証用

## ローカルデプロイ

### 1. 依存関係のインストール

```bash
# Go Lambda関数の依存関係
cd go-functions
go mod download
cd ..

# フロントエンドの依存関係
cd frontend/admin
bun install

cd ../public-astro
bun install
cd ../..
```

### 2. AWS認証情報の設定

```bash
# AWS CLIプロファイルを設定
aws configure --profile dev

# または環境変数を設定
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=ap-northeast-1
```

### 3. Go Lambda関数のビルド

```bash
cd go-functions

# 全Lambda関数をビルド（arm64 / Amazon Linux 2023用）
make build

# または個別にビルド
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 \
  go build -trimpath -ldflags="-s -w" -tags="lambda.norpc" \
  -o bin/posts-create/bootstrap ./cmd/posts/create
```

### 4. Terraform Init（初回のみ）

```bash
cd terraform/environments/dev
terraform init
```

### 5. Terraform Plan（変更確認）

デプロイ前に、インフラストラクチャの変更内容を確認します。

```bash
terraform plan
```

### 6. Terraform Apply（デプロイ）

```bash
terraform apply
```

個別モジュールを対象にする場合：

```bash
terraform apply -target=module.database
terraform apply -target=module.lambda
terraform apply -target=module.api
terraform apply -target=module.cdn
```

## CI/CDパイプライン設定

### GitHub OIDC認証の設定

GitHub ActionsからAWSへ安全に認証するため、OIDC（OpenID Connect）を使用します。

> **OIDC認証の仕組み**: GitHub Actionsワークフロー内で`aws-actions/configure-aws-credentials@v4`アクションを使用することで、長期的なアクセスキーを保存せずに、短期的なAWS認証情報を自動的に取得できます。ワークフロー実行時にGitHubが発行するOIDCトークンを使用して、AWSのSTSサービスからセッション認証情報を取得します。

**設定済みの機能**:
- ✅ `.github/workflows/deploy.yml`でOIDC認証を設定済み
- ✅ `permissions: id-token: write`でOIDCトークン取得権限を付与
- ✅ AWS STSで現在のアカウントIDを自動取得
- ✅ セキュアな短期セッション認証（role-session-name付き）

#### 1. AWS IAMでOIDCプロバイダーを作成

1. AWSコンソールでIAMサービスを開く
2. 「IDプロバイダー」→「プロバイダーを追加」をクリック
3. 以下の設定でOIDCプロバイダーを作成：
   - **プロバイダーのタイプ**: OpenID Connect
   - **プロバイダーのURL**: `https://token.actions.githubusercontent.com`
   - **対象者**: `sts.amazonaws.com`

#### 2. IAMロールの作成

##### dev環境用IAMロール

1. AWSコンソールでIAMサービスを開く
2. 「ロール」→「ロールを作成」をクリック
3. 信頼されたエンティティタイプ：「ウェブアイデンティティ」を選択
4. IDプロバイダー：`token.actions.githubusercontent.com` を選択
5. Audience：`sts.amazonaws.com` を選択
6. 「次へ」をクリック
7. 以下のポリシーをアタッチ：
   - `AdministratorAccess`（開発環境の場合）
   - または、最小権限ポリシー（後述）
8. ロール名：`GitHubActions-Deploy-Dev-Role`
9. 信頼関係を編集して、GitHubリポジトリを指定：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/YOUR_REPO:ref:refs/heads/develop"
        }
      }
    }
  ]
}
```

##### prd環境用IAMロール

同様の手順でprd環境用のIAMロールを作成します。信頼関係の`sub`条件を`main`ブランチに変更：

```json
"token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/YOUR_REPO:ref:refs/heads/main"
```

#### 2. GitHub Variables の設定

1. GitHubリポジトリの「Settings」→「Secrets and variables」→「Actions」を開く
2. 「Variables」タブで以下の変数を追加：
   - **Name**: `AWS_REGION`
   - **Value**: `ap-northeast-1`（または使用するリージョン）

> **Note**: AWS Account IDはワークフロー内でOIDC認証後に自動的に取得されるため、Secretsに保存する必要はありません。

#### 3. GitHub Environmentsの設定

> **DRY原則**: 各環境に同じ名前（`AWS_ROLE_ARN`）のSecretを設定することで、ワークフロー定義を簡潔に保ちます。

##### dev環境

1. GitHubリポジトリの「Settings」→「Environments」を開く
2. 「New environment」をクリック
3. Name: `dev`
4. 「Configure environment」をクリック
5. 「Environment secrets」で以下のシークレットを追加：
   - **Name**: `AWS_ROLE_ARN`
   - **Value**: dev環境のIAMロールARN（例: `arn:aws:iam::123456789012:role/GitHubActions-Deploy-Dev-Role`）

##### prd環境

1. Name: `prd`
2. 「Environment protection rules」を有効化：
   - ☑ **Required reviewers**: レビュアーを追加（承認者）
   - ☑ **Wait timer**: 必要に応じて待機時間を設定（例: 5分）
3. 「Environment secrets」で以下のシークレットを追加：
   - **Name**: `AWS_ROLE_ARN`（dev環境と同じ名前）
   - **Value**: prd環境のIAMロールARN（例: `arn:aws:iam::987654321098:role/GitHubActions-Deploy-Prd-Role`）

**ポイント**:
- 両環境で同じSecret名（`AWS_ROLE_ARN`）を使用
- ワークフロー内でEnvironment名が動的に決定される（develop → dev, main → prd）
- 各Environmentから適切なARNが自動的に読み込まれる

## デプロイワークフロー

### ワークフローの特徴（DRY原則）

`.github/workflows/deploy.yml`は、DRY（Don't Repeat Yourself）原則に基づいて設計されています：

**主な特徴**:
- ✅ **Terraform管理インフラ**: dev/prd環境を`terraform/environments/`で管理
- ✅ **Go Lambdaビルド**: 並列マトリクスビルドで高速化
- ✅ **動的な環境判定**: ブランチ名から環境を自動決定（develop → dev, main → prd）
- ✅ **共通のSecret名**: 各環境で`AWS_ROLE_ARN`という同じ名前を使用

**動作フロー**:
```
develop ブランチ push → Environment: dev → secrets.AWS_ROLE_ARN (dev環境のARN)
main ブランチ push → Environment: prd → secrets.AWS_ROLE_ARN (prd環境のARN) + 手動承認
```

### 自動デプロイフロー

#### dev環境へのデプロイ

```bash
# developブランチにコミットをプッシュ
git checkout develop
git add .
git commit -m "feat: 新機能の追加"
git push origin develop
```

GitHub Actionsが自動的に：
1. CI/CDテストを実行（`.github/workflows/ci.yml`）
2. すべてのテストが成功した場合、dev環境へデプロイ（`.github/workflows/deploy.yml`）
   - Go Lambdaビルド（並列マトリクス）
   - `terraform apply` in `terraform/environments/dev`
   - フロントエンドビルド・S3デプロイ

#### prd環境へのデプロイ

```bash
# mainブランチにマージ（プルリクエスト経由を推奨）
git checkout main
git merge develop
git push origin main
```

GitHub Actionsが自動的に：
1. CI/CDテストを実行
2. すべてのテストが成功した場合、**手動承認待機**
3. 承認者がGitHub ActionsのUIで「Approve」をクリック
4. prd環境へデプロイ

### 手動承認の手順

1. GitHubリポジトリの「Actions」タブを開く
2. 「Deploy」ワークフローを選択
3. 実行中のワークフローをクリック
4. 「deploy-infrastructure-prd」ジョブの「Review deployments」ボタンをクリック
5. 変更内容を確認
6. 「Approve and deploy」をクリック

## トラブルシューティング

### Terraform Init失敗

**エラー**: `Failed to install provider`

**解決策**:
```bash
cd terraform/environments/dev
terraform init -upgrade
```

### OIDC認証失敗

**エラー**: `Error: Could not assume role`

**解決策**:
1. IAMロールの信頼関係を確認
2. GitHubリポジトリ名が正しいか確認
3. ブランチ名が正しいか確認（develop/main）
4. GitHub SecretsとEnvironment Secretsが正しく設定されているか確認

### Goビルド失敗

**エラー**: `go: no module provides package`

**解決策**:
```bash
cd go-functions
go mod tidy
go mod download
```

### カバレッジ未達成でCI失敗

**エラー**: `coverage: X.X% of statements`

**解決策**:
1. Go Lambda関数のカバレッジレポートを確認：
   ```bash
   cd go-functions
   go test ./... -coverprofile=coverage.out
   go tool cover -html=coverage.out -o coverage.html
   ```
2. 未カバレッジのコードにテストを追加
3. フロントエンドのカバレッジ確認：
   ```bash
   cd frontend/admin
   bun run test:coverage
   ```

## ロールバック手順

### Terraformによるロールバック

```bash
# 前のバージョンのstateに戻す
git checkout <previous-commit-sha>
cd terraform/environments/dev
terraform apply
```

### GitHubによるロールバック

1. GitHubリポジトリの「Actions」タブを開く
2. 前回成功したワークフローを選択
3. 「Re-run all jobs」をクリック

## ベストプラクティス

### デプロイ前のチェックリスト

- [ ] すべてのテストが成功している（CI/CDパイプライン緑）
- [ ] Goカバレッジが90%以上達成されている
- [ ] `terraform plan`で変更内容を確認した
- [ ] dev環境で動作確認が完了している
- [ ] プルリクエストがレビュー・承認されている

### セキュリティ

- IAMロールは最小権限の原則に従う
- GitHub Secretsは暗号化されている
- OIDC認証を使用し、長期的なアクセスキーを避ける
- 本番環境へのデプロイは必ず手動承認を経る

### 監視とアラート

- CloudWatchダッシュボードで各環境のメトリクスを監視
- CloudWatchアラームでエラー率をトラッキング
- X-Rayでパフォーマンスボトルネックを特定

## 最終統合テストとデプロイメント検証

### テストスイート実行

デプロイ前に、完全なテストスイートを実行して、すべてのコンポーネントが正常に動作することを確認します。

#### 1. Go Lambda関数のテスト

```bash
cd go-functions
go test ./... -v -coverprofile=coverage.out
```

**期待される結果**:
- すべてのテストが成功
- カバレッジ: 90%以上

#### 2. フロントエンドテストの実行

```bash
# 管理画面ユニットテスト
cd frontend/admin
bun run test:coverage
```

**期待される結果**:
- すべてのテストが成功
- カバレッジ: 100%

#### 3. E2Eテストの実行

```bash
# 公開サイトE2Eテスト
bun run test:e2e

# 管理画面E2Eテスト
bun run test:e2e:admin
```

**期待される結果**:
- 公開サイト・管理画面のE2Eテストがすべて成功
- Playwright Chromiumブラウザで検証済み

### デプロイメント検証チェックリスト

dev環境へのデプロイ後、以下の項目を確認します。

#### インフラストラクチャ検証

- [ ] **DynamoDB**: BlogPostsテーブルが作成されている
  ```bash
  aws dynamodb describe-table --table-name BlogPosts-dev --region ap-northeast-1
  ```
- [ ] **S3バケット**: 画像ストレージ、公開サイト、管理画面バケットが作成されている
  ```bash
  aws s3 ls | grep blog
  ```
- [ ] **Lambda関数**: すべてのLambda関数がデプロイされている
  ```bash
  aws lambda list-functions --region ap-northeast-1 | grep blog
  ```
- [ ] **API Gateway**: REST APIが作成されている
  ```bash
  aws apigateway get-rest-apis --region ap-northeast-1
  ```
- [ ] **CloudFront**: ディストリビューションが作成され、有効化されている
  ```bash
  aws cloudfront list-distributions --region ap-northeast-1
  ```
- [ ] **Cognito**: User Poolが作成されている
  ```bash
  aws cognito-idp list-user-pools --max-results 10 --region ap-northeast-1
  ```

#### サービス稼働確認

- [ ] **API Gateway**: ヘルスチェックエンドポイントが200を返す
  ```bash
  curl -i https://YOUR_API_GATEWAY_URL/health
  ```
- [ ] **Lambda関数**: CloudWatch Logsにログが出力されている
  ```bash
  aws logs tail /aws/lambda/posts-create-dev --region ap-northeast-1
  ```
- [ ] **DynamoDB**: テーブルへの読み書きが成功する
  ```bash
  aws dynamodb put-item --table-name BlogPosts-dev \
    --item '{"id":{"S":"test-id"},"title":{"S":"Test Post"},...}'
  ```
- [ ] **S3**: 画像アップロードが成功する
  ```bash
  aws s3 cp test-image.jpg s3://blog-images-dev/test-image.jpg
  ```
- [ ] **CloudFront**: CDN経由で画像にアクセスできる
  ```bash
  curl -I https://YOUR_CLOUDFRONT_URL/test-image.jpg
  ```

#### 監視・ロギング検証

- [ ] **CloudWatch Logs**: すべてのLambda関数でログが出力されている
- [ ] **X-Ray**: トレーシングデータが記録されている
- [ ] **CloudWatch Metrics**: Lambda関数のメトリクス（実行時間、エラー率）が記録されている
- [ ] **CloudWatch Alarms**: アラームが設定されている（エラー率、実行時間、スロットル）

#### セキュリティ検証

- [ ] **Checkov/Trivy**: セキュリティスキャンが成功している
  ```bash
  cd terraform && checkov -d .
  ```
- [ ] **S3バケット**: パブリックアクセスブロックが有効化されている
- [ ] **API Gateway**: Cognito Authorizerが設定されている
- [ ] **Lambda IAMロール**: 最小権限ポリシーが適用されている

## 参考リンク

- [Terraform ドキュメント](https://developer.hashicorp.com/terraform/docs)
- [GitHub Actions OIDC認証](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [監視ガイド](./monitoring.md) - CloudWatch、X-Ray、Lambda Powertoolsの使用方法
- [セキュリティ検証ガイド](./security-validation.md) - Checkov、Trivy、IAM、暗号化の検証
- [パフォーマンス最適化ガイド](./performance-optimization.md) - Lambda、DynamoDB、CloudFrontの最適化
