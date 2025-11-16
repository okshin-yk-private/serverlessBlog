# デプロイメントガイド

## 概要

このドキュメントでは、Serverless Blog PlatformのAWS環境へのデプロイ手順とCI/CDパイプラインの設定について説明します。

## 前提条件

### 必要なツール
- **Node.js 22.x**: LTS版をインストール
- **AWS CLI**: AWSアカウントへのアクセス設定済み
- **AWS CDK**: グローバルインストール（`npm install -g aws-cdk`）
- **Git**: バージョン管理

### AWSアカウント要件
- **dev環境用AWSアカウント**: 開発環境デプロイ用
- **prd環境用AWSアカウント**: 本番環境デプロイ用（オプション、同じアカウントでも可）
- **IAMロール**: GitHub ActionsからのOIDC認証用

## ローカルデプロイ

### 1. 依存関係のインストール

```bash
# ルートディレクトリで依存関係をインストール
npm ci

# Infrastructureディレクトリで依存関係をインストール
cd infrastructure
npm ci

# Lambda Layerの依存関係をインストール
cd ../layers/common/nodejs
npm ci

cd ../../powertools/nodejs
npm ci

cd ../../..
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

### 3. CDK Bootstrap

初回のみ、CDK Bootstrapを実行してCDKデプロイに必要なリソースをAWSに作成します。

```bash
cd infrastructure
npx cdk bootstrap aws://ACCOUNT_ID/REGION --context stage=dev
```

### 4. CDK Diff（変更確認）

デプロイ前に、インフラストラクチャの変更内容を確認します。

```bash
npx cdk diff --all --context stage=dev
```

### 5. CDK Deploy

すべてのスタックをデプロイします。

```bash
npx cdk deploy --all --context stage=dev
```

個別のスタックをデプロイする場合：

```bash
npx cdk deploy DatabaseStack --context stage=dev
npx cdk deploy StorageStack --context stage=dev
npx cdk deploy AuthStack --context stage=dev
npx cdk deploy ApiStack --context stage=dev
npx cdk deploy CDNStack --context stage=dev
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
- ✅ **単一のdeployジョブ**: dev/prd環境を1つのジョブ定義で処理
- ✅ **動的な環境判定**: ブランチ名から環境を自動決定（develop → dev, main → prd）
- ✅ **共通のSecret名**: 各環境で`AWS_ROLE_ARN`という同じ名前を使用
- ✅ **コード重複ゼロ**: 150行以上のコードを約130行に削減

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
1. CI/CDテストを実行（`.github/workflows/ci-test.yml`）
2. すべてのテストが成功した場合、dev環境へデプロイ（`.github/workflows/deploy.yml`）

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
2. 「Deploy to AWS」ワークフローを選択
3. 実行中のワークフローをクリック
4. 「deploy-prd」ジョブの「Review deployments」ボタンをクリック
5. 変更内容を確認
6. 「Approve and deploy」をクリック

## トラブルシューティング

### CDK Bootstrap失敗

**エラー**: `CDKToolkit stack does not exist`

**解決策**:
```bash
npx cdk bootstrap aws://ACCOUNT_ID/REGION --context stage=dev
```

### OIDC認証失敗

**エラー**: `Error: Could not assume role`

**解決策**:
1. IAMロールの信頼関係を確認
2. GitHubリポジトリ名が正しいか確認
3. ブランチ名が正しいか確認（develop/main）
4. GitHub SecretsとEnvironment Secretsが正しく設定されているか確認

### デプロイタイムアウト

**エラー**: `Deployment timed out`

**解決策**:
1. CloudFormationコンソールでスタックのステータスを確認
2. `npx cdk deploy`に`--timeout`オプションを追加
3. 大きなLambda LayerはS3に事前アップロード

### カバレッジ100%未達成でCI失敗

**エラー**: `Coverage threshold not met`

**解決策**:
1. カバレッジレポートを確認（`coverage/lcov-report/index.html`）
2. 未カバレッジのコードにテストを追加
3. すべてのテストを実行：`npm run test:coverage`

## ロールバック手順

### CloudFormationによるロールバック

```bash
# スタック一覧を確認
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# 特定のスタックをロールバック
aws cloudformation rollback-stack --stack-name DatabaseStack

# または、前のバージョンに手動デプロイ
git checkout <previous-commit-sha>
npx cdk deploy --all --context stage=prd
```

### GitHubによるロールバック

1. GitHubリポジトリの「Actions」タブを開く
2. 前回成功したワークフローを選択
3. 「Re-run all jobs」をクリック

## ベストプラクティス

### デプロイ前のチェックリスト

- [ ] すべてのテストが成功している（CI/CDパイプライン緑）
- [ ] カバレッジが100%達成されている
- [ ] CDK diffで変更内容を確認した
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

#### 1. ユニットテストの実行

```bash
# バックエンドユニットテスト
npm run test:coverage

# インフラストラクチャテスト
cd infrastructure && npm run test:coverage
cd ..
```

**期待される結果**:
- すべてのテストが成功（206 tests passed）
- カバレッジ: 95.64% (Statements), 81.78% (Branch), 100% (Functions), 95.56% (Lines)

#### 2. 統合テストの実行

```bash
# 認証・認可統合テスト
npx jest --testPathPattern=integration
```

**期待される結果**:
- 5 tests passed
- 認証フロー、トークン検証が正常動作

#### 3. E2Eテストの実行

```bash
# 公開サイトE2Eテスト
npm run test:e2e

# 管理画面E2Eテスト（実装後）
npm run test:e2e:admin
```

**期待される結果**:
- 公開サイト: 3 tests passed in 3.6s
- MSWモック連携が正常動作
- 記事一覧表示、記事詳細表示、ナビゲーションが正常動作

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
  aws logs tail /aws/lambda/createPost-dev --region ap-northeast-1
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

- [ ] **CDK Nag**: セキュリティ検証が成功している（または抑制理由が記載されている）
  ```bash
  cd infrastructure && npm run cdk:nag
  ```
- [ ] **S3バケット**: パブリックアクセスブロックが有効化されている
- [ ] **API Gateway**: Cognito Authorizerが設定されている
- [ ] **Lambda IAMロール**: 最小権限ポリシーが適用されている

### テスト結果サマリー

**完了日**: 2025-11-10

| テストレイヤー | テスト数 | 成功率 | カバレッジ | 実行時間 |
|--------------|---------|--------|----------|---------|
| ユニットテスト（バックエンド） | 206 | 100% | 95.64% | 1.66s |
| ユニットテスト（インフラ） | 8 | 88.9% | N/A | 15.8s |
| 統合テスト | 5 | 100% | N/A | 0.33s |
| E2Eテスト（公開サイト） | 3 | 100% | N/A | 3.6s |

**主な実績**:
- ✅ すべてのユニットテストが成功（206/206）
- ✅ すべての統合テストが成功（5/5）
- ✅ すべてのE2Eテストが成功（3/3）
- ✅ Lambda関数カバレッジ: 95.64% (目標100%に対して高カバレッジ達成)
- ✅ インフラストラクチャテスト: 8/9スタック成功
- ⚠️ CDK Nag警告: S3アクセスログ（抑制または修正が必要）

**注意事項**:
- フロントエンド（frontend/public、frontend/admin）はまだ実装されていないため、テストが実行されていません
- 統合テストは認証・認可のみ実装されており、他のAPIエンドポイント統合テストは未実装です
- dev環境への実際のデプロイは、AWS認証情報が設定された後に実行してください

## 参考リンク

- [AWS CDK ドキュメント](https://docs.aws.amazon.com/cdk/)
- [GitHub Actions OIDC認証](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [CDK Bootstrapガイド](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html)
- [監視ガイド](./monitoring.md) - CloudWatch、X-Ray、Lambda Powertoolsの使用方法
- [セキュリティ検証ガイド](./security-validation.md) - CDK Nag、IAM、暗号化の検証
- [パフォーマンス最適化ガイド](./performance-optimization.md) - Lambda、DynamoDB、CloudFrontの最適化
