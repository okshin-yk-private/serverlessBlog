# テストカバレッジガイド

> **⚠️ 要更新**: このドキュメントの一部はJest/Node.js時代のものです。
> 現在のバックエンドはGoネイティブテスト（`go-functions/`）、フロントエンドはVitestを使用しています。
> `functions/` や `infrastructure/` への参照は、`go-functions/` や `terraform/` に読み替えてください。

## 概要

このドキュメントでは、Serverless Blog Platformのテストカバレッジ戦略、カバレッジレポートの確認方法、およびカバレッジバッジの活用方法について説明します。

## カバレッジ目標

### プロジェクト全体の目標

**100%テストカバレッジ** - すべてのコンポーネントで100%カバレッジを達成

| コンポーネント | カバレッジ目標 | 測定対象 |
|--------------|--------------|---------|
| Backend (Go Lambda関数) | 100% | Statements, Branches, Functions, Lines |
| Infrastructure (Terraform) | N/A | Terraformテスト |
| Frontend (Public) | 100% | Statements, Branches, Functions, Lines |
| Frontend (Admin) | 100% | Statements, Branches, Functions, Lines |

### カバレッジメトリクス

各コンポーネントで以下のメトリクスを測定：

- **Statements (文)**: 実行された文の割合
- **Branches (分岐)**: 実行された分岐（if/else、三項演算子等）の割合
- **Functions (関数)**: 実行された関数の割合
- **Lines (行)**: 実行された行の割合

## カバレッジレポートの確認方法

### ローカル環境でのカバレッジ確認

#### 1. バックエンド（Go Lambda関数）のカバレッジ

```bash
# ユニットテスト実行 + カバレッジ収集
cd go-functions
go test ./... -v -coverprofile=coverage.out

# HTMLレポートを生成して開く
go tool cover -html=coverage.out -o coverage.html
open coverage.html
```

#### 2. フロントエンド（公開サイト）のカバレッジ

```bash
cd frontend/public
bun run test:coverage

# HTMLレポートを開く
open coverage/lcov-report/index.html
```

#### 3. フロントエンド（管理画面）のカバレッジ

```bash
cd frontend/admin
bun run test:coverage

# HTMLレポートを開く
open coverage/lcov-report/index.html
```

### カバレッジバッジの生成

すべてのコンポーネントのテストを実行後、カバレッジバッジを生成できます。

```bash
# すべてのコンポーネントでテストを実行
npm run test:coverage
cd infrastructure && npm run test:coverage && cd ..
cd frontend/public && npm run test:coverage && cd ../..
cd frontend/admin && npm run test:coverage && cd ../..

# カバレッジバッジを生成
npm run coverage:badges
```

生成されたバッジは `docs/badges/` ディレクトリに保存されます：

- `coverage-backend.svg` - バックエンドカバレッジバッジ
- `coverage-infrastructure.svg` - インフラストラクチャカバレッジバッジ
- `coverage-frontend-public.svg` - フロントエンド（公開サイト）カバレッジバッジ
- `coverage-frontend-admin.svg` - フロントエンド（管理画面）カバレッジバッジ
- `coverage-overall.svg` - 全体カバレッジバッジ

### CI/CDパイプラインでのカバレッジ確認

GitHub Actionsワークフローでは、自動的にカバレッジが収集され、レポートが生成されます。

#### 1. CI/CDワークフローの実行

プルリクエストまたはpushすると、`.github/workflows/ci-test.yml` が自動実行されます。

#### 2. カバレッジアーティファクトのダウンロード

GitHub Actionsの実行結果から、以下のアーティファクトをダウンロードできます：

- `backend-coverage` - バックエンドカバレッジレポート（HTML）
- `infrastructure-coverage` - インフラストラクチャカバレッジレポート（HTML）
- `frontend-public-coverage` - フロントエンド（公開サイト）カバレッジレポート（HTML）
- `frontend-admin-coverage` - フロントエンド（管理画面）カバレッジレポート（HTML）
- `coverage-badges` - カバレッジバッジ（SVG）

#### 3. カバレッジバッジの表示

生成されたカバレッジバッジは、README.mdやドキュメントに埋め込むことができます。

```markdown
## カバレッジ

![Overall Coverage](./docs/badges/coverage-overall.svg)
![Backend Coverage](./docs/badges/coverage-backend.svg)
![Infrastructure Coverage](./docs/badges/coverage-infrastructure.svg)
![Frontend (Public) Coverage](./docs/badges/coverage-frontend-public.svg)
![Frontend (Admin) Coverage](./docs/badges/coverage-frontend-admin.svg)
```

## カバレッジ閾値の設定

### Jest設定（jest.config.cjs）

各コンポーネントのJest設定で、カバレッジ閾値を100%に設定しています。

```javascript
module.exports = {
  // ... その他の設定 ...

  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
};
```

閾値を下回ると、テストが失敗します。

### CI/CDでの強制

GitHub Actionsワークフローでは、各コンポーネントのテストジョブで100%カバレッジが要求されます。

カバレッジが100%未満の場合、ワークフローは失敗し、プルリクエストはマージできません。

## カバレッジを向上させる方法

### 1. 未カバレッジコードの特定

HTMLカバレッジレポートを開いて、赤色（未実行）または黄色（部分実行）でハイライトされたコードを確認します。

```bash
open coverage/lcov-report/index.html
```

### 2. テストケースの追加

未カバレッジのコードパスに対して、テストケースを追加します。

```typescript
// 例: エラーハンドリングのテストケース追加
test('should handle DynamoDB error', async () => {
  // DynamoDBエラーをモック
  mockDynamoDBClient.on(GetCommand).rejects(new Error('DynamoDB error'));

  // Lambda関数を実行
  const result = await handler(event);

  // エラーレスポンスを検証
  expect(result.statusCode).toBe(500);
  expect(JSON.parse(result.body).message).toBe('Internal Server Error');
});
```

### 3. エッジケースのテスト

以下のようなエッジケースを必ずテストに含めます：

- **バリデーションエラー**: 必須フィールドの欠落、不正な形式
- **認証エラー**: 未認証アクセス、無効なトークン
- **データベースエラー**: DynamoDB操作の失敗
- **外部サービスエラー**: S3、Cognito等のエラー
- **境界値テスト**: 空文字列、null、undefined、大きな値

### 4. カバレッジ確認の自動化

プリコミットフックで、カバレッジチェックを自動化できます。

```bash
# .lintstagedrc.json に追加
{
  "*.ts": [
    "eslint --fix",
    "jest --bail --findRelatedTests --coverage"
  ]
}
```

## トラブルシューティング

### 問題: カバレッジが100%にならない

**原因1**: TypeScriptの型ガード（`?.` 演算子）や暗黙的な分岐

**解決策**: 明示的なnullチェックを使用

```typescript
// ❌ 暗黙的な分岐（カバレッジ測定困難）
const userId = event.requestContext?.authorizer?.claims?.sub;

// ✅ 明示的なnullチェック（カバレッジ測定可能）
if (!event.requestContext || !event.requestContext.authorizer || !event.requestContext.authorizer.claims) {
  throw new Error('Unauthorized');
}
const userId = event.requestContext.authorizer.claims.sub;
```

**原因2**: 未テストのエラーパス

**解決策**: すべてのcatch句とエラーハンドリングをテスト

```typescript
test('should handle unexpected error', async () => {
  mockDynamoDBClient.on(PutCommand).rejects(new Error('Unexpected error'));
  const result = await handler(event);
  expect(result.statusCode).toBe(500);
});
```

### 問題: カバレッジレポートが生成されない

**原因**: Jest設定の `collectCoverageFrom` が正しくない

**解決策**: `jest.config.cjs` を確認

```javascript
collectCoverageFrom: [
  'functions/**/*.ts',
  '!functions/**/index.ts',  // エントリーポイントは除外
  '!**/*.d.ts',              // 型定義ファイルは除外
  '!**/node_modules/**',     // node_modulesは除外
],
```

### 問題: CI/CDでカバレッジチェックが失敗する

**原因**: ローカルでは成功するが、CI/CD環境では失敗

**解決策**: 環境依存の問題を確認

```bash
# CI環境変数を設定してローカルでテスト
CI=true npm run test:coverage
```

## ベストプラクティス

### 1. TDD（テスト駆動開発）の実践

**RED → GREEN → REFACTOR**

1. **RED**: 失敗するテストを先に書く
2. **GREEN**: テストが通る最小限のコードを書く
3. **REFACTOR**: コードをリファクタリング

### 2. テストの構造化

**Arrange-Act-Assert** パターンを使用

```typescript
test('should create a post', async () => {
  // Arrange: テストデータを準備
  const event = createMockEvent({ title: 'Test Post' });

  // Act: テスト対象の関数を実行
  const result = await handler(event);

  // Assert: 結果を検証
  expect(result.statusCode).toBe(201);
});
```

### 3. モックの適切な使用

```typescript
// AWS SDK クライアントのモック
const mockDynamoDBClient = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  mockDynamoDBClient.reset();
});

test('should mock DynamoDB', async () => {
  mockDynamoDBClient.on(PutCommand).resolves({});
  // テスト実行
});
```

### 4. カバレッジメトリクスの追跡

定期的にカバレッジメトリクスを確認し、低下しないように注意します。

```bash
# カバレッジサマリーを確認
npm run test:coverage | grep "All files"
```

## 参考リンク

- [Jest - Code Coverage](https://jestjs.io/docs/configuration#coveragethreshold-object)
- [Istanbul.js - Coverage Reports](https://istanbul.js.org/)
- [Testing Best Practices](https://testingjavascript.com/)
- [TDD Guide](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

## まとめ

- **100%カバレッジ目標**: すべてのコンポーネントで100%カバレッジを維持
- **自動化**: CI/CDパイプラインで自動的にカバレッジを収集・検証
- **可視化**: HTMLレポートとバッジでカバレッジを可視化
- **TDD実践**: テスト駆動開発でカバレッジを自然に達成
