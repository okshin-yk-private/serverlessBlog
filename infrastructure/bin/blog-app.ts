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

// 環境判定: 本番環境かどうか
const environment = app.node.tryGetContext('environment') || 'dev';
const isProduction = environment === 'prod';

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
  imageBucket: storageStack.imageBucket,
  publicSiteBucket: storageStack.publicSiteBucket,
  adminSiteBucket: storageStack.adminSiteBucket,
});

// Lambda Functions Stack
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
  }
);

// Monitoring Stack (CloudWatch)
const monitoringStack = new MonitoringStack(
  app,
  'ServerlessBlogMonitoringStack',
  {
    env,
    lambdaFunctions: [
      lambdaFunctionsStack.createPostFunction,
      lambdaFunctionsStack.getPostFunction,
      lambdaFunctionsStack.updatePostFunction,
      lambdaFunctionsStack.deletePostFunction,
      lambdaFunctionsStack.listPostsFunction,
      lambdaFunctionsStack.getPublicPostFunction,
      lambdaFunctionsStack.uploadUrlFunction,
    ],
    dynamodbTables: [databaseStack.blogPostsTable],
    apiGateways: [apiStack.restApi],
    alarmEmail: process.env.ALARM_EMAIL || 'admin@example.com',
  }
);
