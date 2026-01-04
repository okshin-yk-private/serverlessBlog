#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';
import { LayersStack } from '../lib/layers-stack';
import { DatabaseStack } from '../lib/database-stack';
import { StorageStack } from '../lib/storage-stack';
import { AuthStack } from '../lib/auth-stack';
import { ApiStack } from '../lib/api-stack';
import { CdnStack } from '../lib/cdn-stack';
import { LambdaFunctionsStack } from '../lib/lambda-functions-stack';
import { RustLambdaStack } from '../lib/rust-lambda-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

/**
 * Serverless Blog Platform - CDK App Entry Point
 *
 * Requirement R32: CDK Nag によるセキュリティ検証
 *
 * このファイルはCDKアプリのエントリーポイントです。
 * CDK Nagを使用して、AWSベストプラクティスとセキュリティルールを検証します。
 */

const app = new cdk.App();

// stage context取得: dev or prd (ワークフローから --context stage=dev として渡される)
const stage = app.node.tryGetContext('stage') || 'dev';
const isProduction = stage === 'prd';

// Rust移行トラフィックルーティング設定
// rustTrafficPercent: 0 = Node.js only, 100 = Rust only
// 中間値（10, 50, 90）は Rust 関数を使用（段階的移行）
const rustTrafficPercent = Number(
  app.node.tryGetContext('rustTrafficPercent') ?? 0
);
const useRustLambda = rustTrafficPercent > 0;

// 環境設定
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

// CDK Nag: AWS Solutions Checksを適用
// セキュリティ、信頼性、パフォーマンス、コスト最適化のベストプラクティスをチェック
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Lambda Layers Stack
const layersStack = new LayersStack(app, 'ServerlessBlogLayersStack', { env });

// Database Stack
const databaseStack = new DatabaseStack(app, 'ServerlessBlogDatabaseStack', {
  env,
});

// Storage Stack (S3アクセスログは本番環境のみ有効)
const storageStack = new StorageStack(app, 'ServerlessBlogStorageStack', {
  env,
  stage,
  enableAccessLogs: isProduction,
});

// Auth Stack (Cognito)
const authStack = new AuthStack(app, 'ServerlessBlogAuthStack', { env });

// API Gateway Stack
const apiStack = new ApiStack(app, 'ServerlessBlogApiStack', {
  env,
  userPool: authStack.userPool,
});

// CDN Stack (CloudFront)
const cdnStack = new CdnStack(app, 'ServerlessBlogCdnStack', {
  env,
  imageBucketName: storageStack.imageBucket.bucketName,
  publicSiteBucketName: storageStack.publicSiteBucket.bucketName,
  adminSiteBucketName: storageStack.adminSiteBucket.bucketName,
});

// Lambda Functions Stack (Node.js)
// When Rust is enabled (rustTrafficPercent > 0), skip API Gateway integrations
const lambdaFunctionsStack = new LambdaFunctionsStack(
  app,
  'ServerlessBlogLambdaFunctionsStack',
  {
    env,
    powertoolsLayer: layersStack.powertoolsLayer,
    commonLayer: layersStack.commonLayer,
    blogPostsTable: databaseStack.blogPostsTable,
    imagesBucket: storageStack.imageBucket,
    restApi: apiStack.restApi,
    authorizer: apiStack.authorizer,
    cloudFrontDomainName: cdnStack.distribution.distributionDomainName,
    createApiIntegrations: !useRustLambda, // Node.js handles API when Rust is disabled
  }
);

// Rust Lambda Functions Stack (optional, based on rustTrafficPercent)
// Only instantiate when Rust migration is enabled
let rustLambdaStack: RustLambdaStack | undefined;
if (useRustLambda) {
  rustLambdaStack = new RustLambdaStack(app, 'ServerlessBlogRustLambdaStack', {
    env,
    blogPostsTable: databaseStack.blogPostsTable,
    imagesBucket: storageStack.imageBucket,
    restApi: apiStack.restApi,
    authorizer: apiStack.authorizer,
    userPoolId: authStack.userPool.userPoolId,
    userPoolClientId: authStack.userPoolClient.userPoolClientId,
    cloudFrontDomainName: cdnStack.distribution.distributionDomainName,
    createApiIntegrations: true, // Rust handles API when enabled
  });
}

// Collect Lambda functions for monitoring
// Include both Node.js functions (always) and Rust functions (when enabled)
const monitoredLambdaFunctions: cdk.aws_lambda.IFunction[] = [
  // Node.js Lambda functions
  lambdaFunctionsStack.createPostFunction,
  lambdaFunctionsStack.getPostFunction,
  lambdaFunctionsStack.updatePostFunction,
  lambdaFunctionsStack.deletePostFunction,
  lambdaFunctionsStack.listPostsFunction,
  lambdaFunctionsStack.getPublicPostFunction,
  lambdaFunctionsStack.uploadUrlFunction,
];

// Add Rust Lambda functions when enabled
if (rustLambdaStack) {
  monitoredLambdaFunctions.push(
    rustLambdaStack.createPostRustFunction,
    rustLambdaStack.getPostRustFunction,
    rustLambdaStack.updatePostRustFunction,
    rustLambdaStack.deletePostRustFunction,
    rustLambdaStack.listPostsRustFunction,
    rustLambdaStack.getPublicPostRustFunction,
    rustLambdaStack.getUploadUrlRustFunction
  );
}

// Monitoring Stack (CloudWatch)
const monitoringStack = new MonitoringStack(
  app,
  'ServerlessBlogMonitoringStack',
  {
    env,
    lambdaFunctions: monitoredLambdaFunctions,
    dynamodbTables: [databaseStack.blogPostsTable],
    apiGateways: [apiStack.restApi],
    alarmEmail: process.env.ALARM_EMAIL || 'admin@example.com',
  }
);
