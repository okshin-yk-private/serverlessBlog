# E2E Test Environment Setup (Minimal UI E2E Tests)

Playwrightを使用したUI E2Eテスト（最小限）統合実行環境のドキュメント

## 概要

このE2Eテスト環境は、**重要なユーザーフローのみ**を検証する最小限のUI E2Eテストです。フロントエンド（公開サイト・管理画面）の主要なワークフローとユーザーシナリオをカバーします。

### テスト戦略（2025-11-07更新）

**目的**: テスト実行時間を80%削減し、保守性を向上させる

- **UI E2Eテスト**: 重要なユーザーフローのみ検証（~3分）
- **統合テスト**: API/DB連携、詳細なエラーハンドリング（~2分）
- **ユニットテスト**: 詳細な動作検証、バリデーション、エッジケース（~30秒）

バックエンドAPIはMSW (Mock Service Worker)を使用してハッピーパスのみモックされており、実際のAWSリソースを必要とせずにE2Eテストを実行できます。

## テスト範囲

### 現在のテスト構成（5 spec files, 9 tests）

| Specファイル | テスト数 | カバー範囲 |
|------------|---------|----------|
| home.spec.ts | 2 | 記事一覧表示、ナビゲーション |
| article.spec.ts | 1 | 記事詳細表示 |
| admin-auth.spec.ts | 2 | ログイン成功/失敗 |
| admin-crud.spec.ts | 3 | 記事CRUD統合フロー |
| admin-unauthorized-access.spec.ts | 1 | 未認証アクセスリダイレクト |

### 削減されたテスト項目（他レイヤーでカバー）

以下のテストは削除または他のテストレイヤーに移行されました：

- ❌ **クロスブラウザテスト**（Firefox, WebKit, Mobile） → **Chromiumのみ**
- ❌ **SEOメタタグ検証** → **ユニットテスト**で実施
- ❌ **詳細なエラーハンドリング** → **ユニット/統合テスト**で実施
- ❌ **フォームバリデーション詳細** → **コンポーネントテスト**で実施
- ❌ **画像アップロード詳細フロー** → **統合テスト**で実施
- ❌ **未認証アクセステスト詳細** → **統合テスト**で実施
- ❌ **レスポンシブデザイン詳細検証** → **コンポーネントテスト**で実施

## アーキテクチャ

```
E2E Test Environment (Minimal)
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
│   │   ├── handlers.ts     # APIモックハンドラー（簡略化）
│   │   └── mockData.ts     # テストデータ
│   ├── utils/              # テストヘルパー
│   ├── global-setup.ts     # グローバルセットアップ
│   └── global-teardown.ts  # グローバルティアダウン
├── playwright.config.ts    # Playwright設定（Chromiumのみ）
└── playwright.admin.config.ts # 管理画面設定（Chromiumのみ）
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

### ブラウザ設定（Chromiumのみ）

**注意**: 2025-11-07の更新により、クロスブラウザテスト（Firefox, WebKit, Mobile, Tablet）は削除されました。すべてのテストはChromiumブラウザのみで実行されます。

```bash
# Chromiumで実行（デフォルト）
npx playwright test

# または明示的に指定
npx playwright test --project=chromium
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

## モックAPI（ハッピーパスのみ）

E2Eテストでは、MSW (Mock Service Worker)を使用してバックエンドAPIをモックしています。

**重要**: 2025-11-07の更新により、モックハンドラーはハッピーパス（成功シナリオ）のみをカバーします。複雑なエラーシミュレーション機能は削除され、詳細なエラーハンドリングテストはユニットテスト・統合テストレイヤーで実施されます。

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

## パフォーマンス目標

### テスト実行時間

- **目標**: 3分以内（従来の~15分から80%削減）
- **現在**: 5 spec files, 9 tests（Chromiumのみ）
- **並列実行**: ワーカー数4（CI環境）

### 削減効果

| 項目 | 従来 | 現在 | 削減率 |
|------|------|------|--------|
| ブラウザ数 | 5（Chromium, Firefox, WebKit, Mobile, Tablet） | 1（Chromiumのみ） | 80% |
| Specファイル数 | 13+ | 5 | ~62% |
| テストケース数 | 50+ | 9 | ~82% |
| 実行時間 | ~15分 | ~3分 | 80% |

## 参考リンク

- [Playwright Documentation](https://playwright.dev/)
- [MSW Documentation](https://mswjs.io/)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)
- [Testing Strategy Document](../../docs/testing-strategy.md)（新テスト戦略詳細）
