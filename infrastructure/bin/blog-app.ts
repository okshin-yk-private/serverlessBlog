#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';
import { DatabaseStack } from '../lib/database-stack';
import { StorageStack } from '../lib/storage-stack';
import { AuthStack } from '../lib/auth-stack';
import { ApiStack } from '../lib/api-stack';
import { CdnStack } from '../lib/cdn-stack';
// LambdaFunctionsStack import removed - Node.js implementation has been deleted
// import { LambdaFunctionsStack } from '../lib/lambda-functions-stack';
// RustLambdaStack import removed - Rust implementation has been deleted (Task 21.2)
// import { RustLambdaStack } from '../lib/rust-lambda-stack';
import { GoLambdaStack } from '../lib/go-lambda-stack';
import { ApiIntegrationsStack } from '../lib/api-integrations-stack';
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

// Lambda実装選択設定
// Go実装のみがサポートされています（Node.jsとRust実装は削除済み）
// goTrafficPercent: 常に100（Go実装を使用）
// Note: Node.js実装（Task 21.1）とRust実装（Task 21.2）は削除されました。
const goTrafficPercent = 100; // Go実装のみサポート
const useGoLambda = true; // 常にGo実装を使用

// 環境設定
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

// CDK Nag: AWS Solutions Checksを適用
// セキュリティ、信頼性、パフォーマンス、コスト最適化のベストプラクティスをチェック
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

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
  stage,
});

// CDN Stack (CloudFront)
// Note: CdnStack imports REST API ID via Fn.importValue to avoid cyclic dependency
const cdnStack = new CdnStack(app, 'ServerlessBlogCdnStack', {
  env,
  imageBucketName: storageStack.imageBucket.bucketName,
  publicSiteBucketName: storageStack.publicSiteBucket.bucketName,
  adminSiteBucketName: storageStack.adminSiteBucket.bucketName,
});

// Lambda Functions Stack (Node.js) - REMOVED (Task 21.1)
// Node.js implementation (functions/ directory) has been deleted.

// Rust Lambda Functions Stack - REMOVED (Task 21.2)
// Rust implementation (rust-functions/ directory) has been deleted.

// Go Lambda Functions Stack (唯一のサポートされている実装)
// API integrations are handled by ApiIntegrationsStack
const goLambdaStack = new GoLambdaStack(app, 'ServerlessBlogGoLambdaStack', {
  env,
  blogPostsTable: databaseStack.blogPostsTable,
  imagesBucket: storageStack.imageBucket,
  restApi: apiStack.restApi,
  authorizer: apiStack.authorizer,
  userPoolId: authStack.userPool.userPoolId,
  userPoolClientId: authStack.userPoolClient.userPoolClientId,
  cloudFrontDomainName: cdnStack.distribution.distributionDomainName,
  createApiIntegrations: false, // API integrations handled by ApiIntegrationsStack
});

// API Integrations Stack
// This stack handles all API Gateway method integrations
// Go実装のみサポート（Node.jsとRust実装は削除済み）
const getImplementationLabel = (): string => 'Go';

const getLambdaFunctions = () => {
  // Use Go Lambda functions (唯一のサポートされている実装)
  return {
    createPostFunction: goLambdaStack.createPostGoFunction!,
    getPostFunction: goLambdaStack.getPostGoFunction!,
    getPublicPostFunction: goLambdaStack.getPublicPostGoFunction!,
    listPostsFunction: goLambdaStack.listPostsGoFunction!,
    updatePostFunction: goLambdaStack.updatePostGoFunction!,
    deletePostFunction: goLambdaStack.deletePostGoFunction!,
    uploadUrlFunction: goLambdaStack.getUploadUrlGoFunction!,
    deleteImageFunction: goLambdaStack.deleteImageGoFunction!,
    loginFunction: goLambdaStack.loginGoFunction!,
    logoutFunction: goLambdaStack.logoutGoFunction!,
    refreshFunction: goLambdaStack.refreshGoFunction!,
  };
};

const apiIntegrationsStack = new ApiIntegrationsStack(
  app,
  'ServerlessBlogApiIntegrationsStack',
  {
    env,
    restApi: apiStack.restApi,
    authorizer: apiStack.authorizer,
    lambdaFunctions: getLambdaFunctions(),
    implementationLabel: getImplementationLabel(),
    stage,
  }
);

// Collect Lambda functions for monitoring
// Go Lambda関数のみ監視対象（Node.jsとRust実装は削除済み）
const monitoredLambdaFunctions: cdk.aws_lambda.IFunction[] = [];

// Add Go Lambda functions for monitoring
if (goLambdaStack.createPostGoFunction)
  monitoredLambdaFunctions.push(goLambdaStack.createPostGoFunction);
if (goLambdaStack.getPostGoFunction)
  monitoredLambdaFunctions.push(goLambdaStack.getPostGoFunction);
if (goLambdaStack.updatePostGoFunction)
  monitoredLambdaFunctions.push(goLambdaStack.updatePostGoFunction);
if (goLambdaStack.deletePostGoFunction)
  monitoredLambdaFunctions.push(goLambdaStack.deletePostGoFunction);
if (goLambdaStack.listPostsGoFunction)
  monitoredLambdaFunctions.push(goLambdaStack.listPostsGoFunction);
if (goLambdaStack.getPublicPostGoFunction)
  monitoredLambdaFunctions.push(goLambdaStack.getPublicPostGoFunction);
if (goLambdaStack.getUploadUrlGoFunction)
  monitoredLambdaFunctions.push(goLambdaStack.getUploadUrlGoFunction);
if (goLambdaStack.loginGoFunction)
  monitoredLambdaFunctions.push(goLambdaStack.loginGoFunction);
if (goLambdaStack.logoutGoFunction)
  monitoredLambdaFunctions.push(goLambdaStack.logoutGoFunction);
if (goLambdaStack.refreshGoFunction)
  monitoredLambdaFunctions.push(goLambdaStack.refreshGoFunction);
if (goLambdaStack.deleteImageGoFunction)
  monitoredLambdaFunctions.push(goLambdaStack.deleteImageGoFunction);

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
