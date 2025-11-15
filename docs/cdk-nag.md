# CDK Nag セキュリティ検証ガイド

## 概要

このドキュメントでは、Serverless Blog PlatformにおけるCDK Nagの使用方法、セキュリティルールの適用、および抑制ルールの管理について説明します。

## CDK Nagとは

**CDK Nag**は、AWS CDKアプリケーションに対してセキュリティとベストプラクティスのルールを適用するツールです。

### 主な機能

- **AWS Solutions Checks**: AWSベストプラクティスに基づくルールセット
- **自動検証**: `cdk synth`時に自動的にセキュリティチェックを実行
- **抑制機能**: 正当な理由がある場合にルールを抑制可能
- **CI/CD統合**: GitHub Actionsで自動的にセキュリティ検証

### 検証カテゴリ

CDK Nagは以下のカテゴリでチェックを実行します：

1. **セキュリティ**: IAM、暗号化、ネットワーク設定
2. **信頼性**: 高可用性、バックアップ、障害対応
3. **パフォーマンス**: リソース最適化、スケーラビリティ
4. **コスト最適化**: 不要なリソース、適切なサイジング
5. **運用性**: ログ、監視、アラート

## セットアップ

### 1. 依存関係のインストール

CDK Nagは既に`infrastructure/package.json`に含まれています。

```json
{
  "dependencies": {
    "cdk-nag": "^2.28.0"
  }
}
```

### 2. CDKアプリへの統合

`infrastructure/bin/blog-app.ts`でCDK Nagを有効化：

```typescript
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';

const app = new cdk.App();

// CDK Nag: AWS Solutions Checksを適用
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
```

## ローカルでの使用

### CDK Nag チェックの実行

```bash
cd infrastructure

# CDK Synthesize（CDK Nag自動実行）
npm run cdk:synth

# または、CDK Nag出力のみを表示
npm run cdk:nag
```

### 出力例

```
[Error at /BlogStack/ApiStack/RestApi/Resource] AwsSolutions-APIG4: The API does not implement authorization.
[Warning at /BlogStack/DatabaseStack/BlogPostsTable] AwsSolutions-DDB3: The DynamoDB table does not have Point-in-time Recovery enabled.
```

### 出力の読み方

- **[Error]**: セキュリティ上の重大な問題。修正が必要
- **[Warning]**: ベストプラクティス違反。可能であれば修正すべき
- **ルールID**: `AwsSolutions-XXXX` 形式のルールID
- **リソースパス**: 問題のあるリソースのCDKパス
- **説明**: 違反の内容

## 主要なCDK Nagルール

### セキュリティルール

#### AwsSolutions-IAM4
**問題**: AWS管理ポリシーの使用

**推奨**: カスタムIAMポリシーを使用

```typescript
// ❌ 非推奨
role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));

// ✅ 推奨
role.addToPolicy(new PolicyStatement({
  actions: ['s3:GetObject', 's3:PutObject'],
  resources: [`${bucket.bucketArn}/*`]
}));
```

#### AwsSolutions-IAM5
**問題**: ワイルドカード（`*`）を使用したIAMアクション

**推奨**: 最小権限の原則に従って、具体的なアクションを指定

```typescript
// ❌ 非推奨
new PolicyStatement({
  actions: ['s3:*'],
  resources: ['*']
});

// ✅ 推奨
new PolicyStatement({
  actions: ['s3:GetObject', 's3:PutObject'],
  resources: [`${bucket.bucketArn}/images/*`]
});
```

#### AwsSolutions-S1
**問題**: S3バケットのサーバーアクセスログが無効

**推奨**: S3バケットアクセスログを有効化

```typescript
const bucket = new Bucket(this, 'MyBucket', {
  serverAccessLogsBucket: logBucket,
  serverAccessLogsPrefix: 'access-logs/'
});
```

#### AwsSolutions-S10
**問題**: S3バケットでHTTPS通信が強制されていない

**推奨**: バケットポリシーでHTTPS通信を強制

```typescript
bucket.addToResourcePolicy(new PolicyStatement({
  effect: Effect.DENY,
  principals: [new AnyPrincipal()],
  actions: ['s3:*'],
  resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
  conditions: {
    Bool: { 'aws:SecureTransport': 'false' }
  }
}));
```

### データベースルール

#### AwsSolutions-DDB3
**問題**: DynamoDBテーブルのPoint-in-time Recoveryが無効

**推奨**: Point-in-time Recoveryを有効化

```typescript
const table = new Table(this, 'MyTable', {
  pointInTimeRecovery: true
});
```

### API Gatewayルール

#### AwsSolutions-APIG1
**問題**: API Gatewayアクセスログが無効

**推奨**: CloudWatch Logsへのアクセスログを有効化

```typescript
const api = new RestApi(this, 'MyApi', {
  deployOptions: {
    accessLogDestination: new LogGroupLogDestination(logGroup),
    accessLogFormat: AccessLogFormat.jsonWithStandardFields()
  }
});
```

#### AwsSolutions-APIG2
**問題**: API Gatewayリクエストバリデーションが無効

**推奨**: リクエストバリデーションを有効化

```typescript
const api = new RestApi(this, 'MyApi', {
  deployOptions: {
    requestValidatorOptions: {
      validateRequestBody: true,
      validateRequestParameters: true
    }
  }
});
```

#### AwsSolutions-APIG4
**問題**: API Gatewayエンドポイントに認証が設定されていない

**推奨**: Cognito Authorizerを設定

```typescript
const authorizer = new CognitoUserPoolsAuthorizer(this, 'Authorizer', {
  cognitoUserPools: [userPool]
});

resource.addMethod('POST', integration, {
  authorizer
});
```

### Lambda関数ルール

#### AwsSolutions-L1
**問題**: Lambda関数が最新のランタイムを使用していない

**推奨**: 最新のランタイムバージョンを使用

```typescript
const fn = new Function(this, 'MyFunction', {
  runtime: Runtime.NODEJS_22_X  // 最新のNode.js LTS
});
```

## 抑制ルール（Suppressions）

正当な理由がある場合、特定のルールを抑制できます。

### スタックレベルでの抑制

```typescript
import { NagSuppressions } from 'cdk-nag';

// スタック全体に対する抑制
NagSuppressions.addStackSuppressions(this, [
  {
    id: 'AwsSolutions-IAM4',
    reason: 'AWS managed policies are acceptable for Lambda execution role in this use case'
  }
]);
```

### リソースレベルでの抑制

```typescript
import { NagSuppressions } from 'cdk-nag';

const bucket = new Bucket(this, 'ImagesBucket', {
  // バケット設定
});

// 特定のリソースに対する抑制
NagSuppressions.addResourceSuppressions(bucket, [
  {
    id: 'AwsSolutions-S1',
    reason: 'Access logging is not required for this public images bucket due to cost optimization'
  }
]);
```

### 抑制のベストプラクティス

1. **明確な理由を記載**: なぜ抑制が必要なのか、詳細に説明
2. **最小限の抑制**: 必要最小限のルールのみ抑制
3. **定期的なレビュー**: 抑制ルールを定期的に見直し
4. **代替策の検討**: 抑制する前に、ルールに準拠する方法を検討

### 抑制してはいけないルール

以下のルールは、セキュリティ上重要なため抑制しないでください：

- **AwsSolutions-IAM5**: ワイルドカードIAMアクション（最小権限の原則）
- **AwsSolutions-S10**: S3 HTTPS通信の強制
- **AwsSolutions-CFR4**: CloudFront HTTPS通信の強制
- **AwsSolutions-DDB3**: DynamoDB Point-in-time Recovery

## CI/CDでの使用

### GitHub Actionsワークフロー

`.github/workflows/ci-test.yml`の`infrastructure-tests`ジョブでCDK Nagが自動実行されます。

```yaml
- name: Run CDK Nag security checks
  run: |
    cd infrastructure
    npm run cdk:synth
```

### ビルド失敗

CDK Nagでエラーが検出された場合、ワークフローは失敗します。

**対応方法**:
1. エラーメッセージを確認
2. 該当するルールのドキュメントを参照
3. コードを修正してルールに準拠
4. または、正当な理由がある場合は抑制ルールを追加

## トラブルシューティング

### 問題: CDK Nag チェックが失敗する

**原因**: セキュリティルール違反

**解決策**:
1. エラーメッセージからルールIDを確認
2. 該当するセクションのこのドキュメントを参照
3. コードを修正するか、抑制ルールを追加

### 問題: CDK Synth が遅い

**原因**: CDK Nagが verbose モードで実行されている

**解決策**:
```typescript
// verbose: false に変更
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: false }));
```

### 問題: 抑制ルールが効かない

**原因**: 抑制の適用範囲が間違っている

**解決策**:
- スタックレベルの抑制: `NagSuppressions.addStackSuppressions()`
- リソースレベルの抑制: `NagSuppressions.addResourceSuppressions()`
- 正しいリソースを指定

## 参考リンク

- [CDK Nag GitHub](https://github.com/cdklabs/cdk-nag)
- [AWS Solutions Checks Rules](https://github.com/cdklabs/cdk-nag/blob/main/RULES.md)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [AWS CDK Best Practices](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html)

## まとめ

- **CDK Nag**: AWSベストプラクティスとセキュリティルールを自動検証
- **CI/CD統合**: GitHub Actionsで自動的にセキュリティチェック
- **抑制ルール**: 正当な理由がある場合のみ使用
- **継続的改善**: 定期的にルールをレビューし、セキュリティを向上
