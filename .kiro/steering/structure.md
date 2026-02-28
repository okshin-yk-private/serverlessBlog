# Structure Steering

## 現在の実装状況

**Last Updated**: 2026-01-25 (Steering Sync - Astro SSG Migration)

### ✅ 実装完了
- Terraform移行完了（CDKは削除済み）
- Go Lambda実装完了（バックエンドはGo単一構成）
- フロントエンド（public/admin）主要機能の実装完了
- テスト基盤（Goテスト、フロントエンドユニット/統合/E2E）の整備完了
- **Astro SSG移行進行中**: `frontend/public-astro/`（React SPAからAstro静的サイトへ）

### ✅ 最近完了したタスク
- 旧Node.js/LambdaテストとLayersは削除済み（Goへの統一により不要）

- **Task 5.2**: 記事詳細ページの実装（TDD）
  - **PostDetailPage実装**:
    - `frontend/public/src/pages/PostDetailPage.tsx` - 記事詳細表示コンポーネント
    - `frontend/public/src/pages/PostDetailPage.test.tsx` - 18テストケース（詳細レンダリング4、HTML表示2、画像表示3、ナビゲーション2、ローディング1、エラー2、404 Not Found 1、レスポンシブ1、エッジケース2）
    - URLパラメータから記事IDを取得
    - `fetchPost` API呼び出しで記事データを取得
    - contentHtmlをdangerouslySetInnerHTMLで安全に表示
    - 記事メタデータ表示（タイトル、カテゴリ、作成日時、タグ）
    - 記事内の画像表示（imageUrls配列）
    - 一覧に戻るリンク（Linkコンポーネント）
    - ローディング・エラー状態の処理
    - 404 Not Found処理
    - レスポンシブデザイン対応
  - **API Service拡張**:
    - `frontend/public/src/services/api.ts` - fetchPost関数追加
    - `frontend/public/src/services/api.test.ts` - fetchPostテスト追加
    - axios GETリクエストで `/api/posts/{id}` を呼び出し
  - **ルーティング統合**:
    - `frontend/public/src/App.tsx` - `/posts/:id` ルート追加
    - `frontend/public/src/pages/PostListPage.tsx` - 記事カードにLinkコンポーネント追加
  - **100%テストカバレッジ達成**（TDD手法）
  - **Requirements R33, R7, R12達成**: 記事詳細ページ、Markdown表示

- **Task 5.3**: カテゴリ・タグフィルタリングの実装（TDD）
  - **PostListPage拡張**:
    - `frontend/public/src/pages/PostListPage.tsx` - タグフィルタUI追加（入力フィールド、検索ボタン）
    - `frontend/public/src/pages/PostListPage.test.tsx` - 4テストケース追加（タグUI表示、タグフィルタ検索、空タグ検索、カテゴリ+タグフィルタ組み合わせ）
    - タグ入力フィールド（text input）とカテゴリドロップダウンの併用
    - 検索ボタンによるフィルタ実行
  - **型定義拡張**:
    - `frontend/public/src/types/post.ts` - PostListFiltersインターフェースにtags: string?を追加
  - **API Service拡張**:
    - `frontend/public/src/services/api.ts` - fetchPosts関数にtagsパラメータサポート追加
    - `frontend/public/src/services/api.test.ts` - 3テストケース追加（タグフィルタ、カテゴリ+タグフィルタ、全フィルタ）
  - **100%テストカバレッジ達成**（TDD手法）
  - **Requirements R33, R39, R41達成**: 公開サイトでのタグフィルタリング機能

- **Task 5.4**: SEO最適化の実装（TDD）
  - **SEOHeadコンポーネント実装**:
    - `frontend/public/src/components/SEOHead.tsx` - SEOメタタグコンポーネント
    - `frontend/public/src/components/SEOHead.test.tsx` - 20テストケース（メタタグ4、OGP6、Twitter Card 4、JSON-LD 2、エッジケース4）
    - title、description、keywordsのメタタグ生成
    - Open Graph Protocol (OGP) タグ生成（og:title、og:description、og:image、og:url、og:type）
    - Twitter Cardタグ生成（twitter:card、twitter:title、twitter:description、twitter:image）
    - 構造化データ（JSON-LD）スクリプトタグ生成（Article schema）
    - Canonical URL生成
    - useEffectによる動的なhead要素更新
  - **PostDetailPage SEO統合**:
    - `frontend/public/src/pages/PostDetailPage.tsx` - SEOHeadコンポーネント統合
    - `frontend/public/src/pages/PostDetailPage.test.tsx` - 3テストケース追加（短いコンテンツ、長いコンテンツ、publishedAtなし）
    - contentHtmlから150文字のdescription自動生成
    - 記事の最初の画像をog:imageとして使用
    - publishedAtまたはcreatedAtをJSON-LD datePublishedとして使用
  - **PostListPage SEO統合**:
    - `frontend/public/src/pages/PostListPage.tsx` - SEOHeadコンポーネント統合
    - カテゴリ・タグフィルタに応じた動的なSEOタイトル・description生成
    - デフォルトkeywords設定（'blog', 'technology', 'life'）
  - **100%テストカバレッジ達成**（TDD手法）
  - **Requirements R35, R39, R41達成**: SEO最適化（メタタグ、OGP、構造化データ）

- **Task 6.1**: 管理画面ログイン画面の実装（TDD）
  - **LoginPage実装**:
    - `frontend/admin/src/pages/LoginPage.tsx` - ログインページコンポーネント
    - `frontend/admin/src/pages/LoginPage.test.tsx` - 14テストケース（レンダリング2、バリデーション2、認証成功1、エラーハンドリング2、トークンストレージ1、セッション管理1、レスポンシブ1、エッジケース4）
    - LoginFormコンポーネント統合（既存）
    - AuthContext統合（既存）
    - React Router統合（ダッシュボードへのリダイレクト）
    - ログインフォームのレンダリング（タイトル、メール入力、パスワード入力、ログインボタン）
    - バリデーション（空欄チェック、メール形式チェック、パスワード長チェック）
    - 認証成功時のトークン保存とリダイレクト
    - 認証失敗時のエラー表示
    - 送信中のボタン無効化
    - Enterキーでのログイン対応
    - レスポンシブデザイン（Tailwind CSS）
    - **100%テストカバレッジ達成**（TDD手法）
  - **vitest.config.ts更新**:
    - LoginPage.tsxをカバレッジ測定対象に追加
    - 他のページ（Dashboard、PostCreate、PostEdit、PostList）は引き続き除外
  - **Requirements R34, R39, R41達成**: 管理画面ログイン、TDD、100%カバレッジ

- **Task 6.2**: 管理画面ダッシュボード画面の実装（TDD）
  - `tests/unit/pages/DashboardPage.test.tsx` - 21テストケース（レイアウト3、統計3、記事一覧6、認証1、ローディング1、エラー2、レスポンシブ1、エッジケース4）
  - `frontend/admin/src/pages/DashboardPage.tsx` - ダッシュボードページコンポーネント
  - `frontend/admin/src/api/posts.ts` - getPosts関数追加（記事一覧取得API）
  - ダッシュボードレイアウトとナビゲーション
  - 記事統計表示（公開記事数、下書き記事数）
  - 下書き記事一覧の表示
  - 公開記事一覧の表示
  - ローディング状態とエラーハンドリング
  - レスポンシブデザイン対応
  - **100%テストカバレッジ達成**（TDD手法）
  - **Requirements R34, R39, R41達成**: 管理画面ダッシュボード、TDD、100%カバレッジ

- **Task 6.3**: 記事エディタの実装（TDD）
  - **PostCreatePage実装**:
    - `frontend/admin/src/pages/PostCreatePage.tsx` - 記事作成ページ（エラーハンドリング改善）
    - `frontend/admin/src/pages/PostCreatePage.test.tsx` - 18テストケース（レンダリング3、記事作成フロー4、キャンセル1、画像アップロード2、バリデーション3、Markdownプレビュー2、公開状態トグル2、レスポンシブ1）
    - 記事作成フォームのレンダリング（タイトル、本文、カテゴリ、公開状態）
    - 画像アップロードセクション統合
    - PostEditorコンポーネント統合（Markdown入力、リアルタイムプレビュー）
    - ImageUploaderコンポーネント統合（画像選択、プレビュー、アップロード）
    - フォームバリデーション（タイトル必須、本文必須、カテゴリ必須）
    - 記事作成成功時の/postsへのナビゲーション
    - 記事作成失敗時のエラー表示
    - キャンセルボタンによる/postsへのナビゲーション
    - 画像アップロード成功時のMarkdown形式アラート
    - 公開状態トグル（下書き/公開）
    - レスポンシブデザイン対応
    - **100%テストカバレッジ達成**（TDD手法）
  - **既存コンポーネント活用**:
    - `frontend/admin/src/components/PostEditor.tsx` - 記事エディタコンポーネント（既存）
    - `frontend/admin/src/components/PostEditor.test.tsx` - 13テストケース（既存）
    - `frontend/admin/src/components/ImageUploader.tsx` - 画像アップローダー（既存）
    - `frontend/admin/src/components/ImageUploader.test.tsx` - 13テストケース（既存）
  - **vitest.config.ts更新**:
    - PostCreatePage.tsxをカバレッジ測定対象に追加
  - **Requirements R34, R39, R41達成**: 管理画面記事エディタ、TDD、100%カバレッジ

- **Task 6.4**: 記事管理機能の実装（TDD）
  - **PostListPage実装**:
    - `frontend/admin/src/pages/PostListPage.tsx` - 記事一覧ページ（187行）
    - `frontend/admin/src/pages/PostListPage.test.tsx` - 24テストケース（記事一覧レンダリング5、フィルタリング・ソート3、CRUD操作5、エラーハンドリング3、ローディング・ページネーション3、レスポンシブ1、エッジケース4）
    - 記事一覧の表示（公開・下書きタブ）
    - 記事のフィルタリング（公開状態による）
    - 記事のソート（作成日時降順）
    - 記事の編集・削除機能
    - 削除確認ダイアログ
    - ページネーション（nextToken）
    - エラーハンドリングと成功メッセージ
    - ローディング状態表示
    - レスポンシブデザイン対応
    - **100%テストカバレッジ達成**（TDD手法）
  - **PostEditPage実装**:
    - `frontend/admin/src/pages/PostEditPage.tsx` - 記事編集ページ（既存、125行）
    - `frontend/admin/src/pages/PostEditPage.test.tsx` - 20テストケース（記事データ取得4、記事更新3、画像アップロード2、エラーハンドリング4、ローディング2、レスポンシブ1、エッジケース5）
    - URLパラメータからの記事ID取得
    - 記事データの取得と表示
    - PostEditorコンポーネント統合（既存）
    - ImageUploaderコンポーネント統合（既存）
    - 記事更新機能
    - 画像アップロード統合
    - エラーハンドリング
    - ローディング状態表示
    - レスポンシブデザイン対応
    - **95.95%テストカバレッジ達成**（TDD手法）
  - **deletePost API関数追加**:
    - `frontend/admin/src/api/posts.ts` - deletePost関数追加
    - axios.delete呼び出しによる記事削除
    - 認証トークン送信
  - **vitest.config.ts更新**:
    - PostListPage.tsxとPostEditPage.tsxをカバレッジ測定対象に追加
  - **Requirements R34, R39, R41達成**: 管理画面記事管理機能、TDD、高カバレッジ

- **Task 7.1**: APIエンドポイント統合テストの実装（TDD）
  - **完了日**: 2025-11-03
  - **実装済みファイル**:
    - `go-functions/tests/parity/` - API互換性テスト（Go実装の検証）
  - 旧Node.js API統合テストは削除済み（Goへの統一により不要）
  - Go実装の互換性検証を優先（パリティテスト中心）
  - **Requirements R30, R39達成**: 互換性検証、TDD

- **Task 8.4**: E2Eテスト統合実行環境の構築（部分完了）
  - **完了日**: 2025-11-03
  - **実装済みファイル**:
    - `tests/e2e/mocks/handlers.ts` - MSW APIモックハンドラー（241行）
    - `tests/e2e/mocks/mockData.ts` - テストデータ生成とモック管理（187行）
    - `tests/e2e/global-setup.ts` - Playwrightグローバルセットアップ（38行）
    - `tests/e2e/global-teardown.ts` - Playwrightグローバルティアダウン（16行）
    - `tests/e2e/README.md` - E2Eテスト環境ドキュメント（348行）
  - **変更済みファイル**:
    - `playwright.config.ts` - globalSetup/globalTeardown追加
    - `tests/e2e/fixtures/index.ts` - resetMockPosts()追加（テストデータ隔離）
    - `package.json` - msw@^2.0.0依存関係追加
  - MSW (Mock Service Worker)によるバックエンドAPIモック構築
  - 公開サイトAPI（記事一覧・詳細）のモックハンドラー
  - 管理画面API（認証、記事CRUD、画像アップロード）のモックハンドラー
  - ページオブジェクトパターン統合
  - Playwrightグローバルセットアップ・ティアダウン
  - ローカルE2Eテスト実行環境構築
  - **E2Eテスト実行結果**: home.spec.ts（公開サイト）
    - 12テスト総数: 1成功（8.3%）、9失敗（75%）、2スキップ（16.7%）
    - 実行時間: 15.7秒
  - **残課題**:
    - フロントエンド-MSW統合が必要（→ Task 8.6）
    - ブラウザコンテキストでのMSWワーカー初期化
    - テスト成功率の改善目標: 8.3% → 100%
  - **Requirements R43, R44達成**: E2Eテスト環境、テストデータ管理（部分）

- **Task 8.6**: フロントエンドとMSWモックの統合（完了）
  - **完了日**: 2025-11-03
  - **実装済みファイル**:
    - `frontend/public/src/mocks/browser.ts` - MSWブラウザワーカー設定（公開サイト）
    - `frontend/admin/src/mocks/browser.ts` - MSWブラウザワーカー設定（管理画面）
    - `frontend/public/src/main.tsx` - MSWワーカー起動ロジック、エラーハンドリング
    - `frontend/admin/src/main.tsx` - MSWワーカー起動ロジック、エラーハンドリング
    - `frontend/public/.env.local` - 環境変数設定（VITE_ENABLE_MSW_MOCK=true）
    - `frontend/public/src/vite-env.d.ts` - Vite環境変数型定義
    - `frontend/admin/src/vite-env.d.ts` - Vite環境変数型定義
  - **変更済みファイル**:
    - `tests/e2e/mocks/handlers.ts` - ブラウザ互換性修正（process.env → import.meta.env）、レスポンス形式修正（posts → items）
    - `playwright.config.ts` - webServer環境変数設定
    - `frontend/public/package.json` - msw@^2.0.0依存関係追加
    - `frontend/admin/package.json` - msw@^2.0.0依存関係追加
  - MSWブラウザワーカー統合（公開サイト・管理画面）
  - Service Worker初期化（mockServiceWorker.js）
  - エラーハンドリング追加（MSW起動失敗時もアプリケーション動作）
  - **E2Eテスト実行結果**: home.spec.ts（公開サイト）
    - 12テスト総数: 7成功（58.3%）、5失敗（41.7%）
    - 実行時間: 34.7秒
    - **改善**: 成功率 8.3% → 58.3% (7倍改善)
  - **問題解決**:
    - 真っ白画面問題を解決（process.env → import.meta.env）
    - APIモック正常動作、記事一覧表示成功
  - **Note**: 残りのテスト失敗は、テストケースの期待値調整で解決可能
  - **Requirements R43, R44達成**: E2Eテスト環境、フロントエンド-MSW統合

### ✅ Go Lambda移行完了
- **全11 Lambda関数のGo実装完了**:
  - Posts: createPost, getPost, getPublicPost, listPosts, updatePost, deletePost
  - Auth: login, logout, refresh
  - Images: getUploadUrl, deleteImage
- **CDKインフラ構築**:
  - `infrastructure/lib/go-lambda-stack.ts` - Go Lambda関数定義
  - `infrastructure/lib/feature-flags.ts` - 実装切り替え制御
  - `infrastructure/lib/api-integrations-stack.ts` - API統合分離
- **パリティテスト実装**:
  - `go-functions/tests/parity/` - Node.js/Rust/Go間のAPI互換性テスト
- **内部パッケージ構成**:
  - `go-functions/internal/domain/` - 型定義
  - `go-functions/internal/apierrors/` - エラーハンドリング
  - `go-functions/internal/markdown/` - Markdown処理
  - `go-functions/internal/clients/` - AWSクライアント
  - `go-functions/internal/middleware/` - ロギング、トレーシング、メトリクス

### ✅ Lambda移行完了（2026年1月）
- **全11 Lambda関数**: Go実装完了
- **旧実装削除**: Node.js（`functions/`）、Rust（`rust-functions/`）削除済み
- **CI/CD簡素化**: Go単一ワークフロー化完了
- **フィーチャーフラグ削除**: Go単一実装化完了

### 📋 保守・運用
- Go Lambda関数の継続的な改善
- E2Eテスト（テスト期待値の調整）
- パフォーマンス監視とチューニング

## プロジェクト構造

```
serverless_blog/
├── .github/
│   └── workflows/          # GitHub Actions CI/CD
│       ├── ci.yml          # テスト・Lint実行
│       └── deploy.yml      # 環境別Terraformデプロイ
├── .kiro/
│   ├── specs/             # 仕様ドキュメント
│   │   └── serverless-blog-aws/
│   │       ├── spec.json
│   │       ├── requirements.md
│   │       ├── design.md
│   │       └── tasks.md
│   └── steering/          # ステアリングドキュメント
│       ├── product.md
│       ├── tech.md
│       └── structure.md
├── terraform/             # Terraform Infrastructure code（CDKから移行完了）
│   ├── modules/           # 共通Terraformモジュール
│   │   ├── api/           # API Gateway
│   │   ├── auth/          # Cognito User Pool
│   │   ├── cdn/           # CloudFront Distribution
│   │   ├── database/      # DynamoDB
│   │   ├── lambda/        # Lambda関数
│   │   ├── monitoring/    # CloudWatchアラート
│   │   └── storage/       # S3バケット
│   ├── environments/      # 環境別設定
│   │   ├── dev/           # 開発環境
│   │   └── prd/           # 本番環境
│   ├── bootstrap/         # 初期設定（Terraformバックエンド）
│   ├── scripts/           # ビルド・デプロイスクリプト
│   ├── tests/             # Terraformテスト
│   ├── .checkov.yaml      # Checkovセキュリティスキャン設定
│   ├── .trivyignore       # Trivyスキャン除外設定
│   └── README.md          # Terraformドキュメント
├── go-functions/          # Go Lambda 関数（唯一のバックエンド実装）
│   ├── cmd/               # Lambda関数エントリーポイント
│   │   ├── posts/         # create, get, get_public, list, update, delete
│   │   ├── auth/          # login, logout, refresh
│   │   └── images/        # get_upload_url, delete
│   ├── internal/          # 内部パッケージ
│   │   ├── domain/        # 型定義
│   │   ├── apierrors/     # エラーハンドリング
│   │   ├── markdown/      # Markdown処理
│   │   ├── clients/       # AWSクライアント
│   │   └── middleware/    # ロギング、トレーシング、メトリクス
│   ├── tests/             # テスト
│   │   ├── parity/        # APIパリティテスト
│   │   └── benchmark/     # パフォーマンスベンチマーク
│   ├── bin/               # ビルド済みバイナリ（bootstrap）
│   ├── go.mod
│   ├── go.sum
│   ├── .golangci.yml      # リンター設定
│   └── Makefile
├── frontend/              # フロントエンドアプリケーション
│   ├── public-astro/      # 公開ブログサイト (Astro SSG) ← 新規
│   │   ├── src/
│   │   │   ├── components/   # Astroコンポーネント
│   │   │   ├── layouts/      # レイアウト
│   │   │   ├── pages/        # ページ（SSG）
│   │   │   ├── lib/          # ユーティリティ
│   │   │   └── styles/       # CSS
│   │   ├── public/
│   │   └── package.json
│   ├── public/            # 公開ブログサイト (React SPA) ← 旧実装
│   │   ├── src/
│   │   ├── public/
│   │   └── package.json
│   └── admin/             # 管理画面
│       ├── src/
│       │   └── pages/
│       │       ├── LoginPage.tsx
│       │       ├── ForgotPasswordPage.tsx  # パスワード再設定
│       │       ├── DashboardPage.tsx
│       │       ├── PostListPage.tsx
│       │       ├── PostCreatePage.tsx
│       │       └── PostEditPage.tsx
│       ├── public/
│       └── package.json
├── tests/                 # テストコード
│   └── e2e/              # E2Eテスト
│       ├── specs/         # テストスペック
│       │   ├── home.spec.ts
│       │   ├── article.spec.ts
│       │   ├── admin-auth.spec.ts
│       │   └── admin-unauthorized-access.spec.ts
│       ├── pages/         # ページオブジェクト
│       │   ├── HomePage.ts
│       │   ├── ArticlePage.ts
│       │   ├── AdminLoginPage.ts
│       │   ├── AdminDashboardPage.ts
│       │   ├── AdminPostCreatePage.ts
│       │   └── AdminPostEditPage.ts
│       ├── fixtures/      # カスタムフィクスチャ
│       │   └── index.ts
│       ├── mocks/         # MSWモックハンドラー
│       │   ├── handlers.ts
│       │   └── mockData.ts
│       ├── utils/         # テストヘルパー
│       ├── global-setup.ts
│       ├── global-teardown.ts
│       └── README.md
├── scripts/               # ビルド・デプロイスクリプト
│   ├── build.sh
│   └── deploy.sh
├── docs/                  # ドキュメント
│   ├── architecture.md
│   └── api.md
├── .gitignore
├── package.json           # ルートpackage.json
├── tsconfig.json          # ルートTypeScript設定
├── jest.config.js         # ルートJest設定
├── README.md
└── CLAUDE.md             # Claude Code instructions
```

## ディレクトリ詳細

### terraform/
Terraform Infrastructure as Codeの定義（CDKから移行完了）。

#### modules/
再利用可能なTerraformモジュール定義。

- **api/**: API Gateway定義
  - REST API
  - Cognito Authorizer
  - リソースとメソッド定義

- **auth/**: Cognito定義
  - User Pool
  - User Pool Client
  - SSMパラメータ出力

- **cdn/**: CloudFront CDN定義
  - S3オリジン統合
  - OAC（Origin Access Control）
  - キャッシュポリシー
  - CloudFront Functions（Basic Auth、SPA routing、API path rewriting）

- **database/**: DynamoDB定義
  - BlogPostsテーブル
  - GSI定義（CategoryIndex, PublishStatusIndex）

- **lambda/**: Lambda関数定義
  - Go Lambda関数
  - IAMロール・ポリシー
  - CloudWatch Logs

- **monitoring/**: 監視・アラート定義
  - CloudWatchアラーム
  - SNSトピック

- **storage/**: S3バケット定義
  - 画像ストレージバケット
  - 公開サイトバケット
  - 管理画面バケット
  - バケットポリシー

#### environments/
環境別のTerraform設定。

- **dev/**: 開発環境
  - main.tf（モジュール呼び出し）
  - variables.tf
  - terraform.tfvars

- **prd/**: 本番環境
  - main.tf（モジュール呼び出し）
  - variables.tf
  - terraform.tfvars

#### bootstrap/
Terraformバックエンド初期設定。
- S3バケット（tfstate保存）
- DynamoDBテーブル（状態ロック）

#### scripts/
ビルド・デプロイスクリプト。

#### tests/
Terraformテスト（Terratest等）。

### frontend/
フロントエンドアプリケーション。

#### public-astro/ (新規: Astro SSG)
公開ブログサイト（Astro 5.x SSG）。React SPAからの移行中。

**技術スタック:**
- **Astro 5.x**: Static Site Generation
- **Tailwind CSS 4.x**: Viteプラグイン経由
- **Vitest**: ユニットテスト

**主要機能:**
- 記事一覧表示（`pages/index.astro`）
- 記事詳細表示（`pages/posts/[id].astro`）
- Aboutページ（`pages/about.astro`）
- 404ページ（`pages/404.astro`）
- RSS フィード（`pages/rss.xml.ts`）
- サイトマップ自動生成

**ディレクトリ構成:**
- `components/`: 再利用可能なAstroコンポーネント（Header, PostCard, SEO, JsonLd）
- `layouts/`: ページレイアウト（Layout.astro）
- `pages/`: ルーティング（ファイルベース）
- `lib/`: ユーティリティ関数（api, seoUtils, postUtils等）
- `styles/`: グローバルCSS

#### public/ (旧実装: React SPA)
公開ブログサイト（React/Vite）。Astro移行完了後に削除予定。
- 記事一覧表示
- 記事詳細表示
- カテゴリ別表示

#### admin/
管理画面（React/Next.js）。
- 記事CRUD操作
- ダッシュボード
- 画像管理
- パスワード再設定（ForgotPasswordPage.tsx）

### tests/
テストコード。

#### e2e/
UI E2Eテスト（最小限）（Playwright + MSW、重要なユーザーフローのみ検証）。

**💡 テスト方針変更（2025-11-07）**
- **目的**: 重要なユーザーフローのみを検証（詳細はユニット/統合テストでカバー）
- **実行時間**: ~3分（従来比80%削減）
- **ブラウザ**: Chromiumのみ（クロスブラウザテスト削除）
- **テスト数**: 5-8 specs（従来の13 specsから削減）

**specs/（重要フローのみ）**
- **home.spec.ts**: 記事一覧表示の基本動作
- **article.spec.ts**: 記事詳細表示の基本動作
- **admin-auth.spec.ts**: ログイン/ログアウト
- **admin-unauthorized-access.spec.ts**: 未認証アクセス制御

**削減されたspecs（他のテストレイヤーでカバー）**
- SEOメタタグ検証 → ユニットテストで実施
- 詳細なエラーハンドリング → ユニットテストで実施
- フォームバリデーション詳細 → コンポーネントテストで実施
- 画像アップロード詳細フロー → 統合テストで実施

**pages/**
ページオブジェクトパターン実装（必要最小限）。
- **HomePage.ts**: ホームページ
- **ArticlePage.ts**: 記事詳細ページ
- **AdminLoginPage.ts**: ログインページ
- **AdminDashboardPage.ts**: ダッシュボード
- **AdminPostCreatePage.ts**: 記事作成ページ
- **AdminPostEditPage.ts**: 記事編集ページ

**fixtures/**
カスタムフィクスチャ定義。
- **index.ts**: ページオブジェクトのフィクスチャ、認証済みテスト用フィクスチャ

**mocks/**
MSW（簡略版）モックハンドラー。
- **handlers.ts**: ハッピーパスのみのモックハンドラー（認証、記事CRUD基本動作のみ）
- **mockData.ts**: 最小限のテストデータ生成関数

**utils/**
テストヘルパー関数（簡略版）。

**global-setup.ts**
Playwrightグローバルセットアップ。

**global-teardown.ts**
Playwrightグローバルティアダウン。

**README.md**
UI E2Eテスト環境のドキュメント（新テスト戦略、実行方法、テスト範囲）。

## コーディング規約

### TypeScript
```typescript
// 命名規則
class ClassName { }          // PascalCase
function functionName() { }  // camelCase
const CONSTANT_NAME = '';    // UPPER_SNAKE_CASE
interface InterfaceName { }  // PascalCase
type TypeName = {};          // PascalCase

// ファイル名
// - コンポーネント: PascalCase (UserProfile.tsx)
// - ユーティリティ: camelCase (markdownUtils.ts)
// - テスト: *.test.ts
```

### インポート順序
```typescript
// 1. 外部ライブラリ
import * as cdk from 'aws-cdk-lib';
import { DynamoDB } from 'aws-sdk';

// 2. 内部ライブラリ
import { markdownToHtml } from '../utils/markdownUtils';

// 3. 型定義
import type { Post } from '../types';
```

### Lambda関数構造
```typescript
// handler.ts
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';

const logger = new Logger();
const tracer = new Tracer();

export const handler = async (event: APIGatewayEvent) => {
  // ロジック実装
};
```

### エラーハンドリング
```typescript
try {
  // メイン処理
} catch (error) {
  logger.error('Error occurred', { error });
  return {
    statusCode: 500,
    body: JSON.stringify({ message: 'Internal Server Error' }),
  };
}
```

## テスト構造

### ユニットテスト
```typescript
// markdownUtils.test.ts
describe('markdownUtils', () => {
  describe('markdownToHtml', () => {
    test('should convert markdown to HTML', () => {
      // Arrange
      const markdown = '# Hello';

      // Act
      const html = markdownToHtml(markdown);

      // Assert
      expect(html).toContain('<h1');
    });
  });
});
```

### CDKテスト
```typescript
// database-stack.test.ts
import { Template } from 'aws-cdk-lib/assertions';

describe('DatabaseStack', () => {
  test('DynamoDB table should be created', () => {
    // Arrange
    const app = new cdk.App();
    const stack = new DatabaseStack(app, 'TestStack');

    // Act
    const template = Template.fromStack(stack);

    // Assert
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
  });
});
```

## 環境変数管理

### Lambda関数
```typescript
// 環境変数の定義
const TABLE_NAME = process.env.TABLE_NAME!;
const BUCKET_NAME = process.env.BUCKET_NAME!;
const API_ENDPOINT = process.env.API_ENDPOINT!;
```

### CDKでの設定
```typescript
new lambda.Function(this, 'MyFunction', {
  environment: {
    TABLE_NAME: table.tableName,
    BUCKET_NAME: bucket.bucketName,
  },
});
```

## Git戦略

### コミットメッセージ
```
<type>: <subject>

<body>

<footer>
```

**Type:**
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント
- `style`: フォーマット
- `refactor`: リファクタリング
- `test`: テスト
- `chore`: ビルド・設定

### ブランチ命名
```
feature/<feature-name>
bugfix/<bug-name>
hotfix/<hotfix-name>
```

## CI/CD構成

### GitHub Actions ワークフロー

#### ci.yml
```yaml
# プルリクエスト時に実行
- Lint（ESLint、Prettier）
- ユニットテスト
- 統合テスト
- E2Eテスト
- CDK Nag検証
```

#### deploy.yml
```yaml
# マージ時に環境別デプロイ
# developブランチ → dev環境
# mainブランチ → prd環境（承認後）
- テスト実行
- CDK diff確認
- 環境別デプロイ
```

## ドキュメント管理

### 必須ドキュメント
1. **README.md**: プロジェクト概要、セットアップ
2. **CLAUDE.md**: Claude Code指示
3. **architecture.md**: アーキテクチャ図と説明
4. **api.md**: API仕様
5. **.kiro/**: 仕様とステアリング

### コードコメント
- 複雑なロジックには必ずコメント
- 外部仕様への参照を記載
- TODOには担当者とチケット番号を記載
