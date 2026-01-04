# Rust Lambda Functions

AWS Lambda関数のRust実装。サーバーレスブログプラットフォームのバックエンド。

## 前提条件

### 必須ツール

1. **Rust 1.83** (stable)
   ```bash
   # rust-toolchain.tomlで自動管理
   rustup install stable
   ```

2. **Cargo Lambda** (ビルド・テスト用CLI)
   ```bash
   cargo install cargo-lambda
   ```

3. **Zig 0.13.0+** (クロスコンパイル用)
   ```bash
   # macOS
   brew install zig

   # Ubuntu/Debian
   snap install zig --classic

   # またはダウンロード
   curl -L https://ziglang.org/download/0.13.0/zig-linux-x86_64-0.13.0.tar.xz | tar -xJ
   export PATH="$PWD/zig-linux-x86_64-0.13.0:$PATH"
   ```

4. **ARM64ターゲット** (クロスコンパイル用)
   ```bash
   rustup target add aarch64-unknown-linux-musl
   ```

## プロジェクト構造

```
rust-functions/
├── Cargo.toml           # ワークスペース定義
├── rust-toolchain.toml  # Rustツールチェーン設定
├── common/              # 共有ライブラリ
│   └── src/
│       ├── lib.rs
│       ├── types.rs
│       ├── markdown.rs
│       ├── tracing_config.rs
│       └── error.rs
├── posts/               # 記事ドメイン
│   ├── create_post/
│   ├── get_post/
│   ├── get_public_post/
│   ├── list_posts/
│   ├── update_post/
│   └── delete_post/
├── auth/                # 認証ドメイン
│   ├── login/
│   ├── logout/
│   └── refresh/
└── images/              # 画像ドメイン
    ├── get_upload_url/
    └── delete_image/
```

## ビルド

### ローカル開発

```bash
# 全パッケージをチェック
cargo check --workspace

# 単一関数をビルド
cargo build -p create_post

# 全パッケージをビルド
cargo build --workspace
```

### Lambda用ビルド（ARM64）

```bash
# 単一関数
cargo lambda build --release --arm64 -p create_post

# 全関数を個別ビルド（推奨）
./scripts/build-lambda.sh

# ビルド結果確認
ls -la target/lambda/
```

### ビルド出力

ビルド後、各関数は`target/lambda/{関数名}/bootstrap`に出力されます：

```
target/lambda/
├── create_post/
│   └── bootstrap    # Lambda実行バイナリ
├── get_post/
│   └── bootstrap
├── login/
│   └── bootstrap
...
```

## テスト

### ユニットテスト

```bash
# ユニットテスト実行
cargo test --workspace

# 単一パッケージのテスト
cargo test -p common

# リリースビルドでテスト
cargo test --workspace --release
```

### 統合テスト

統合テストはDynamoDB LocalとLocalStackを使用して実際のAWSサービスとの連携をテストします。

#### 前提条件

- **Docker**: DynamoDB LocalとLocalStack用
- **AWS CLI**: テーブル作成とCognito設定用

#### クイック実行

```bash
# 統合テストを実行（Docker起動から実行まで自動化）
./scripts/run-integration-tests.sh
```

スクリプトは以下を自動で実行します：
1. DynamoDB LocalとLocalStackのDocker Compose起動
2. DynamoDBテーブル（BlogPosts）の作成
3. Cognito User PoolとClientの作成
4. 環境変数の設定
5. 統合テストの実行
6. コンテナのクリーンアップ

#### 手動実行

```bash
# 1. Dockerコンテナを起動
docker compose up -d

# 2. DynamoDBテーブルを作成
aws dynamodb create-table \
    --endpoint-url http://localhost:8000 \
    --table-name BlogPosts \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=category,AttributeType=S \
        AttributeName=publishStatus,AttributeType=S \
        AttributeName=createdAt,AttributeType=S \
    --key-schema AttributeName=id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --global-secondary-indexes \
        "[{\"IndexName\":\"CategoryIndex\",\"KeySchema\":[{\"AttributeName\":\"category\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"createdAt\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}},{\"IndexName\":\"PublishStatusIndex\",\"KeySchema\":[{\"AttributeName\":\"publishStatus\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"createdAt\",\"KeyType\":\"RANGE\"}],\"Projection\":{\"ProjectionType\":\"ALL\"}}]" \
    --region us-east-1

# 3. 環境変数を設定
export DYNAMODB_ENDPOINT=http://localhost:8000
export S3_ENDPOINT=http://localhost:4566
export COGNITO_ENDPOINT=http://localhost:4566
export TABLE_NAME=BlogPosts
export BUCKET_NAME=serverless-blog-images
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1

# 4. 統合テストを実行
cargo test --test integration_tests --features integration -- --ignored

# 5. コンテナを停止
docker compose down
```

#### テストカバレッジ

統合テストは以下の操作をカバーします：

**DynamoDB (10テスト)**
- CRUD操作（PutItem, GetItem, UpdateItem, DeleteItem）
- CategoryIndex/PublishStatusIndexへのクエリ
- ページネーション（limit, ExclusiveStartKey）
- バッチ書き込み、トランザクション
- 条件付き書き込み、スキャン

**S3 (9テスト)**
- オブジェクトのPut/Get/Delete
- Pre-signed URL生成（PUT/GET）
- バッチ削除（DeleteObjects）
- オブジェクト一覧（prefix付き）
- オブジェクトコピー、メタデータ

**Cognito (10テスト)**
- User Pool/Client作成
- ユーザー作成、パスワード設定
- InitiateAuth（USER_PASSWORD_AUTH）
- トークン更新（REFRESH_TOKEN_AUTH）
- GlobalSignOut
- 認証エラー（不正なパスワード、存在しないユーザー）

## ローカル開発

### クイックスタート

1. 環境変数を設定:
   ```bash
   cp .env.local .env
   ```

2. 関数をウォッチモードで起動:
   ```bash
   ./scripts/local-dev.sh create_post
   ```

3. 別ターミナルから関数を呼び出し:
   ```bash
   ./scripts/invoke-local.sh create_post
   ```

### Cargo Lambda Watch（ホットリロード）

コード変更時に自動リビルドする開発環境。

```bash
# 専用スクリプトを使用（環境変数自動読み込み）
./scripts/local-dev.sh create_post 9000

# または直接コマンドを実行
cargo lambda watch -p create_post --port 9000
```

**スクリプトオプション:**
- 第1引数: 関数名（デフォルト: `create_post`）
- 第2引数: ポート番号（デフォルト: `9000`）

```bash
# 複数の関数を並行して開発（別ターミナルで実行）
./scripts/local-dev.sh create_post 9000
./scripts/local-dev.sh login 9001
./scripts/local-dev.sh get_upload_url 9002
```

### ローカル呼び出し（cargo lambda invoke）

テストイベントを使用して関数を呼び出し。

```bash
# 専用スクリプトを使用（環境変数自動読み込み）
./scripts/invoke-local.sh create_post

# カスタムイベントファイルを指定
./scripts/invoke-local.sh create_post events/custom_event.json

# または直接コマンドを実行
cargo lambda invoke create_post --data-file events/create_post.json
```

### テストイベントファイル

`events/`ディレクトリに各関数用のテストイベントJSONファイルが用意されています：

| 関数 | イベントファイル | 説明 |
|-----|-----------------|------|
| create_post | `events/create_post.json` | 記事作成リクエスト |
| get_post | `events/get_post.json` | 記事取得（認証必須） |
| get_public_post | `events/get_public_post.json` | 公開記事取得 |
| list_posts | `events/list_posts.json` | 記事一覧取得 |
| update_post | `events/update_post.json` | 記事更新 |
| delete_post | `events/delete_post.json` | 記事削除 |
| login | `events/login.json` | ログイン |
| logout | `events/logout.json` | ログアウト |
| refresh | `events/refresh.json` | トークン更新 |
| get_upload_url | `events/get_upload_url.json` | Pre-signed URL取得 |
| delete_image | `events/delete_image.json` | 画像削除 |

**イベントフォーマット（API Gateway v2）:**

```json
{
  "version": "2.0",
  "routeKey": "POST /admin/posts",
  "rawPath": "/admin/posts",
  "headers": {
    "content-type": "application/json"
  },
  "requestContext": {
    "authorizer": {
      "claims": {
        "sub": "test-user-123",
        "email": "test@example.com"
      }
    },
    "http": {
      "method": "POST",
      "path": "/admin/posts"
    }
  },
  "body": "{\"title\":\"Test Post\",\"content_markdown\":\"# Hello\",\"category\":\"tech\"}"
}
```

### LocalStack連携

ローカル開発時はLocalStackを使用してAWSサービスをエミュレートします。

**1. LocalStackの起動:**

```bash
# プロジェクトルートから
docker-compose up -d localstack
```

**2. 環境変数の設定:**

`.env.local`ファイルを`.env`にコピーして使用：

```bash
cp .env.local .env
```

`.env.local`の内容:
```bash
# DynamoDB設定
TABLE_NAME=BlogPosts
DYNAMODB_ENDPOINT=http://localhost:4566

# S3設定
BUCKET_NAME=serverless-blog-images
S3_ENDPOINT=http://localhost:4566
CLOUDFRONT_URL=http://localhost:4566/serverless-blog-images

# Cognito設定
USER_POOL_ID=local_user_pool
USER_POOL_CLIENT_ID=local_client_id
COGNITO_ENDPOINT=http://localhost:4566

# ログ設定
RUST_LOG=info

# AWS認証情報（LocalStack用）
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_DEFAULT_REGION=us-east-1
```

**3. 開発ワークフロー:**

```bash
# ターミナル1: LocalStack起動
docker-compose up -d localstack

# ターミナル2: 関数をウォッチモードで起動
./scripts/local-dev.sh create_post

# ターミナル3: 関数を呼び出し
./scripts/invoke-local.sh create_post
```

## 環境変数

| 変数名 | 説明 | 例 |
|-------|------|-----|
| TABLE_NAME | DynamoDBテーブル名 | BlogPosts |
| BUCKET_NAME | S3バケット名 | serverless-blog-images |
| USER_POOL_ID | Cognito User Pool ID | us-east-1_xxxxx |
| USER_POOL_CLIENT_ID | Cognito Client ID | xxxxxxxxx |
| CLOUDFRONT_URL | CloudFront配信URL | https://d123.cloudfront.net |
| RUST_LOG | ログレベル | info |
| DYNAMODB_ENDPOINT | LocalStack用エンドポイント | http://localhost:4566 |
| S3_ENDPOINT | LocalStack用エンドポイント | http://localhost:4566 |
| COGNITO_ENDPOINT | LocalStack用エンドポイント | http://localhost:4566 |

## リリースプロファイル最適化

`Cargo.toml`の`[profile.release]`設定：

```toml
[profile.release]
opt-level = 3        # 最大最適化
lto = true           # リンク時最適化
codegen-units = 1    # 単一コード生成ユニット
panic = "abort"      # パニック時即座に終了
strip = true         # デバッグシンボル除去
```

これにより：
- バイナリサイズ: 関数あたり10MB未満
- コールドスタート: 100ms未満

## トラブルシューティング

### "can't find crate for `core`" エラー

ARM64ターゲットがインストールされていません：
```bash
rustup target add aarch64-unknown-linux-musl
```

### "Zig is not installed" エラー

Zigがインストールされていないか、PATHに含まれていません：
```bash
which zig
# または
zig version
```

### ビルド時間が長い

初回ビルドは依存関係のコンパイルに時間がかかります（5-10分）。
2回目以降はキャッシュが効き、数秒で完了します。

## 関連ドキュメント

- [AWS Lambda Rust Runtime](https://github.com/awslabs/aws-lambda-rust-runtime)
- [Cargo Lambda](https://www.cargo-lambda.info/)
- [AWS SDK for Rust](https://aws.amazon.com/sdk-for-rust/)
