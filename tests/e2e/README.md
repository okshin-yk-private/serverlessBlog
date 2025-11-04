# E2E Test Environment Setup

Playwrightを使用したE2Eテスト統合実行環境のドキュメント

## 概要

このE2Eテスト環境は、フロントエンド（公開サイト・管理画面）のUIワークフローとユーザーシナリオを検証します。バックエンドAPIはMSW (Mock Service Worker)を使用してモックされており、実際のAWSリソースを必要とせずにE2Eテストを実行できます。

## アーキテクチャ

```
E2E Test Environment
├── tests/e2e/
│   ├── specs/              # テストスペック
│   │   ├── home.spec.ts    # 公開サイトのテスト
│   │   ├── article.spec.ts # 記事詳細のテスト
│   │   └── admin-auth.spec.ts # 管理画面認証のテスト
│   ├── pages/              # ページオブジェクト
│   ├── fixtures/           # カスタムフィクスチャ
│   ├── mocks/              # MSWモックハンドラー
│   │   ├── handlers.ts     # APIモックハンドラー
│   │   └── mockData.ts     # テストデータ
│   ├── utils/              # テストヘルパー
│   ├── global-setup.ts     # グローバルセットアップ
│   └── global-teardown.ts  # グローバルティアダウン
└── playwright.config.ts    # Playwright設定
```

## 必要な環境

- Node.js 22.x
- npm または yarn
- Playwright ブラウザ（自動インストール）

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Playwrightブラウザのインストール

```bash
npx playwright install
```

## E2Eテストの実行

### すべてのテストを実行

```bash
npm run test:e2e
```

### UIモードで実行（推奨・インタラクティブ）

```bash
npm run test:e2e:ui
```

### ヘッドモードで実行（ブラウザを表示）

```bash
npm run test:e2e:headed
```

### デバッグモード

```bash
npm run test:e2e:debug
```

### テストレポートの表示

```bash
npm run test:e2e:report
```

### 特定のテストファイルを実行

```bash
npx playwright test tests/e2e/specs/home.spec.ts
```

### 特定のプロジェクト（ブラウザ）で実行

```bash
# Chromiumのみ
npx playwright test --project=chromium

# モバイルChromeのみ
npx playwright test --project=mobile-chrome

# タブレット
npx playwright test --project=tablet
```

## 環境変数

### ベースURL設定

```bash
# デフォルト: http://localhost:3000
BASE_URL=http://localhost:3000 npm run test:e2e
```

### ヘッドレスモード制御

```bash
# ブラウザを表示してテスト実行
HEADLESS=false npm run test:e2e
```

### ローカルサーバー起動

```bash
# フロントエンドを自動起動してテスト実行
START_LOCAL_SERVER=true npm run test:e2e
```

## モックAPI

E2Eテストでは、MSW (Mock Service Worker)を使用してバックエンドAPIをモックしています。

### モックされているエンドポイント

#### 公開サイトAPI
- `GET /api/posts` - 記事一覧取得
- `GET /api/posts/:id` - 記事詳細取得

#### 管理画面API
- `POST /api/auth/login` - ログイン
- `POST /api/auth/logout` - ログアウト
- `POST /api/auth/refresh` - トークン更新
- `GET /api/admin/posts` - 管理画面記事一覧
- `POST /api/admin/posts` - 記事作成
- `GET /api/admin/posts/:id` - 記事取得
- `PUT /api/admin/posts/:id` - 記事更新
- `DELETE /api/admin/posts/:id` - 記事削除
- `POST /api/images/upload-url` - 画像アップロードURL取得

### テスト認証情報

管理画面のテストで使用する認証情報：

```typescript
Email: admin@example.com
Password: testpassword
```

### モックデータのカスタマイズ

モックデータは `tests/e2e/mocks/mockData.ts` で定義されています。テストケースに応じて、`createMockPost()` 関数を使用して新しいモックデータを生成できます。

```typescript
import { createMockPost } from '../mocks/mockData';

const customPost = createMockPost({
  title: 'Custom Test Post',
  category: 'tech',
  publishStatus: 'published',
});
```

## テストパターン

### ページオブジェクトパターン

すべてのE2Eテストはページオブジェクトパターンを使用しています：

```typescript
import { test, expect } from '../fixtures';

test('should display home page', async ({ homePage }) => {
  await homePage.navigate();
  const title = await homePage.getTitle();
  expect(title).toContain('Blog');
});
```

### 認証済みテスト

管理画面のテストでは、`authenticatedTest` フィクスチャを使用して事前にログインした状態でテストを開始できます：

```typescript
import { authenticatedTest, expect } from '../fixtures';

authenticatedTest('should create new post', async ({ articleEditorPage }) => {
  await articleEditorPage.navigate();
  // ログイン済み状態でテスト実行
});
```

## トラブルシューティング

### テストが失敗する場合

1. **スクリーンショットを確認**
   - `test-results/` ディレクトリに失敗時のスクリーンショットが保存されます

2. **トレースを確認**
   - `playwright-report/` ディレクトリのHTMLレポートで詳細なトレースを確認できます

3. **デバッグモードで実行**
   ```bash
   npm run test:e2e:debug
   ```

### フロントエンドが起動しない場合

フロントエンド（公開サイト・管理画面）を別ターミナルで手動起動してからテストを実行：

```bash
# 公開サイト
cd frontend/public
npm run dev

# 管理画面
cd frontend/admin
npm run dev
```

その後、別ターミナルでE2Eテストを実行：

```bash
npm run test:e2e
```

## CI/CD統合

GitHub Actionsでの自動E2Eテスト実行設定例：

```yaml
name: E2E Tests

on:
  pull_request:
    branches: [main, develop]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

## 参考リンク

- [Playwright Documentation](https://playwright.dev/)
- [MSW Documentation](https://mswjs.io/)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)
