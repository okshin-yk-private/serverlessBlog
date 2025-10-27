# Structure Steering

## 現在の実装状況

**Last Updated**: 2025-10-27

### ✅ 実装完了
- **Task 1.1**: CDKプロジェクトの初期化とディレクトリ構造の作成
- **Task 1.2**: Lambda Powertools Layerの構築
  - `layers/powertools/nodejs/` - Lambda Powertools (Logger, Tracer, Metrics, Parameters)
- **Task 1.3**: 共通ユーティリティLayerの構築
  - `layers/common/nodejs/utils/markdownUtils.ts` - Markdown変換・XSS対策
  - `layers/common/nodejs/utils/s3Utils.ts` - S3操作・Pre-signed URL生成
  - `layers/common/nodejs/utils/dynamodbUtils.ts` - DynamoDB操作ヘルパー
- **Task 2.1**: DynamoDBテーブルとGlobal Secondary Indexesの定義
  - `infrastructure/lib/database-stack.ts` - BlogPostsテーブル、GSI定義
  - `infrastructure/test/database-stack.test.ts` - ユニット・スナップショットテスト
- **Task 2.2**: S3バケットの構成
  - `infrastructure/lib/storage-stack.ts` - 画像・公開サイト・管理画面バケット
  - `infrastructure/test/storage-stack.test.ts` - ユニット・スナップショットテスト
- **Task 3.1**: Cognito User Poolとアプリクライアントの設定
  - `infrastructure/lib/auth-stack.ts` - User Pool、User Pool Client定義
  - `infrastructure/test/auth-stack.test.ts` - ユニット・スナップショットテスト
- **Task 3.2**: API Gateway Cognito Authorizerの統合
  - `infrastructure/lib/api-stack.ts` - REST API、Cognito Authorizer、リソースパス定義
  - `infrastructure/test/api-stack.test.ts` - ユニット・スナップショットテスト

### 🚧 次のタスク
- **Task 4.1**: 記事作成機能の実装（マークダウン自動変換とHTML保存）

### 📋 未実装
- Lambda関数（記事CRUD、認証）
- フロントエンド（公開サイト・管理画面）
- CI/CDパイプライン

## プロジェクト構造

```
serverless_blog/
├── .github/
│   └── workflows/          # GitHub Actions CI/CD
│       ├── test.yml
│       ├── deploy-dev.yml
│       └── deploy-prd.yml
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
├── infrastructure/        # CDK Infrastructure code
│   ├── bin/
│   │   └── blog-app.ts    # CDK アプリエントリーポイント
│   ├── lib/               # CDK スタック定義
│   │   ├── layers-stack.ts
│   │   ├── database-stack.ts
│   │   ├── storage-stack.ts
│   │   ├── auth-stack.ts
│   │   └── api-stack.ts
│   ├── test/              # CDK テスト
│   │   ├── layers-stack.test.ts
│   │   ├── database-stack.test.ts
│   │   └── storage-stack.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── cdk.json
│   └── jest.config.js
├── layers/                # Lambda Layers
│   ├── powertools/        # Lambda Powertools
│   │   └── nodejs/
│   │       └── package.json
│   └── common/            # 共通ライブラリ
│       └── nodejs/
│           ├── package.json
│           └── utils/
│               ├── markdownUtils.ts
│               ├── s3Utils.ts
│               └── dynamodbUtils.ts
├── functions/             # Lambda 関数
│   ├── posts/
│   │   ├── createPost/
│   │   │   ├── index.ts
│   │   │   └── handler.ts
│   │   ├── getPost/
│   │   ├── updatePost/
│   │   ├── deletePost/
│   │   └── listPosts/
│   ├── auth/
│   │   ├── login/
│   │   ├── logout/
│   │   └── refresh/
│   └── shared/            # 共有コード
│       ├── types.ts
│       └── constants.ts
├── frontend/              # フロントエンドアプリケーション
│   ├── public/            # 公開ブログサイト
│   │   ├── src/
│   │   ├── public/
│   │   └── package.json
│   └── admin/             # 管理画面
│       ├── src/
│       ├── public/
│       └── package.json
├── tests/                 # テストコード
│   ├── unit/              # ユニットテスト
│   │   ├── functions/
│   │   └── layers/
│   ├── integration/       # 統合テスト
│   └── e2e/              # E2Eテスト
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

### infrastructure/
CDK Infrastructure as Codeの定義。

#### bin/
- **blog-app.ts**: CDKアプリのエントリーポイント
  - 環境変数からコンテキストを読み取り
  - 各スタックをインスタンス化

#### lib/
各AWSリソースのスタック定義。

- **layers-stack.ts**: Lambda Layers定義
  - Powertools Layer
  - 共通ライブラリLayer

- **database-stack.ts**: DynamoDB定義
  - BlogPostsテーブル
  - GSI定義（CategoryIndex, PublishStatusIndex）

- **storage-stack.ts**: S3バケット定義
  - 画像ストレージバケット
  - 公開サイトバケット
  - 管理画面バケット

- **auth-stack.ts**: Cognito定義
  - User Pool
  - User Pool Client
  - Identity Pool

- **api-stack.ts**: API Gateway + Lambda定義
  - REST API
  - Lambda統合
  - Cognito Authorizer

#### test/
CDKスタックのテスト。
- ユニットテスト
- スナップショットテスト
- インテグレーションテスト

### layers/
Lambda Layersのコード。

#### powertools/
Lambda Powertools for TypeScript。
- Logger
- Tracer
- Metrics
- Parameters

#### common/
プロジェクト共通ライブラリ。
- **markdownUtils.ts**: Markdown → HTML変換、XSS対策
- **s3Utils.ts**: S3操作、Pre-signed URL生成
- **dynamodbUtils.ts**: DynamoDB操作ヘルパー

### functions/
Lambda関数のコード。

#### posts/
記事関連のLambda関数。
- **createPost**: 記事作成
- **getPost**: 記事取得
- **updatePost**: 記事更新
- **deletePost**: 記事削除
- **listPosts**: 記事一覧取得

#### auth/
認証関連のLambda関数。
- **login**: ログイン処理
- **logout**: ログアウト処理
- **refresh**: トークン更新

#### shared/
Lambda関数間で共有するコード。
- **types.ts**: TypeScript型定義
- **constants.ts**: 定数定義

### frontend/
フロントエンドアプリケーション。

#### public/
公開ブログサイト（React/Next.js）。
- 記事一覧表示
- 記事詳細表示
- カテゴリ別表示

#### admin/
管理画面（React/Next.js）。
- 記事CRUD操作
- ダッシュボード
- 画像管理

### tests/
テストコード。

#### unit/
ユニットテスト。
- Lambda関数のユニットテスト
- ユーティリティ関数のテスト

#### integration/
統合テスト。
- API エンドポイントテスト
- DynamoDB統合テスト

#### e2e/
E2Eテスト。
- ユーザーシナリオテスト

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

#### test.yml
```yaml
# プルリクエスト時に実行
- ユニットテスト
- 統合テスト
- CDK Nag検証
- TypeScriptコンパイル
```

#### deploy-dev.yml
```yaml
# developブランチへのマージ時に実行
- テスト実行
- CDK diff確認
- dev環境へデプロイ
```

#### deploy-prd.yml
```yaml
# mainブランチへのマージ時に実行
- テスト実行
- CDK diff確認
- 承認待機
- prd環境へデプロイ
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
