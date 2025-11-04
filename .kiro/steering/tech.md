# Technical Steering

## アーキテクチャ原則

### 1. サーバーレスファースト
- すべてのコンポーネントをサーバーレスで実装
- マネージドサービスを最大限活用
- インフラ管理負荷の最小化

### 2. Infrastructure as Code
- AWS CDKによるインフラ定義
- バージョン管理とコードレビュー
- 再現可能なデプロイ

### 3. セキュリティバイデザイン
- 最小権限の原則（IAM）
- データ暗号化（転送中・保管中）
- セキュリティスキャン（CDK Nag）

### 4. 監視可能性
- 構造化ログ（Lambda Powertools）
- 分散トレーシング（X-Ray）
- メトリクスとアラート（CloudWatch）

### 5. テスト駆動開発
- ユニットテスト、統合テスト、E2Eテスト
- 高いテストカバレッジ（80%以上）
- CI/CDパイプラインでの自動テスト

## 技術スタック詳細

### Infrastructure as Code
- **AWS CDK v2**: TypeScriptによるインフラ定義
- **CDK Nag**: セキュリティとベストプラクティスの検証

### ランタイム
- **Node.js 22.x**: 最新のLTS版を使用
- **TypeScript**: 型安全な開発

### データベース
- **Amazon DynamoDB**:
  - オンデマンド課金モード
  - Global Secondary Indexes (GSI)
  - ポイントインタイムリカバリ
  - 適切なパーティションキー設計

### ストレージ
- **Amazon S3**:
  - バージョニング有効化
  - ライフサイクルポリシー
  - SSE-S3暗号化
  - パブリックアクセスブロック

### コンピューティング
- **AWS Lambda**:
  - Node.js 22.x ランタイム
  - Lambda Layers（Powertools、共通ライブラリ）
  - 環境変数による設定管理
  - VPC不使用（レイテンシ最適化）

### API
- **Amazon API Gateway**:
  - REST API
  - Lambda統合
  - Cognito認証
  - CORS設定

### 認証
- **Amazon Cognito**:
  - User Pool
  - アプリクライアント
  - MFA サポート

### CDN・配信
- **Amazon CloudFront**:
  - S3オリジン
  - カスタムドメイン
  - SSL/TLS証明書
  - キャッシング戦略

### 監視・ログ
- **Lambda Powertools**:
  - Logger: 構造化ログ
  - Tracer: 分散トレーシング
  - Metrics: カスタムメトリクス
- **CloudWatch**: ログ集約とアラート
- **X-Ray**: パフォーマンス分析

### CI/CD
- **GitHub Actions**:
  - 自動テスト実行
  - CDKデプロイ
  - 環境別デプロイ（dev/prd）
- **OIDC認証**: AWS認証情報の安全な管理

## データモデル設計

### DynamoDB テーブル: BlogPosts

#### プライマリキー
- **Partition Key**: `id` (String) - 記事のUUID
- **Billing Mode**: PAY_PER_REQUEST

#### 属性
- `id`: 記事ID（UUID）
- `title`: タイトル
- `content`: 本文（Markdown）
- `category`: カテゴリ
- `tags`: タグ配列
- `publishStatus`: 公開ステータス（draft/published）
- `authorId`: 著者ID
- `createdAt`: 作成日時（ISO8601）
- `updatedAt`: 更新日時（ISO8601）
- `publishedAt`: 公開日時（ISO8601）
- `imageUrls`: 画像URL配列

#### Global Secondary Indexes

##### CategoryIndex
- **Partition Key**: `category`
- **Sort Key**: `createdAt`
- **Projection**: ALL
- **用途**: カテゴリ別記事一覧の取得

##### PublishStatusIndex
- **Partition Key**: `publishStatus`
- **Sort Key**: `createdAt`
- **Projection**: ALL
- **用途**: 公開/下書き記事の一覧取得

## API設計

### 認証API
- `POST /auth/login` - ログイン
- `POST /auth/logout` - ログアウト
- `POST /auth/refresh` - トークン更新

### 記事API
- `GET /posts` - 記事一覧取得（ページネーション）
- `GET /posts/:id` - 記事詳細取得
- `POST /posts` - 記事作成（認証必須）
- `PUT /posts/:id` - 記事更新（認証必須）
- `DELETE /posts/:id` - 記事削除（認証必須）

### カテゴリAPI
- `GET /categories` - カテゴリ一覧取得
- `GET /categories/:category/posts` - カテゴリ別記事一覧

### 画像API
- `POST /images/upload-url` - Pre-signed URL取得（認証必須）

## セキュリティ対策

### 1. 認証・認可
- Cognito User Poolによる認証
- JWT トークンによる認可
- API Gateway のCognito Authorizer

### 2. データ保護
- S3: SSE-S3 暗号化
- DynamoDB: 保管時の暗号化（デフォルト）
- HTTPS通信の強制

### 3. アクセス制御
- S3: パブリックアクセスブロック
- IAM: 最小権限の原則
- VPC: 不要（Lambda外部接続でレイテンシ削減）

### 4. 入力検証
- API Gateway: リクエストバリデーション
- Lambda: 入力サニタイゼーション
- XSS対策: DOMPurifyによるHTML浄化

### 5. 監査
- CloudTrail: API呼び出しログ
- CloudWatch Logs: アプリケーションログ
- X-Ray: トレース情報

## パフォーマンス最適化

### 1. Lambda最適化
- 適切なメモリサイズ設定
- Provisioned Concurrency（必要に応じて）
- Lambda Layersによるコード共有

### 2. データベース最適化
- GSIによるクエリ最適化
- バッチ操作の活用
- DynamoDB Streams（イベント駆動）

### 3. CDN最適化
- CloudFront キャッシング
- 適切なCache-Control ヘッダー
- Gzip/Brotli圧縮

### 4. 画像最適化
- S3 ライフサイクルポリシー
- CloudFront での画像配信
- 適切な画像フォーマット

## 開発ワークフロー

### ブランチ戦略
- `main`: 本番環境
- `develop`: 開発環境
- `feature/*`: 機能開発ブランチ

### デプロイフロー
1. `feature/*` → `develop`: 自動デプロイ（dev環境）
2. `develop` → `main`: PR作成 → レビュー → 承認後デプロイ（prd環境）

### テスト戦略
1. **ユニットテスト**: Jest
2. **統合テスト**: CDK統合テスト
3. **E2Eテスト**: API エンドポイントテスト

## コスト最適化

### 1. サーバーレスの活用
- 使用量に応じた課金
- アイドル時のコストゼロ

### 2. ストレージ最適化
- S3 ライフサイクルポリシー
- 不要なバージョンの削除

### 3. DynamoDB最適化
- オンデマンドモード
- 適切なTTL設定

### 4. CloudWatch最適化
- ログ保持期間の設定
- 不要なメトリクスの削減

## 技術的負債管理

### 定期的なメンテナンス
1. 依存パッケージの更新
2. CDKバージョンのアップグレード
3. Node.jsランタイムの更新
4. セキュリティパッチの適用

### コード品質
1. ESLintによる静的解析
2. Prettierによるコードフォーマット
3. TypeScript strictモード
4. コードレビュー必須
