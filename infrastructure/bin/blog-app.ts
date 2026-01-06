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
// goTrafficPercent: 0 = 無効, 100 = Go使用
// rustTrafficPercent: 0 = 無効, 100 = Rust使用
// 優先順位: Go > Rust > Node.js
const goTrafficPercent = Number(
  app.node.tryGetContext('goTrafficPercent') ?? 0
);
const rustTrafficPercent = Number(
  app.node.tryGetContext('rustTrafficPercent') ?? 0
);
const useGoLambda = goTrafficPercent > 0;
const useRustLambda = rustTrafficPercent > 0 && !useGoLambda;

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
// API integrations are handled by ApiIntegrationsStack
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
    createApiIntegrations: false, // API integrations handled by ApiIntegrationsStack
  }
);

// Rust Lambda Functions Stack (deployed when rustTrafficPercent > 0 and goTrafficPercent = 0)
// API integrations are handled by ApiIntegrationsStack
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
    createApiIntegrations: false, // API integrations handled by ApiIntegrationsStack
  });
}

// Go Lambda Functions Stack (deployed when goTrafficPercent > 0)
// API integrations are handled by ApiIntegrationsStack
let goLambdaStack: GoLambdaStack | undefined;
if (useGoLambda) {
  goLambdaStack = new GoLambdaStack(app, 'ServerlessBlogGoLambdaStack', {
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
}

// API Integrations Stack
// This stack handles all API Gateway method integrations
// Priority: Go > Rust > Node.js
const getImplementationLabel = (): string => {
  if (useGoLambda) return 'Go';
  if (useRustLambda) return 'Rust';
  return 'Node.js';
};

const getLambdaFunctions = () => {
  if (useGoLambda && goLambdaStack) {
    // Use Go Lambda functions
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
  }
  if (useRustLambda && rustLambdaStack) {
    // Use Rust Lambda functions
    return {
      createPostFunction: rustLambdaStack.createPostRustFunction,
      getPostFunction: rustLambdaStack.getPostRustFunction,
      getPublicPostFunction: rustLambdaStack.getPublicPostRustFunction,
      listPostsFunction: rustLambdaStack.listPostsRustFunction,
      updatePostFunction: rustLambdaStack.updatePostRustFunction,
      deletePostFunction: rustLambdaStack.deletePostRustFunction,
      uploadUrlFunction: rustLambdaStack.getUploadUrlRustFunction,
      deleteImageFunction: rustLambdaStack.deleteImageRustFunction,
      loginFunction: rustLambdaStack.loginRustFunction,
      logoutFunction: rustLambdaStack.logoutRustFunction,
      refreshFunction: rustLambdaStack.refreshRustFunction,
    };
  }
  // Use Node.js Lambda functions
  return {
    createPostFunction: lambdaFunctionsStack.createPostFunction,
    getPostFunction: lambdaFunctionsStack.getPostFunction,
    getPublicPostFunction: lambdaFunctionsStack.getPublicPostFunction,
    listPostsFunction: lambdaFunctionsStack.listPostsFunction,
    updatePostFunction: lambdaFunctionsStack.updatePostFunction,
    deletePostFunction: lambdaFunctionsStack.deletePostFunction,
    uploadUrlFunction: lambdaFunctionsStack.uploadUrlFunction,
    deleteImageFunction: lambdaFunctionsStack.deleteImageFunction,
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
  }
);

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

// Add Go Lambda functions when enabled
if (goLambdaStack) {
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
