# E2E Test Environment - 3-Layer Test Strategy

Playwrightを使用したE2Eテスト環境のドキュメント

## 概要

このE2Eテスト環境は、3層テスト戦略に基づいて設計されています。

### 3層テスト戦略

```
Layer 1: ローカルMSW E2Eテスト（MSW Mock）
  → UIレンダリング・ナビゲーションの高速検証
  → CI/PR時に毎回実行（~1-2分）

Layer 2: APIコントラクトテスト（Go単体テスト）
  → Go Lambda関数のレスポンス構造がMSWモックと一致することを保証
  → Go単体テストとして高速実行（~10秒）
  → CIのGoテストジョブに組み込み

Layer 3: 実環境E2Eテスト（AWS Real Environment）
  → デプロイ済みdev環境に対してPlaywrightテスト実行
  → deploy.yml完了後のpost-deployジョブとして実行
  → ローカルからも `bun run test:e2e:aws` で手動実行可能
```

## テスト範囲

### Layer 1: MSW E2Eテスト（5 spec files, 9 tests）

| Specファイル | テスト数 | カバー範囲 |
|------------|---------|----------|
| home.spec.ts | 2 | 記事一覧表示、ナビゲーション |
| article.spec.ts | 1 | 記事詳細表示 |
| admin-auth.spec.ts | 2 | ログイン成功/失敗 |
| admin-crud.spec.ts | 3 | 記事CRUD統合フロー（作成・編集・削除） |
| admin-unauthorized-access.spec.ts | 1 | 未認証アクセスリダイレクト |

### Layer 2: APIコントラクトテスト

`go-functions/tests/contract/` に配置。Go `go test` で実行。

| テスト | カバー範囲 |
|-------|----------|
| TestPostsListContract | 記事一覧レスポンス構造 |
| TestPostCreateContract | 記事作成レスポンス構造 |
| TestPostUpdateContract | 記事更新レスポンス構造 |
| TestPostDeleteContract | 記事削除レスポンス（204 No Content） |
| TestAuthLoginContract | ログインレスポンス構造 |
| TestCategoriesListContract | カテゴリ一覧レスポンス構造 |
| TestImageUploadURLContract | 画像アップロードURLレスポンス構造 |
| TestErrorResponseContract | エラーレスポンス構造 |

### Layer 3: 実環境E2Eテスト

MSW E2Eテストと同じspecファイルを使用し、`playwright.aws.config.ts` でconfig切り替え。

## アーキテクチャ

```
E2E Test Environment
├── tests/e2e/
│   ├── specs/              # テストスペック（5ファイル、9テスト）
│   │   ├── home.spec.ts    # 公開サイト: 記事一覧、ナビゲーション
│   │   ├── article.spec.ts # 公開サイト: 記事詳細表示
│   │   ├── admin-auth.spec.ts # 管理画面: ログイン/ログアウト
│   │   ├── admin-crud.spec.ts # 管理画面: CRUD統合フロー
│   │   └── admin-unauthorized-access.spec.ts # セキュリティ: 未認証リダイレクト
│   ├── pages/              # ページオブジェクト
│   ├── fixtures/           # カスタムフィクスチャ
│   ├── mocks/              # MSWモックハンドラー（ハッピーパスのみ）
│   │   ├── handlers.ts     # APIモックハンドラー
│   │   └── mockData.ts     # テストデータ
│   ├── utils/              # テストヘルパー
│   ├── global-setup.ts     # グローバルセットアップ（MSW/AWS環境対応）
│   └── global-teardown.ts  # グローバルティアダウン（テストデータクリーンアップ）
├── playwright.config.ts       # 公開サイトMSWテスト設定
├── playwright.admin.config.ts # 管理画面MSWテスト設定
└── playwright.aws.config.ts   # 実環境テスト設定（Basic認証対応）
```

## テスト実行コマンド

### Layer 1: MSW E2Eテスト

```bash
# 公開サイトテスト
bun run test:e2e

# 管理画面テスト
bun run test:e2e:admin

# 全テスト
bun run test:e2e:all
```

### Layer 2: APIコントラクトテスト

```bash
cd go-functions && go test ./tests/contract/ -v
```

### Layer 3: 実環境E2Eテスト

```bash
# 全実環境テスト
BASE_URL=https://your-dev-site.com bun run test:e2e:aws

# 公開サイトのみ
BASE_URL=https://your-dev-site.com bun run test:e2e:aws:public

# 管理画面のみ
BASE_URL=https://your-dev-site.com bun run test:e2e:aws:admin
```

### UIモード・デバッグ

```bash
bun run test:e2e:ui           # UIモード
bun run test:e2e:headed       # ブラウザ表示
bun run test:e2e:debug        # デバッグモード
bun run test:e2e:admin:ui     # 管理画面UIモード
```

## テストデータ管理

### [E2E-TEST] prefix規約

実環境テストで作成されるテストデータは `[E2E-TEST]` prefixを持ちます。

- 作成例: `[E2E-TEST] New Test Article`
- `global-teardown.ts` で自動クリーンアップ
- 手動クリーンアップ: `bun run cleanup:test-data`

### MSW環境

MSW環境では `resetMockPosts()` でインメモリデータをリセット。各テストの `beforeEach` でリセットされます。

## 環境変数

| 変数 | 用途 | デフォルト |
|-----|------|---------|
| `BASE_URL` | テスト対象のベースURL | `http://localhost:3000` |
| `ADMIN_BASE_URL` | 管理画面のベースURL | `http://localhost:3001` |
| `VITE_ENABLE_MSW_MOCK` | MSWモック有効化 | `true` |
| `DEV_BASIC_AUTH_USERNAME` | DEV環境Basic認証ユーザー名 | (未設定) |
| `DEV_BASIC_AUTH_PASSWORD` | DEV環境Basic認証パスワード | (未設定) |
| `TEST_ADMIN_EMAIL` | テスト用管理者メール | `admin@example.com` |
| `TEST_ADMIN_PASSWORD` | テスト用管理者パスワード | `testpassword` |
| `HEADLESS` | ヘッドレスモード制御 | `true` |

## CI/CD統合

### PR時（ci.yml）

```
MSW E2Eテスト（Layer 1）→ UI変更の高速フィードバック
APIコントラクトテスト（Layer 2）→ GoテストCIジョブに自動組み込み
```

### デプロイ後（deploy.yml）

```
post-deploy-e2e-dev → 実環境E2Eテスト（Layer 3）
```

## トラブルシューティング

### テストが失敗する場合

1. **スクリーンショットを確認**: `test-results/` に保存
2. **トレースを確認**: `playwright-report/` のHTMLレポート
3. **デバッグモード**: `bun run test:e2e:debug`

### 実環境テストの認証エラー

Basic認証の環境変数が正しく設定されているか確認:

```bash
export DEV_BASIC_AUTH_USERNAME=your-username
export DEV_BASIC_AUTH_PASSWORD=your-password
```

## パフォーマンス目標

| Layer | 実行時間 | 実行タイミング |
|-------|---------|-------------|
| Layer 1 (MSW E2E) | ~1-2分 | PR毎 |
| Layer 2 (Contract) | ~10秒 | PR毎（Goジョブ内） |
| Layer 3 (AWS E2E) | ~3-5分 | デプロイ後 |
