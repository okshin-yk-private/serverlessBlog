# テスト戦略ドキュメント

> **⚠️ 要更新**: このドキュメントの一部はNode.js Lambda時代のものです。
> バックエンドはGoで実装（`go-functions/`）、フロントエンドはVitestを使用しています。

**最終更新日**: 2025-11-07
**ドキュメントバージョン**: 2.0
**変更理由**: フルE2Eテストの複雑さとテスト実行時間の削減

---

## エグゼクティブサマリー

このドキュメントでは、サーバーレスブログプラットフォームの新しいテスト戦略を定義します。従来の包括的なフルE2Eテストアプローチから、**階層化されたテスト戦略（UI E2Eテストは最小限）**へ移行し、以下の目標を達成します：

- ⏱️ **テスト実行時間の80%削減**（~15分 → ~3分）
- 🔧 **保守コストの50%削減**
- ✅ **同等以上のテストカバレッジ維持**
- 🚀 **開発速度の向上**

---

## テスト階層の定義

### 1. ユニットテスト（主要レイヤー）

**目的**: 個別のコンポーネント、関数、モジュールの詳細な動作検証

#### 対象
- Lambda関数（全9関数）
- ユーティリティ関数（markdown変換、S3操作、DynamoDB操作）
- フロントエンドコンポーネント（React）
- カスタムフック
- APIクライアント関数

#### ツール
- **Jest**: テストフレームワーク
- **React Testing Library**: Reactコンポーネントテスト
- **AWS SDK Mock**: AWS SDK呼び出しのモック

#### カバレッジ目標
- **100%必須**（行、分岐、関数、ステートメント）
- CI/CDパイプラインでカバレッジ100%未満の場合はビルド失敗

#### テスト項目
- ✅ 正常系処理
- ✅ 異常系処理（バリデーションエラー、認証エラー）
- ✅ エッジケース（空文字、null、undefined）
- ✅ フォームバリデーション詳細
- ✅ エラーメッセージ表示
- ✅ ローディング状態
- ✅ 条件分岐レンダリング

#### 実行時間
- **目標**: < 30秒
- **並列実行**: 有効

#### 例
```typescript
// tests/unit/functions/createPost.test.ts
describe('createPost', () => {
  test('should create post with valid data', async () => {
    // Arrange
    const event = mockAPIGatewayEvent({ title: 'Test', content: '...' });

    // Act
    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(201);
  });

  test('should return 400 if title is missing', async () => {
    // バリデーションエラーのテスト
  });
});
```

---

### 2. 統合テスト（コンポーネント連携）

**目的**: 複数のコンポーネント/サービスが正しく連携することを検証

#### 対象
- APIエンドポイント（全8エンドポイント）
- DynamoDB CRUD操作
- DynamoDB GSIクエリ（CategoryIndex、PublishStatusIndex）
- 認証フロー（Cognito）
- ページネーション処理

#### ツール
- **Jest**: テストフレームワーク
- **DynamoDB Local**: Dockerコンテナで実行
- **AWS SDK**: 実際のSDKを使用（モック不使用）

#### 実行環境
- **Docker Compose**: DynamoDB Localをコンテナで起動
- **LocalStack**: Cognito認証テスト用

#### カバレッジ目標
- **全APIエンドポイント**: 100%
- **全DynamoDB操作**: CRUD、GSIクエリ、ページネーション

#### テスト項目
- ✅ API Gateway → Lambda → DynamoDB の統合動作
- ✅ 認証トークンの検証
- ✅ GSIを使用したクエリ最適化
- ✅ ページネーション（LastEvaluatedKey、ExclusiveStartKey）
- ✅ トランザクション処理
- ✅ 並行処理と競合状態
- ✅ 画像アップロード詳細フロー（Pre-signed URL生成）

#### 実行時間
- **目標**: < 2分
- **並列実行**: 可能な範囲で有効

#### 例
```typescript
// tests/integration/functions/createPost.integration.test.ts
describe('POST /posts Integration Test', () => {
  test('should create post and retrieve it', async () => {
    // Arrange
    const postData = { title: 'Test', content: 'Content' };

    // Act: API経由で記事作成
    const createResponse = await apiClient.post('/posts', postData);
    const postId = createResponse.data.id;

    // Assert: DynamoDBから直接取得して検証
    const item = await dynamoDb.get({ TableName, Key: { id: postId } });
    expect(item.title).toBe('Test');
  });
});
```

---

### 3. UI E2Eテスト（最小限）

**目的**: 重要なユーザーフローのみを検証（詳細は他レイヤーで実施済み）

#### 対象（5-8個のspecファイルのみ）
1. **home.spec.ts**: 記事一覧表示の基本動作
2. **article.spec.ts**: 記事詳細閲覧の基本動作
3. **admin-auth.spec.ts**: ログイン/ログアウト
4. **admin-crud.spec.ts**: 記事作成・編集・削除の統合フロー
5. **admin-dashboard.spec.ts**: ダッシュボード基本動作

#### ツール
- **Playwright**: ブラウザ自動化
- **MSW（Mock Service Worker）**: APIモック（ハッピーパスのみ）

#### ブラウザ
- **Chromiumのみ**（クロスブラウザテスト削除）
- Firefox、WebKit、モバイルブラウザは削除

#### カバレッジ目標
- **重要フローのみ**: 5-8シナリオ
- **実行時間**: < 3分

#### MSWモック方針
- **ハッピーパスのみ**をモック
- 複雑なエラーハンドリングは**ユニットテストで実施**
- モックハンドラーは必要最小限

#### テスト項目
- ✅ ログイン → ダッシュボード遷移
- ✅ 記事一覧表示 → 記事詳細閲覧
- ✅ 記事作成 → 保存 → 一覧に表示
- ✅ 記事編集 → 更新 → 表示確認
- ✅ 記事削除 → 一覧から削除確認

#### 実行時間
- **目標**: < 3分
- **並列実行**: 無効（Playwrightのworker=1）

#### 例
```typescript
// tests/e2e/specs/admin-crud.spec.ts
test('should create, edit, and delete post', async ({ page, adminLoginPage }) => {
  // ログイン
  await adminLoginPage.login('admin@example.com', 'password');

  // 記事作成
  await page.click('[data-testid="create-post-button"]');
  await page.fill('[data-testid="title-input"]', 'Test Post');
  await page.fill('[data-testid="content-input"]', 'Test Content');
  await page.click('[data-testid="save-button"]');

  // 記事一覧に表示されることを確認
  await expect(page.locator('text=Test Post')).toBeVisible();

  // 記事編集
  await page.click('[data-testid="edit-button"]');
  await page.fill('[data-testid="title-input"]', 'Updated Post');
  await page.click('[data-testid="save-button"]');

  // 記事削除
  await page.click('[data-testid="delete-button"]');
  await page.click('[data-testid="confirm-delete"]');

  // 記事一覧から削除されていることを確認
  await expect(page.locator('text=Updated Post')).not.toBeVisible();
});
```

---

## 削減されたテスト項目と移行先

### ❌ 削除されたテスト（UI E2Eテスト層から）

| 削減項目 | 移行先 | 理由 |
|---------|--------|-----|
| クロスブラウザテスト（Firefox, WebKit, Mobile） | 削除 | Chromiumで十分、実行時間削減 |
| SEOメタタグ検証（seo-meta-tags.spec.ts） | ユニットテスト | コンポーネントレベルで検証可能 |
| 詳細なエラーハンドリング（error-handling.spec.ts） | ユニットテスト | 各関数で詳細にテスト済み |
| フォームバリデーション詳細（admin-form-validation.spec.ts） | コンポーネントテスト | React Testing Libraryで検証 |
| 画像アップロード詳細フロー（admin-image-upload.spec.ts） | 統合テスト | APIレベルで検証済み |
| 未認証アクセステスト詳細（unauthorized-access.spec.ts × 2） | 統合テスト | 認証フロー統合テストで実施 |
| レスポンシブデザイン詳細検証 | コンポーネントテスト | CSSテスト、ビューポートテスト |

---

## テスト実行戦略

### ローカル開発時

```bash
# ユニットテストのみ（高速フィードバック）
npm run test

# 統合テスト（機能開発完了後）
npm run test:integration

# UI E2Eテスト（プルリクエスト前）
npm run test:e2e
```

### CI/CDパイプライン

#### プルリクエスト時
1. ユニットテスト実行（並列）
2. 統合テスト実行（並列）
3. UI E2Eテスト実行（直列）
4. カバレッジレポート生成
5. カバレッジ100%未満の場合はビルド失敗

#### develop/mainブランチマージ時
- 上記すべてのテストを実行
- すべてのテストが成功した場合のみデプロイ

---

## テスト実行時間の比較

| テスト層 | 従来 | 新戦略 | 削減率 |
|---------|------|--------|--------|
| ユニットテスト | 30秒 | 30秒 | 0% |
| 統合テスト | 2分 | 2分 | 0% |
| UI E2Eテスト | 15分 | 3分 | **80%** |
| **合計** | **17.5分** | **5.5分** | **69%** |

---

## カバレッジ目標

| テスト層 | カバレッジ目標 | 測定対象 |
|---------|---------------|---------|
| ユニットテスト | **100%** | Lambda関数、フロントエンドコンポーネント |
| 統合テスト | **100%** | 全APIエンドポイント、DynamoDB操作 |
| UI E2Eテスト | **重要フロー5-8個** | ユーザーシナリオ |

---

## メンテナンス方針

### ユニットテスト
- **更新頻度**: 機能追加・修正のたびに更新
- **保守担当**: 機能開発者
- **レビュー**: プルリクエストで必須

### 統合テスト
- **更新頻度**: APIエンドポイント変更時
- **保守担当**: バックエンド開発者
- **レビュー**: APIスキーマ変更時は必須

### UI E2Eテスト
- **更新頻度**: 重要フロー変更時のみ
- **保守担当**: QAエンジニア
- **レビュー**: ユーザーフロー変更時は必須

---

## モック戦略

### ユニットテスト
- **AWS SDK**: 完全にモック（jest.mock）
- **外部API**: 完全にモック
- **理由**: 高速実行、決定論的テスト

### 統合テスト
- **DynamoDB**: DynamoDB Local（実物）
- **S3**: S3モック（LocalStack）
- **Cognito**: LocalStack
- **理由**: 実際の動作検証

### UI E2Eテスト
- **Backend API**: MSW（ハッピーパスのみ）
- **理由**: フロントエンド単独でのテスト実行

---

## まとめ

新しいテスト戦略では、**テストピラミッド**の原則に従い、以下の階層でテストを実施します：

```
       ▲
      / \
     /   \    UI E2Eテスト (5-8 specs)
    /     \   - 重要フロー
   /       \  - 3分
  /_________\
  |         | 統合テスト (46 tests)
  |         | - API/DB連携
  |_________| - 2分
  |         |
  |         | ユニットテスト (200+ tests)
  |         | - 詳細動作
  |_________| - 30秒
```

### 主な変更点
1. **テスト実行時間**: 69%削減（17.5分 → 5.5分）
2. **メンテナンスコスト**: 50%削減
3. **カバレッジ**: 同等以上を維持（ユニットテスト100%）
4. **開発速度**: フィードバックループの高速化

### 期待される効果
- ⚡ より高速なCI/CDパイプライン
- 🔧 より保守しやすいテストコード
- ✅ より高いテスト信頼性
- 🚀 より速い開発サイクル

---

**参考資料**:
- [Testing Pyramid - Martin Fowler](https://martinfowler.com/bliki/TestPyramid.html)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [AWS SDK Jest Mocking](https://aws.amazon.com/blogs/developer/mocking-modular-aws-sdk-for-javascript-v3-in-unit-tests/)
