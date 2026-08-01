# E2E Test Environment - 3-Layer Test Strategy

Playwrightを使用したE2Eテスト環境のドキュメント

## 概要

このE2Eテスト環境は、3層テスト戦略に基づいて設計されています。

### 3層テスト戦略

```
Layer 1: ローカルE2Eテスト
  → 管理画面: MSW モック（ブラウザ内）
  → 公開サイト: モックAPIに対してビルドした Astro SSG の成果物を
    `astro preview` で配信（記事データはビルド時に焼き込まれるため、
    ブラウザ内モックは使えない）
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

### Layer 1: MSW E2Eテスト（18 spec files, 40 tests）

R43「最小限 E2E（重要なユーザーフローのみ）」方針に従い、表示・バリデーション等の
詳細はユニット/統合テストでカバーし、E2E はクロスレイヤの主要フローのみを検証する。

#### 公開サイト（3 spec / 7 tests）

| Specファイル | テスト数 | カバー範囲 |
|------------|---------|----------|
| seed.spec.ts | 4 | **AI Agent (Generator/Healer) 用リファレンス**。home/article と意図的に重複しており、`fixtures` 経由インポート / Page Object パターン / 日本語コメント / AAA 構造などの規約を模範的に示す |
| home.spec.ts | 2 | 記事一覧表示、記事詳細へのナビゲーション |
| article.spec.ts | 1 | 記事詳細の表示（タイトル / 本文）。Astro slug routing も実遷移経由で暗黙にカバー |

#### 管理画面（15 spec / 33 tests）

| Specファイル | テスト数 | カバー範囲 |
|------------|---------|----------|
| admin-auth.spec.ts | 2 | ログイン成功/失敗 |
| admin-unauthorized-access.spec.ts | 1 | 未認証アクセスリダイレクト |
| admin-crud.spec.ts | 3 | 記事 CRUD 統合フロー（作成・編集・削除） |
| admin-categories.spec.ts | 4 | カテゴリ CRUD（一覧・作成・編集・削除）。並べ替え D&D は単体テスト側でカバー |
| admin-tiptap-basic.spec.ts | 4 | エディタ初期化、Markdown 入力、整形、タブキー |
| admin-image-paste.spec.ts | 1 | クリップボード貼り付けでの画像挿入 |
| admin-image-drag.spec.ts | 1 | ドラッグ&ドロップでの画像挿入 |
| admin-image-toolbar.spec.ts | 1 | 画像ツールバー操作 |
| admin-image-fail.spec.ts | 2 | 画像アップロード失敗時のエラー / バリデーション |
| admin-metadata-sidebar.spec.ts | 4 | slug 自動生成、excerpt カウンタ、cover image (PR6) |
| admin-preview-parity.spec.ts | 1 | エディタプレビューと公開ページの Markdown 描画一致 |
| admin-autosave.spec.ts | 3 | オートセーブの発火とインジケータ |
| admin-unsaved-guard.spec.ts | 3 | 未保存変更ガード（beforeunload / キャンセル） |
| admin-publish-flow.spec.ts | 2 | 公開時のビルドステータスバッジ表示遷移 (PR5b) |
| admin-slug-conflict.spec.ts | 1 | slug 重複時の 409 エラー表示 |

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
│   ├── specs/              # テストスペック（18 ファイル / 40 テスト）
│   │   ├── seed.spec.ts    # AI Agent (Generator/Healer) 用リファレンス
│   │   ├── home.spec.ts    # 公開: 記事一覧、ナビゲーション
│   │   ├── article.spec.ts # 公開: 記事詳細
│   │   ├── admin-auth.spec.ts                # 管理: ログイン
│   │   ├── admin-unauthorized-access.spec.ts # 管理: セキュリティリダイレクト
│   │   ├── admin-crud.spec.ts                # 管理: 記事 CRUD
│   │   ├── admin-categories.spec.ts          # 管理: カテゴリ CRUD
│   │   ├── admin-tiptap-basic.spec.ts        # 管理: エディタ基本
│   │   ├── admin-image-*.spec.ts             # 管理: 画像 paste/drag/toolbar/fail
│   │   ├── admin-metadata-sidebar.spec.ts    # 管理: メタデータサイドバー (PR6)
│   │   ├── admin-preview-parity.spec.ts      # 管理: プレビュー一致
│   │   ├── admin-autosave.spec.ts            # 管理: オートセーブ (PR5a)
│   │   ├── admin-unsaved-guard.spec.ts       # 管理: 未保存ガード (PR5a)
│   │   ├── admin-publish-flow.spec.ts        # 管理: ビルドステータス (PR5b)
│   │   └── admin-slug-conflict.spec.ts       # 管理: slug 409
│   ├── pages/              # ページオブジェクト
│   ├── fixtures/           # カスタムフィクスチャ
│   ├── mocks/              # MSWモックハンドラー（ハッピーパスのみ）
│   │   ├── handlers.ts     # APIモックハンドラー
│   │   └── mockData.ts     # テストデータ（記事 / カテゴリ）
│   ├── utils/              # テストヘルパー
│   ├── global-setup.ts     # グローバルセットアップ（MSW/AWS環境対応）
│   └── global-teardown.ts  # グローバルティアダウン（記事 / カテゴリの [E2E-TEST] データを清掃）
├── playwright.config.ts       # 公開サイトテスト設定（astro preview で dist を配信）
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
Job 6: e2e-public-tests → 公開サイト全 spec (3 / 7 tests)
        ※ モックAPIに対して Astro をビルドしてから実行する
Job 7: e2e-admin-tests  → 管理画面のうち認証 / CRUD / カテゴリ / セキュリティ系 4 spec
APIコントラクトテスト（Layer 2）→ GoテストCIジョブに自動組み込み
```

> Job 7 が PR で実行するのは下記 4 spec:
> - `admin-auth.spec.ts`
> - `admin-crud.spec.ts`
> - `admin-categories.spec.ts`
> - `admin-unauthorized-access.spec.ts`
>
> **PR では実行されない admin spec** (tiptap-basic / image-* / metadata-sidebar / autosave /
> unsaved-guard / publish-flow / preview-parity / slug-conflict) は、現時点で MSW 環境
> での flakiness（特に Tiptap エディタ起動）があり、安定化前に PR を一律 fail させる
> リスクがあるため除外している。これらは下記の post-deploy AWS E2E ジョブで全件回す。
> flakiness を解消したら順次 Job 7 に追加する。

### デプロイ後（deploy.yml）

```
post-deploy-e2e-dev → 実環境E2Eテスト（Layer 3, 全 18 spec）
```

実環境では `[E2E-TEST]` プレフィックスの記事 / カテゴリを `global-teardown.ts` が
自動削除する。手動掃除は `bun run cleanup:test-data`。

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


## AI Agents ワークフロー

Playwright v1.56+ の AI Test Agents を活用し、テストの作成・修復をAI駆動で効率化します。

### 3つのAI活用レイヤー

```
Layer A: テスト計画の自動生成（Planner Agent）
  → アプリをブラウザで探索しMarkdown形式のテスト計画を生成
  → 新機能追加時にClaude Codeから呼び出し

Layer B: テストコードの自動生成（Generator Agent）
  → テスト計画からPlaywright specファイルを自動生成
  → セレクタをライブアプリに対して検証しながら生成
  → 既存のPage Object・フィクスチャを活用するよう制約

Layer C: テストの自動修復（Healer Agent）
  → テスト失敗時にトレース解析→自動パッチ
  → 修復不能な場合はtest.fixme()でマーク（無限ループ防止）
```

### Agent定義ファイル

| ファイル | 役割 |
|---------|------|
| `.claude/agents/playwright-test-planner.md` | テスト計画の自動生成 |
| `.claude/agents/playwright-test-generator.md` | テストコードの自動生成 |
| `.claude/agents/playwright-test-healer.md` | テスト失敗の自動修復 |

### リファレンステスト（seed.spec.ts）

`tests/e2e/specs/seed.spec.ts` はAI Agentがテスト生成・修復時に参照するリファレンスです。
プロジェクト固有の規約を模範的に示します：

- `import { test, expect } from '../fixtures'` パターン
- Page Objectの`navigate()` → アクション → `expect` のAAA構造
- 日本語コメント
- MSWモック環境での動作前提

### 使用方法

#### テスト計画の生成（Planner）

Claude Codeで `/playwright-test-planner` を呼び出し、対象ページのURLを指定：
```
/playwright-test-planner https://localhost:3000
```

#### テストコードの生成（Generator）

テスト計画を元に `/playwright-test-generator` を呼び出し：
```
/playwright-test-generator
```

#### テストの自動修復（Healer）

テスト失敗時に `/playwright-test-healer` を呼び出し、自動修復を実行：
```
# テストを実行して失敗結果を保存
bun run test:e2e:heal

# Healer Agentで自動修復
/playwright-test-healer
```

### MCP Server設定

Playwright Test MCP Serverが `.mcp.json` に設定されています：
```json
{
  "playwright-test": {
    "command": "npx",
    "args": ["playwright", "run-test-mcp-server"]
  }
}
```

このサーバーは以下のツールを提供：
- `test_run` / `test_list` / `test_debug`: テスト実行・一覧・デバッグ
- `browser_*`: ブラウザ操作（navigate, click, snapshot等）
- `planner_setup_page` / `generator_setup_page`: Agent専用セットアップ
- `generator_write_test` / `generator_read_log`: テスト生成支援
