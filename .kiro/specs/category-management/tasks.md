# Implementation Plan

## Task 1. DynamoDBカテゴリテーブルの作成

- [x] 1.1 (P) Terraformモジュールでカテゴリテーブルを定義
  - Categoriesテーブルをdatabaseモジュールに追加し、パーティションキー`id`(String)を設定
  - PAY_PER_REQUESTビリングモードを設定
  - Point-in-Time Recoveryを有効化
  - サーバーサイド暗号化（AWS管理キー）を有効化
  - `slug`をパーティションキーとするSlugIndex GSI（KEYS_ONLY）を作成
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6_

- [x] 1.2 (P) カテゴリテーブル定義のテスト実装
  - Terraformモジュールの構文検証（terraform validate）
  - セキュリティスキャン（Checkov）の実行と問題解消
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

## Task 2. カテゴリ一覧取得APIの実装

- [x] 2.1 カテゴリ一覧取得Lambda関数の実装（TDD）
  - 全カテゴリをDynamoDB Scanで取得しsortOrder昇順でソート
  - id、name、slug、sortOrderフィールドを返却
  - カテゴリが存在しない場合は空配列と200ステータスを返却
  - CORSヘッダーを付与
  - X-Rayトレーシングを有効化
  - エラー時はJSON形式でmessageフィールドを含むレスポンスを返却
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 9.1, 9.5, 9.6_

- [x] 2.2 カテゴリ一覧取得APIのTerraform定義
  - GET /categories エンドポイントをAPI Gatewayに追加（認証不要）
  - Lambda関数のIAMロールにCategoriesテーブルのScan権限を付与
  - Lambda関数の環境変数にテーブル名を設定
  - _Requirements: 2.3, 2.5_

## Task 3. カテゴリ作成APIの実装

- [x] 3.1 カテゴリ作成Lambda関数の実装（TDD）
  - リクエストボディからname、slug（任意）、description（任意）、sortOrder（任意）を受け取る
  - nameが未入力または空の場合は400エラーを返却
  - nameが100文字を超える場合は400エラーを返却
  - slugが未指定の場合はnameからURL安全な形式で自動生成
  - slugが英数字・ハイフン以外を含む場合は400エラーを返却
  - SlugIndex Queryでslug重複をチェックし、重複時は409 Conflictを返却
  - sortOrderが未指定の場合は現在の最大値+1を自動設定
  - UUIDを生成してid、createdAt、updatedAtを設定
  - DynamoDB PutItemでカテゴリを保存し、201ステータスで作成済みカテゴリを返却
  - X-Rayトレーシング、構造化ログを実装
  - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 3.2 カテゴリ作成APIのTerraform定義
  - POST /admin/categories エンドポイントをAPI Gatewayに追加
  - Cognito Authorizerを設定
  - Lambda関数のIAMロールにCategoriesテーブルのPutItem、Query、Scan権限を付与
  - _Requirements: 3.2_

## Task 4. カテゴリ更新APIの実装

- [x] 4.1 カテゴリ更新Lambda関数の実装（TDD）
  - パスパラメータからカテゴリIDを取得
  - GetItemでカテゴリ存在チェックし、不存在時は404を返却
  - リクエストボディのname、slug、description、sortOrderで部分更新
  - nameが100文字を超える場合は400エラー
  - slugが変更された場合はSlugIndex Queryで重複チェック、重複時は409 Conflict
  - slug変更時はBlogPosts CategoryIndexから該当記事をQueryし、TransactWriteItemsで記事のcategoryフィールドとカテゴリを同時更新
  - updatedAtを現在時刻に自動更新
  - 200ステータスで更新済みカテゴリを返却
  - X-Rayトレーシング、構造化ログを実装
  - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 9.1, 9.3, 9.4, 9.5, 9.6_

- [x] 4.2 カテゴリ更新APIのTerraform定義
  - PUT /admin/categories/{id} エンドポイントをAPI Gatewayに追加
  - Cognito Authorizerを設定
  - Lambda関数のIAMロールにCategoriesテーブルのGetItem、UpdateItem、Query権限とBlogPostsテーブルのQuery、UpdateItem権限を付与
  - _Requirements: 4.2_

## Task 5. カテゴリsortOrder一括更新APIの実装

- [x] 5.1 sortOrder一括更新Lambda関数の実装（TDD）
  - リクエストボディからordersの配列（id、sortOrderのペア）を受け取る
  - 全IDのGetItemを実行し、存在しないIDがあれば400エラーと無効なIDリストを返却
  - TransactWriteItemsで全カテゴリのsortOrderとupdatedAtを一括更新（最大100件）
  - 200ステータスで更新済みカテゴリ配列を返却
  - X-Rayトレーシング、構造化ログを実装
  - _Requirements: 4B.1, 4B.3, 4B.4, 4B.5, 9.1, 9.5, 9.6_

- [x] 5.2 sortOrder一括更新APIのTerraform定義
  - PATCH /admin/categories/sort エンドポイントをAPI Gatewayに追加
  - Cognito Authorizerを設定
  - Lambda関数のIAMロールにCategoriesテーブルのGetItem、TransactWriteItems権限を付与
  - _Requirements: 4B.2_

## Task 6. カテゴリ削除APIの実装

- [x] 6.1 カテゴリ削除Lambda関数の実装（TDD）
  - パスパラメータからカテゴリIDを取得
  - GetItemでカテゴリ存在チェックし、不存在時は404を返却
  - BlogPosts CategoryIndexでslugをキーにQuery（Limit: 1）して記事参照をチェック
  - 記事が存在する場合は409 Conflictでカテゴリ使用中メッセージを返却
  - DynamoDB DeleteItemでカテゴリを削除し、204 No Contentを返却
  - X-Rayトレーシング、構造化ログを実装
  - _Requirements: 5.1, 5.3, 5.4, 5.5, 9.1, 9.5, 9.6_

- [x] 6.2 カテゴリ削除APIのTerraform定義
  - DELETE /admin/categories/{id} エンドポイントをAPI Gatewayに追加
  - Cognito Authorizerを設定
  - Lambda関数のIAMロールにCategoriesテーブルのGetItem、DeleteItem権限とBlogPostsテーブルのQuery権限を付与
  - _Requirements: 5.2_

## Task 7. 管理画面カテゴリAPIクライアントの実装

- [x] 7.1 (P) カテゴリAPIクライアント関数の実装（TDD）
  - fetchCategories: GET /categories呼び出しでカテゴリ一覧を取得
  - createCategory: POST /admin/categories呼び出しで新規カテゴリを作成（認証トークン付与）
  - updateCategory: PUT /admin/categories/{id}呼び出しでカテゴリを更新（認証トークン付与）
  - updateCategorySortOrders: PATCH /admin/categories/sort呼び出しでsortOrderを一括更新（認証トークン付与）
  - deleteCategory: DELETE /admin/categories/{id}呼び出しでカテゴリを削除（認証トークン付与）
  - エラーレスポンスのハンドリングとエラーメッセージ抽出
  - _Requirements: 6.8, 6.9_

## Task 8. 管理画面カテゴリ一覧ページの実装

- [x] 8.1 カテゴリ一覧ページコンポーネントの実装（TDD）
  - AdminLayoutラッパーでナビゲーション表示
  - fetchCategoriesでカテゴリ一覧を取得して表示
  - 各カテゴリのname、slug、sortOrderを一覧表示
  - ローディング中はスピナーを表示
  - エラー発生時はエラーメッセージを表示
  - _Requirements: 6.1, 6.2, 6.8_

- [x] 8.2 カテゴリ追加・編集・削除UIの実装（TDD）
  - 「カテゴリを追加」ボタンでカテゴリ編集ページへ遷移
  - 各カテゴリの「編集」ボタンでカテゴリ編集ページへ遷移
  - 「削除」ボタンで確認ダイアログを表示
  - 確認後にdeleteCategoryを呼び出し、成功時は一覧を更新
  - 削除失敗時（409 Conflict等）はエラーメッセージを表示
  - 操作成功時はトースト通知を表示
  - _Requirements: 6.3, 6.5, 6.6, 6.9_

- [x] 8.3 カテゴリ並び替え機能の実装（TDD）
  - @dnd-kit/coreを使用したドラッグ&ドロップUIを実装
  - ドラッグ完了時にupdateCategorySortOrdersを呼び出してsortOrderを更新
  - 楽観的UI更新でドラッグ結果を即時反映
  - API失敗時は元の並び順にロールバック
  - _Requirements: 6.7_

## Task 9. 管理画面カテゴリ編集ページの実装

- [x] 9.1 カテゴリ編集ページコンポーネントの実装（TDD）
  - URLパラメータでIDを取得し、IDがあれば編集モード、なければ新規作成モード
  - 編集モードではfetchCategoriesで該当カテゴリを取得してフォームに初期値設定
  - name（必須）、slug（任意）、description（任意）の入力フィールドを表示
  - フォームバリデーション（name必須、100文字以内）を実装
  - 送信時はcreateCategory/updateCategoryを呼び出し
  - 成功時はカテゴリ一覧ページへ遷移
  - エラー時（409 Conflict等）はエラーメッセージを表示
  - _Requirements: 6.3, 6.4_

## Task 10. 記事エディタのカテゴリドロップダウン動的化

- [x] 10.1 useCategoriesカスタムフックの実装（TDD）
  - 初回マウント時にfetchCategoriesを呼び出してカテゴリ一覧を取得
  - categories、loading、error、refetch関数を返却
  - _Requirements: 7.1, 7.3, 7.4_

- [x] 10.2 記事エディタのカテゴリドロップダウン更新（TDD）
  - ハードコードされたカテゴリリストを削除
  - useCategoriesフックでカテゴリを動的取得
  - sortOrder順でドロップダウンに表示
  - ローディング中はドロップダウンにローディング表示
  - 取得失敗時はエラーメッセージとリトライボタンを表示
  - 編集時は既存記事のカテゴリを選択状態に設定
  - 記事のカテゴリが一覧に存在しない場合は警告表示とカテゴリ再選択を促す
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

## Task 11. 管理画面ナビゲーション更新

- [x] 11.1 (P) カテゴリ管理メニューの追加
  - AdminHeaderのナビゲーションに「Categories」メニュー項目を追加
  - React Routerでカテゴリ一覧ページ（/categories）と編集ページ（/categories/new, /categories/edit/:id）のルートを追加
  - _Requirements: 6.1_

## Task 12. 初期カテゴリシーディングスクリプトの実装

- [x] 12.1 シーディングスクリプトの実装
  - Go Lambda関数でシーディングを実装（`go-functions/cmd/categories/seed/`）
  - 定義済みカテゴリ（tech、life、business、other）を投入
  - slug存在チェックで冪等性を保証（SlugIndex Query）
  - エラーハンドリングと実行ログ出力
  - TDD: 10テストケース、88.9%カバレッジ（init/main除外）
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

## Task 13. 統合テストの実装

- [x] 13.1 カテゴリAPI統合テストの実装
  - DynamoDB Localを使用したテスト環境構築
  - カテゴリCRUD全操作の統合テスト
  - slug重複時の409 Conflictテスト
  - 記事参照時の削除拒否テスト
  - sortOrder一括更新のトランザクションテスト
  - TDD: 22テストケース、全て成功（`tests/integration/categories/category-crud.integration.test.ts`）
  - _Requirements: 10.2_

- [x] 13.2 管理画面カテゴリUIコンポーネントテストの実装
  - CategoryListPage、CategoryEditPageの100%カバレッジテスト
  - ドラッグ&ドロップ操作のテスト（DndContext/useSortableモックによる統合テスト）
  - useCategoriesフックのテスト（13テスト）
  - TDD: 67テストケース（CategoryListPage: 31, CategoryEditPage: 23, useCategories: 13）
  - カバレッジ: 全コンポーネント100%（CategoryListPage, CategoryEditPage, useCategories, SortableCategoryItem）
  - _Requirements: 10.3_

- [ ]* 13.3 E2Eテストの実装
  - カテゴリ作成→一覧表示→編集→削除のハッピーパスフロー
  - 記事作成時のカテゴリドロップダウン動的表示テスト
  - _Requirements: 10.4_

## Requirements Coverage

| Requirement | Tasks |
|-------------|-------|
| 1.1, 1.2, 1.3, 1.4, 1.5, 1.6 | 1.1, 1.2 |
| 2.1, 2.2, 2.3, 2.4, 2.5 | 2.1, 2.2 |
| 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7 | 3.1, 3.2 |
| 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7 | 4.1, 4.2 |
| 4B.1, 4B.2, 4B.3, 4B.4, 4B.5 | 5.1, 5.2 |
| 5.1, 5.2, 5.3, 5.4, 5.5 | 6.1, 6.2 |
| 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9 | 7.1, 8.1, 8.2, 8.3, 9.1, 11.1 |
| 7.1, 7.2, 7.3, 7.4, 7.5, 7.6 | 10.1, 10.2 |
| 8.1, 8.2, 8.3, 8.4 | 12.1 |
| 9.1, 9.2, 9.3, 9.4, 9.5, 9.6 | 2.1, 3.1, 4.1, 5.1, 6.1 |
| 10.1, 10.2, 10.3, 10.4, 10.5 | 13.1, 13.2, 13.3 |
