# Research & Design Decisions

## Summary
- **Feature**: category-management
- **Discovery Scope**: Extension（既存システムの拡張）
- **Key Findings**:
  - 既存のDynamoDB・Go Lambda・Terraform・React Adminパターンを完全に踏襲可能
  - BlogPostsテーブルのCategoryIndexを活用したカテゴリ使用状況チェックが必要
  - 新規技術の導入なし（既存スタックで実装可能）

## Research Log

### 既存DynamoDBパターン分析
- **Context**: カテゴリマスタテーブル設計のための既存パターン調査
- **Sources Consulted**: `terraform/modules/database/main.tf`
- **Findings**:
  - BlogPostsテーブル: PAY_PER_REQUEST, PITR有効, SSE暗号化
  - GSIパターン: CategoryIndex (partition: category, sort: createdAt)
  - タグ付け: Name, Environment, Module, ManagedBy
- **Implications**: Categoriesテーブルも同様のセキュリティ・課金設定を適用

### 既存API Gatewayパターン分析
- **Context**: カテゴリAPI設計のための既存パターン調査
- **Sources Consulted**: `terraform/modules/api/main.tf`
- **Findings**:
  - パブリックエンドポイント: `/posts` (authorization = "NONE")
  - 保護エンドポイント: `/admin/posts` (COGNITO_USER_POOLS + authorizer_id)
  - CORSパターン: OPTIONSメソッド + Gateway Response 4xx/5xx
  - Lambda統合: AWS_PROXY型
- **Implications**: `/categories`は公開、`/admin/categories`はCognito認証

### 既存Go Lambdaパターン分析
- **Context**: カテゴリLambda関数設計のための既存パターン調査
- **Sources Consulted**:
  - `go-functions/cmd/posts/create/main.go`
  - `go-functions/internal/domain/types.go`
- **Findings**:
  - ハンドラ構造: extractAuthorID → validate → process → response
  - ドメイン型: `internal/domain/types.go`に集約
  - クライアント: `internal/clients/`でDynamoDB/Cognito取得
  - レスポンス: `middleware.JSONResponse()`でCORS付きJSON返却
  - テスト: モック注入用の`var xxxGetter = func()`パターン
- **Implications**: Category型・リクエスト型を`types.go`に追加、同一ハンドラ構造を踏襲

### 既存管理画面パターン分析
- **Context**: カテゴリ管理UIのための既存パターン調査
- **Sources Consulted**:
  - `frontend/admin/src/pages/PostListPage.tsx`
  - `frontend/admin/src/api/posts.ts`
- **Findings**:
  - ページ構造: AdminLayout + useState/useEffect + API呼び出し
  - API層: axios + `VITE_API_URL` + `getAuthToken()`
  - 状態管理: posts, loading, error, successMessage
  - 確認ダイアログ: ConfirmDialogコンポーネント
  - スタイル: Tailwind CSS + `admin-*`クラス
- **Implications**: CategoryListPage, CategoryEditPageを同一パターンで実装

### カテゴリ-記事参照整合性
- **Context**: カテゴリ削除時の整合性チェック方法
- **Sources Consulted**: `terraform/modules/database/main.tf` (CategoryIndex定義)
- **Findings**:
  - BlogPostsテーブルのCategoryIndexでカテゴリ別記事検索が可能
  - 削除前にCategoryIndexをQueryしてカウントチェック
- **Implications**:
  - 削除APIで参照チェック実装（count > 0 なら409 Conflict）
  - 記事側は`category`フィールドをそのまま維持（外部キー制約なし）

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| 既存パターン踏襲 | DynamoDB + Go Lambda + Terraform構成を拡張 | 一貫性、学習コストなし、実績あり | なし | 採用 |
| カテゴリをBlogPostsテーブルに埋め込み | 単一テーブル設計 | テーブル数削減 | カテゴリ一覧取得が非効率、マスタ管理困難 | 不採用 |

## Design Decisions

### Decision: カテゴリマスタを独立テーブル化
- **Context**: カテゴリデータの管理方法
- **Alternatives Considered**:
  1. BlogPostsテーブル内にカテゴリ属性を持つ（単一テーブル）
  2. 新規Categoriesテーブルを作成（マルチテーブル）
- **Selected Approach**: 新規Categoriesテーブル作成
- **Rationale**:
  - カテゴリ一覧の効率的な取得
  - ソート順序、説明文などの属性管理
  - 将来的な多言語対応への拡張性
- **Trade-offs**: テーブル管理が増えるが、運用上の影響は軽微
- **Follow-up**: 記事作成時のカテゴリ存在チェックは任意（既存動作を維持）

### Decision: Slug一意性の実装方法
- **Context**: カテゴリSlugの一意性保証
- **Alternatives Considered**:
  1. DynamoDB Transactions（PutItem条件式）
  2. GSI + Query後にPutItem
- **Selected Approach**: SlugIndex GSI + Query後にPutItem
- **Rationale**:
  - トランザクションは過剰（低頻度操作）
  - GSI Queryは既存パターンと一致
- **Trade-offs**: 競合時の微小な競合可能性（許容範囲）
- **Follow-up**: なし

### Decision: ドラッグ&ドロップによるソート順変更
- **Context**: 要件6.7のdrag-and-drop実装方法
- **Alternatives Considered**:
  1. @dnd-kit/core ライブラリ
  2. react-beautiful-dnd ライブラリ
  3. カスタム実装
- **Selected Approach**: @dnd-kit/core
- **Rationale**:
  - アクティブにメンテナンスされている
  - React 18対応
  - TypeScript型定義完備
- **Trade-offs**: 新規依存関係追加（bundle size増加は軽微）
- **Follow-up**: bun installで依存関係追加

## Risks & Mitigations
- **Risk 1**: カテゴリ削除時に記事との整合性問題 — 削除前にCategoryIndex Queryで使用状況チェック、使用中なら409 Conflict返却
- **Risk 2**: マイグレーションスクリプトの冪等性 — slugをキーとした条件付きPutItem（attribute_not_exists(slug)）
- **Risk 3**: sortOrder更新時の競合 — 一括更新APIで全件更新（低頻度操作のため許容）

## References
- [DynamoDB ベストプラクティス](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [@dnd-kit/core](https://docs.dndkit.com/) — React drag and drop toolkit
- 既存実装: `terraform/modules/database/main.tf`, `go-functions/cmd/posts/create/main.go`
