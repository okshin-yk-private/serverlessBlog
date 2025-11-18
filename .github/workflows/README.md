# GitHub Actions ワークフロードキュメント

## 概要

このプロジェクトでは、条件付きトリガーを使用したCI/CDパイプラインを実装しています。

## ワークフロー一覧

### 1. deploy.yml - デプロイワークフロー（条件付きトリガー統合）

**目的**: インフラストラクチャとフロントエンドを条件付きでデプロイします。

**トリガー条件**:
- ブランチ: `develop` または `main`
- パス:
  - インフラ/バックエンド: `infrastructure/**`, `layers/**`, `functions/**`
  - フロントエンド: `frontend/public/**`, `frontend/admin/**`
  - ワークフロー: `.github/workflows/deploy.yml`

**ジョブ構成**:

#### 1. detect-changes
変更されたファイルパスを検出し、後続のジョブの実行条件を決定します。

**出力**:
- `infrastructure`: インフラ/バックエンド変更があるか（`true`/`false`）
- `frontend`: フロントエンド変更があるか（`true`/`false`）

#### 2. deploy-infrastructure
インフラストラクチャとバックエンド（Lambda関数）をデプロイします。

**実行条件**: `infrastructure` が `true` の場合のみ

**ステップ**:
1. Node.js 22 セットアップ
2. 依存関係のインストール（root, infrastructure, layers）
3. AWS OIDC認証
4. CDK Bootstrap
5. CDK Diff
6. CDK Deploy

#### 3. deploy-frontend
公開サイトと管理画面をS3にデプロイし、CloudFrontキャッシュを無効化します。

**実行条件**:
- `frontend` が `true` の場合、または
- `infrastructure` が `true` の場合（API変更に対応）
- `deploy-infrastructure` が成功またはスキップされた場合

**ステップ**:
1. Node.js 22 セットアップ
2. AWS OIDC認証
3. **公開サイト**:
   - 依存関係インストール
   - Vite Build（環境変数: `VITE_API_ENDPOINT`, `VITE_COGNITO_USER_POOL_ID`）
   - S3 Sync（キャッシュヘッダー設定）
   - CloudFront キャッシュ無効化
4. **管理画面**:
   - 依存関係インストール
   - Vite Build（環境変数: `VITE_API_ENDPOINT`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`）
   - S3 Sync（キャッシュヘッダー設定）
   - CloudFront キャッシュ無効化

### 2. ci-test.yml - テストワークフロー

**目的**: プルリクエスト時に自動テストを実行します。

**トリガー条件**: プルリクエスト作成時

**ジョブ構成**:
- ユニットテスト
- 統合テスト
- CDK Nag セキュリティ検証
- TypeScript コンパイル

## 環境変数とシークレット設定

### GitHub Secrets

各環境（`dev` / `prod`）の Environment Secrets に以下を設定してください。

#### AWS認証（必須）
- `AWS_ROLE_ARN`: AWS OIDC Role ARN（例: `arn:aws:iam::123456789012:role/GitHubActionsDeployRole`）

#### フロントエンド環境変数（必須）
- `API_ENDPOINT`: API Gateway エンドポイントURL（例: `https://api.example.com`）
- `COGNITO_USER_POOL_ID`: Cognito User Pool ID（例: `ap-northeast-1_aBcDeFgHi`）
- `COGNITO_CLIENT_ID`: Cognito App Client ID（管理画面のみ）

#### S3バケット名（必須）
- `PUBLIC_BUCKET_NAME`: 公開サイトS3バケット名（例: `my-blog-public-dev`）
- `ADMIN_BUCKET_NAME`: 管理画面S3バケット名（例: `my-blog-admin-dev`）

#### CloudFront Distribution ID（必須）
- `PUBLIC_DISTRIBUTION_ID`: 公開サイトCloudFront Distribution ID（例: `E1A2B3C4D5E6F7`）
- `ADMIN_DISTRIBUTION_ID`: 管理画面CloudFront Distribution ID（例: `E7F6E5D4C3B2A1`）

### GitHub Variables

リポジトリ全体の Variables に以下を設定してください。

- `AWS_REGION`: AWSリージョン（例: `ap-northeast-1`）

## デプロイフロー

### 開発環境（dev）へのデプロイ

1. `feature/*` ブランチで開発
2. `develop` ブランチへプルリクエスト作成
3. `ci-test.yml` でテスト実行
4. マージ後、`deploy.yml` が自動実行
   - 変更パス検出
   - 条件に応じてインフラ/フロントエンドデプロイ

### 本番環境（prd）へのデプロイ

1. `develop` ブランチから `main` ブランチへプルリクエスト作成
2. `ci-test.yml` でテスト実行
3. マージ後、`deploy.yml` が自動実行
   - Environment保護ルール適用（承認待機）
   - 承認後、デプロイ実行

## 条件付き実行の例

### ケース1: インフラ変更のみ

```bash
# infrastructure/lib/database-stack.ts を変更
git add infrastructure/lib/database-stack.ts
git commit -m "feat: DynamoDBテーブルにGSI追加"
git push origin develop
```

**実行されるジョブ**:
1. `detect-changes`: `infrastructure=true`, `frontend=false`
2. `deploy-infrastructure`: 実行される（CDKデプロイ）
3. `deploy-frontend`: 実行される（API変更に対応するため）

### ケース2: フロントエンド変更のみ

```bash
# frontend/public/src/App.tsx を変更
git add frontend/public/src/App.tsx
git commit -m "feat: ホームページUIを改善"
git push origin develop
```

**実行されるジョブ**:
1. `detect-changes`: `infrastructure=false`, `frontend=true`
2. `deploy-infrastructure`: スキップされる
3. `deploy-frontend`: 実行される（公開サイトのみビルド・デプロイ）

### ケース3: インフラとフロントエンド両方変更

```bash
# 両方変更
git add infrastructure/lib/api-stack.ts frontend/admin/src/pages/PostListPage.tsx
git commit -m "feat: 記事一覧APIとUIを改善"
git push origin develop
```

**実行されるジョブ**:
1. `detect-changes`: `infrastructure=true`, `frontend=true`
2. `deploy-infrastructure`: 実行される（CDKデプロイ）
3. `deploy-frontend`: 実行される（公開サイト・管理画面両方ビルド・デプロイ）

## キャッシュ戦略

### S3 デプロイ

#### 静的アセット（JS/CSS/画像）
- `Cache-Control: public,max-age=31536000,immutable`
- 1年間のブラウザキャッシュ
- ファイル名にハッシュが含まれるため安全

#### index.html
- `Cache-Control: public,max-age=0,must-revalidate`
- 即時更新
- 新しいアセットへの参照を常に最新に保つ

### CloudFront キャッシュ無効化

デプロイ後、全パス（`/*`）のキャッシュを無効化します。

**コスト**: 月1000リクエスト無料、超過時$0.005/リクエスト

## フロントエンドCI/CDパイプライン詳細（タスク9.3）

### 実装概要

Vite Build → S3 Sync → CloudFront Invalidation の3ステップでフロントエンドデプロイを実装しています。

### ステップ詳細

#### 1. Vite Build

**公開サイト** (`frontend/public`):
```yaml
- name: Build Public Site
  working-directory: frontend/public
  run: npm run build
  env:
    VITE_API_ENDPOINT: ${{ secrets.API_ENDPOINT }}
    VITE_COGNITO_USER_POOL_ID: ${{ secrets.COGNITO_USER_POOL_ID }}
```

**管理画面** (`frontend/admin`):
```yaml
- name: Build Admin Site
  working-directory: frontend/admin
  run: npm run build
  env:
    VITE_API_ENDPOINT: ${{ secrets.API_ENDPOINT }}
    VITE_COGNITO_USER_POOL_ID: ${{ secrets.COGNITO_USER_POOL_ID }}
    VITE_COGNITO_CLIENT_ID: ${{ secrets.COGNITO_CLIENT_ID }}
```

#### 2. S3 Sync

**公開サイト**:
```bash
# 静的アセット（JS/CSS/画像）を1年キャッシュ
aws s3 sync frontend/public/dist/ s3://${{ secrets.PUBLIC_BUCKET_NAME }}/ \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html" \
  --exclude "*.map"

# index.htmlは即時更新
aws s3 cp frontend/public/dist/index.html s3://${{ secrets.PUBLIC_BUCKET_NAME }}/ \
  --cache-control "public,max-age=0,must-revalidate"
```

**管理画面**: 同様のコマンドで `ADMIN_BUCKET_NAME` へデプロイ

**オプション説明**:
- `--delete`: S3バケット内の古いファイルを削除（変更ファイルのみアップロード）
- `--cache-control`: キャッシュ制御ヘッダーを設定
- `--exclude "index.html"`: index.htmlを除外（後で別途アップロード）
- `--exclude "*.map"`: ソースマップファイルを除外

#### 3. CloudFront Invalidation

**公開サイト**:
```bash
aws cloudfront create-invalidation \
  --distribution-id ${{ secrets.PUBLIC_DISTRIBUTION_ID }} \
  --paths "/*"
```

**管理画面**: 同様のコマンドで `ADMIN_DISTRIBUTION_ID` を無効化

**目的**: デプロイ後、CloudFrontキャッシュをクリアして即座に新バージョンを配信

**コスト**: 月1000リクエスト無料、超過時$0.005/リクエスト

### 環境変数設定

| 環境変数 | 用途 | 必須 |
|---------|------|------|
| `VITE_API_ENDPOINT` | API Gateway エンドポイントURL | ✓ |
| `VITE_COGNITO_USER_POOL_ID` | Cognito User Pool ID | ✓ |
| `VITE_COGNITO_CLIENT_ID` | Cognito App Client ID | ✓（Admin） |
| `PUBLIC_BUCKET_NAME` | 公開サイトS3バケット名 | ✓ |
| `ADMIN_BUCKET_NAME` | 管理画面S3バケット名 | ✓ |
| `PUBLIC_DISTRIBUTION_ID` | 公開サイトCloudFront Distribution ID | ✓ |
| `ADMIN_DISTRIBUTION_ID` | 管理画面CloudFront Distribution ID | ✓ |

### パフォーマンス最適化

#### Cache-Control戦略

| ファイルタイプ | Cache-Control | 理由 |
|-------------|---------------|------|
| index.html | `max-age=0,must-revalidate` | 即時更新、常に最新バージョン取得 |
| JS/CSS/画像 | `max-age=31536000,immutable` | 1年キャッシュ、ファイル名にハッシュ付き |

#### デプロイ時間短縮

- **S3 Sync**: 変更ファイルのみアップロード（`--delete`オプション）
- **CloudFront Invalidation**: キャッシュクリアで即座に新バージョン配信
- **並列実行**: Public SiteとAdmin Siteは順次実行（依存関係なし）

### 設計原則

- **設計決定7（条件付きCI/CDワークフロー実行）**: パストリガーでフロントエンド変更を検出し、条件付き実行
- **設計決定8（フロントエンドCI/CDパイプライン統合）**: Vite Build → S3 Sync → CloudFront Invalidation の3ステップ統合

### 要件トレーサビリティ

- **R31**: GitHub Actions CI/CD ワークフロー
- **R33**: 公開ブログサイト（フロントエンド）機能
- **R34**: 管理画面（フロントエンド）機能

## トラブルシューティング

### ワークフローが実行されない

1. **パストリガー確認**: 変更したファイルが `on.push.paths` に含まれているか確認
2. **ブランチ確認**: `develop` または `main` ブランチにプッシュしたか確認

### deploy-infrastructure がスキップされる

- フロントエンドのみ変更した場合、インフラデプロイはスキップされます（意図的な動作）

### deploy-frontend が失敗する

#### Vite Buildエラー

**症状**: `npm run build` が失敗する

**原因と解決策**:
1. **環境変数未設定**: `API_ENDPOINT`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` が正しく設定されているか確認
2. **依存関係エラー**: `package-lock.json` が最新か確認、`npm ci` でクリーンインストール
3. **ローカルビルド確認**: ローカル環境で `npm run build` が成功するか確認

#### S3デプロイエラー

**症状**: `The specified bucket does not exist`

**原因と解決策**:
1. **バケット名確認**: `PUBLIC_BUCKET_NAME`, `ADMIN_BUCKET_NAME` が正しいか確認
2. **CDKデプロイ確認**: `deploy-infrastructure` が成功し、S3バケットが作成されているか確認
3. **IAM権限確認**: AWS_ROLE_ARNのIAM RoleにS3バケットへのアクセス権限があるか確認

#### CloudFront Invalidationエラー

**症状**: `The specified distribution does not exist`

**原因と解決策**:
1. **Distribution ID確認**: `PUBLIC_DISTRIBUTION_ID`, `ADMIN_DISTRIBUTION_ID` が正しいか確認
2. **CDKデプロイ確認**: CloudFront Distributionが作成されているか確認
3. **IAM権限確認**: CloudFront Invalidation権限（`cloudfront:CreateInvalidation`）があるか確認

### OIDC認証エラー

1. **AWS_ROLE_ARN確認**: 正しいRole ARNが設定されているか
2. **IAMロール確認**: GitHubからのOIDC認証が許可されているか
3. **信頼ポリシー確認**: IAMロールの信頼ポリシーにGitHub Actionsが含まれているか

## 参考資料

- [GitHub Actions: on.push.paths](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#onpushpull_requestpull_request_targetpathspaths-ignore)
- [AWS OIDC for GitHub Actions](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [AWS CLI s3 sync](https://docs.aws.amazon.com/cli/latest/reference/s3/sync.html)
- [CloudFront Invalidation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html)
