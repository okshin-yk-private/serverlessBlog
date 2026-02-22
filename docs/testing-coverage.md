# テストカバレッジ設定ドキュメント

> **⚠️ 要更新**: このドキュメントの一部はJest/Node.js Lambda時代のものです。
> バックエンドはGoネイティブテスト（`go-functions/`）、フロントエンドはVitestを使用しています。
> `functions/` や `layers/` への参照は古い情報です。

## 概要

このプロジェクトでは、すべてのコードに対して**100%のテストカバレッジ**を要求しています。

### 関連要件
- **R40**: Lambda関数のテストカバレッジを100%にする
- **R41**: フロントエンドのテストカバレッジを100%にする
- **R45**: CI/CDパイプラインでテストを自動実行する

## Jest設定ファイル

### 1. ユニットテスト (Lambda関数・Layer)
**ファイル**: `tests/unit/jest.config.js`

```bash
cd tests/unit
npm test                  # テスト実行
npm run test:coverage     # カバレッジレポート生成
```

**カバレッジ対象**:
- `functions/**/*.ts` - すべてのLambda関数
- `layers/common/nodejs/**/*.ts` - 共通ユーティリティ

**除外**:
- `functions/**/index.ts` - エントリーポイント
- `**/*.d.ts` - 型定義ファイル

### 2. インフラストラクチャテスト (CDK)
**ファイル**: `infrastructure/jest.config.js`

```bash
cd infrastructure
npm test                  # テスト実行
npm run test:coverage     # カバレッジレポート生成
```

**カバレッジ対象**:
- `lib/**/*.ts` - すべてのCDKスタック

**除外**:
- `test/**` - テストファイル
- `**/*.d.ts` - 型定義ファイル

### 3. 公開サイト (フロントエンド)
**ファイル**: `frontend/public/jest.config.js`

```bash
cd frontend/public
npm test                  # テスト実行
npm run test:coverage     # カバレッジレポート生成
```

**カバレッジ対象**:
- `src/**/*.{ts,tsx}` - すべてのReactコンポーネント

**除外**:
- `src/index.tsx` - エントリーポイント
- `src/**/*.stories.tsx` - Storybookストーリー

### 4. 管理画面 (フロントエンド)
**ファイル**: `frontend/admin/jest.config.js`

```bash
cd frontend/admin
npm test                  # テスト実行
npm run test:coverage     # カバレッジレポート生成
```

**カバレッジ対象**:
- `src/**/*.{ts,tsx}` - すべてのReactコンポーネント

**除外**:
- `src/index.tsx` - エントリーポイント
- `src/**/*.stories.tsx` - Storybookストーリー

### 5. ルート統合設定
**ファイル**: `jest.config.js`

```bash
npm test                  # 全テスト実行
npm run test:coverage     # 全カバレッジレポート生成
```

## カバレッジ閾値

すべてのプロジェクトで以下の閾値を強制します:

```javascript
coverageThreshold: {
  global: {
    branches: 100,     // 分岐カバレッジ 100%
    functions: 100,    // 関数カバレッジ 100%
    lines: 100,        // 行カバレッジ 100%
    statements: 100,   // ステートメントカバレッジ 100%
  },
}
```

**重要**: カバレッジが100%未満の場合、テストは失敗します。

## カバレッジレポート形式

各プロジェクトで以下の形式のレポートを生成します:

### 1. HTML形式
- **用途**: ブラウザで詳細確認
- **場所**: `<project>/coverage/index.html`
- **特徴**: 視覚的に未カバー箇所を確認可能

### 2. JSON形式
- **用途**: CI/CD統合、プログラム処理
- **場所**: `<project>/coverage/coverage-final.json`
- **特徴**: 機械可読形式

### 3. LCOV形式
- **用途**: カバレッジバッジ生成、外部ツール統合
- **場所**: `<project>/coverage/lcov.info`
- **特徴**: 標準的なカバレッジフォーマット

### 4. Text形式
- **用途**: コンソール出力
- **場所**: 標準出力
- **特徴**: テスト実行時にサマリーを表示

## Istanbul統合

JestはIstanbulを内部で使用してカバレッジを測定します。

- **行カバレッジ** (Line Coverage): 実行された行の割合
- **分岐カバレッジ** (Branch Coverage): すべての条件分岐の実行割合
- **関数カバレッジ** (Function Coverage): 呼び出された関数の割合
- **ステートメントカバレッジ** (Statement Coverage): 実行されたステートメントの割合

## CI/CD統合

### GitHub Actions
テストワークフロー (`.github/workflows/test.yml`) で以下を実行:

```yaml
- name: Run unit tests with coverage
  run: cd tests/unit && npm run test:coverage

- name: Run infrastructure tests with coverage
  run: cd infrastructure && npm run test:coverage

- name: Check coverage threshold
  run: |
    # カバレッジが100%未満の場合、ビルド失敗
```

### カバレッジレポートのアップロード
- Codecov、Coveralls等のサービスにLCOVレポートをアップロード
- プルリクエストにカバレッジコメントを自動投稿

## ベストプラクティス

### 1. TDD (Test-Driven Development)
1. **RED**: テストを先に書く (失敗することを確認)
2. **GREEN**: 実装してテストを通す
3. **REFACTOR**: コードを改善

### 2. カバレッジ100%を維持する方法
- すべての関数・メソッドをテスト
- すべての分岐パターン (if/else, switch) をテスト
- エラーハンドリングパスをテスト
- エッジケースをテスト

### 3. モック使用
外部依存 (AWS SDK, API呼び出し) はモック化:

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);
ddbMock.on(PutCommand).resolves({ /* mock response */ });
```

### 4. カバレッジレポートの確認
```bash
# HTMLレポートをブラウザで開く
open coverage/index.html

# 未カバー箇所を特定
# レポート内の赤色ハイライト部分が未カバーコード
```

## トラブルシューティング

### カバレッジが100%に達しない場合
1. HTMLレポートで未カバー箇所を確認
2. 該当コードパスのテストを追加
3. デッドコード (到達不可能なコード) の場合は削除

### カバレッジが意図せず収集される場合
`collectCoverageFrom` の除外パターンを確認:

```javascript
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/index.ts',        // エントリーポイントを除外
  '!**/*.d.ts',           // 型定義を除外
]
```

### テストが遅い場合
- `--maxWorkers=4` でワーカー数を調整
- `--coverage` を外して通常実行

## 参考リンク

- [Jest公式ドキュメント - Code Coverage](https://jestjs.io/docs/configuration#collectcoveragefrom-array)
- [Istanbul公式ドキュメント](https://istanbul.js.org/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
