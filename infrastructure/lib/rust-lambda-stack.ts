import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { RustFunction } from 'cargo-lambda-cdk';
import * as path from 'path';

/**
 * RustLambdaStack - Rust Lambda Functions for Serverless Blog
 *
 * This stack defines Lambda functions implemented in Rust using cargo-lambda-cdk.
 * These functions run on the provided.al2023 runtime with ARM64 architecture.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
export interface RustLambdaStackProps extends cdk.StackProps {
  blogPostsTable: dynamodb.ITable;
  imagesBucket: s3.IBucket;
  restApi: apigateway.IRestApi;
  authorizer: apigateway.IAuthorizer;
  userPoolId: string;
  userPoolClientId: string;
  cloudFrontDomainName: string;
  /**
   * When true, create API Gateway integrations (Rust handles API traffic)
   * Traffic routing: rustTrafficPercent > 0 = Rust handles API
   */
  createApiIntegrations?: boolean;
}

export class RustLambdaStack extends cdk.Stack {
  // Posts domain functions
  public readonly createPostRustFunction: lambda.IFunction;
  public readonly getPostRustFunction: lambda.IFunction;
  public readonly getPublicPostRustFunction: lambda.IFunction;
  public readonly listPostsRustFunction: lambda.IFunction;
  public readonly updatePostRustFunction: lambda.IFunction;
  public readonly deletePostRustFunction: lambda.IFunction;

  // Auth domain functions
  public readonly loginRustFunction: lambda.IFunction;
  public readonly logoutRustFunction: lambda.IFunction;
  public readonly refreshRustFunction: lambda.IFunction;

  // Images domain functions
  public readonly getUploadUrlRustFunction: lambda.IFunction;
  public readonly deleteImageRustFunction: lambda.IFunction;

  constructor(scope: Construct, id: string, props: RustLambdaStackProps) {
    super(scope, id, props);

    const {
      blogPostsTable,
      imagesBucket,
      restApi,
      authorizer,
      userPoolId,
      userPoolClientId,
      cloudFrontDomainName,
      createApiIntegrations = false,
    } = props;

    // Common environment variables for all Lambda functions
    const commonEnvironment = {
      TABLE_NAME: blogPostsTable.tableName,
      BUCKET_NAME: imagesBucket.bucketName,
      USER_POOL_ID: userPoolId,
      USER_POOL_CLIENT_ID: userPoolClientId,
      CLOUDFRONT_DOMAIN: `https://${cloudFrontDomainName}`,
      RUST_LOG: 'info',
    };

    // Common bundling configuration for ARM64
    const commonBundling = {
      architecture: lambda.Architecture.ARM_64,
      cargoLambdaFlags: ['--release'],
    };

    // Rust functions base path
    const rustFunctionsPath = path.join(__dirname, '../../rust-functions');

    // ===================
    // Posts Domain Functions
    // ===================

    // POST /admin/posts - Create Post (Rust)
    this.createPostRustFunction = new RustFunction(this, 'CreatePostRust', {
      manifestPath: path.join(rustFunctionsPath, 'posts/create_post'),
      bundling: commonBundling,
      functionName: 'blog-create-post-rust',
      description:
        'Create new blog post with Markdown to HTML conversion (Rust)',
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: commonEnvironment,
    });

    // Grant DynamoDB write permissions
    blogPostsTable.grantWriteData(this.createPostRustFunction);

    // GET /admin/posts/{id} - Get Post (Rust)
    this.getPostRustFunction = new RustFunction(this, 'GetPostRust', {
      manifestPath: path.join(rustFunctionsPath, 'posts/get_post'),
      bundling: commonBundling,
      functionName: 'blog-get-post-rust',
      description: 'Get blog post by ID (admin, includes markdown) (Rust)',
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: commonEnvironment,
    });

    // Grant DynamoDB read permissions
    blogPostsTable.grantReadData(this.getPostRustFunction);

    // GET /posts/{id} - Get Public Post (Rust)
    this.getPublicPostRustFunction = new RustFunction(
      this,
      'GetPublicPostRust',
      {
        manifestPath: path.join(rustFunctionsPath, 'posts/get_public_post'),
        bundling: commonBundling,
        functionName: 'blog-get-public-post-rust',
        description: 'Get published blog post by ID (public, HTML only) (Rust)',
        memorySize: 128,
        timeout: cdk.Duration.seconds(30),
        tracing: lambda.Tracing.ACTIVE,
        environment: commonEnvironment,
      }
    );

    // Grant DynamoDB read permissions
    blogPostsTable.grantReadData(this.getPublicPostRustFunction);

    // GET /posts - List Posts (Rust)
    this.listPostsRustFunction = new RustFunction(this, 'ListPostsRust', {
      manifestPath: path.join(rustFunctionsPath, 'posts/list_posts'),
      bundling: commonBundling,
      functionName: 'blog-list-posts-rust',
      description: 'List published blog posts (Rust)',
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: commonEnvironment,
    });

    // Grant DynamoDB read permissions
    blogPostsTable.grantReadData(this.listPostsRustFunction);

    // PUT /admin/posts/{id} - Update Post (Rust)
    this.updatePostRustFunction = new RustFunction(this, 'UpdatePostRust', {
      manifestPath: path.join(rustFunctionsPath, 'posts/update_post'),
      bundling: commonBundling,
      functionName: 'blog-update-post-rust',
      description: 'Update existing blog post (Rust)',
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: commonEnvironment,
    });

    // Grant DynamoDB read/write permissions
    blogPostsTable.grantReadWriteData(this.updatePostRustFunction);

    // DELETE /admin/posts/{id} - Delete Post (Rust)
    this.deletePostRustFunction = new RustFunction(this, 'DeletePostRust', {
      manifestPath: path.join(rustFunctionsPath, 'posts/delete_post'),
      bundling: commonBundling,
      functionName: 'blog-delete-post-rust',
      description: 'Delete blog post (Rust)',
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: commonEnvironment,
    });

    // Grant DynamoDB read/write and S3 delete permissions
    blogPostsTable.grantReadWriteData(this.deletePostRustFunction);
    imagesBucket.grantDelete(this.deletePostRustFunction);

    // ===================
    // Auth Domain Functions
    // ===================

    // POST /auth/login - Login (Rust)
    this.loginRustFunction = new RustFunction(this, 'LoginRust', {
      manifestPath: path.join(rustFunctionsPath, 'auth/login'),
      bundling: commonBundling,
      functionName: 'blog-login-rust',
      description: 'User authentication (Rust)',
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: commonEnvironment,
    });

    // POST /auth/logout - Logout (Rust)
    this.logoutRustFunction = new RustFunction(this, 'LogoutRust', {
      manifestPath: path.join(rustFunctionsPath, 'auth/logout'),
      bundling: commonBundling,
      functionName: 'blog-logout-rust',
      description: 'User logout (Rust)',
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: commonEnvironment,
    });

    // POST /auth/refresh - Refresh Token (Rust)
    this.refreshRustFunction = new RustFunction(this, 'RefreshRust', {
      manifestPath: path.join(rustFunctionsPath, 'auth/refresh'),
      bundling: commonBundling,
      functionName: 'blog-refresh-rust',
      description: 'Token refresh (Rust)',
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: commonEnvironment,
    });

    // ===================
    // Images Domain Functions
    // ===================

    // POST /admin/images/upload-url - Get Upload URL (Rust)
    this.getUploadUrlRustFunction = new RustFunction(this, 'GetUploadUrlRust', {
      manifestPath: path.join(rustFunctionsPath, 'images/get_upload_url'),
      bundling: commonBundling,
      functionName: 'blog-upload-url-rust',
      description: 'Generate pre-signed URL for image upload (Rust)',
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: commonEnvironment,
    });

    // Grant S3 put permissions
    imagesBucket.grantPut(this.getUploadUrlRustFunction);

    // DELETE /admin/images/{key+} - Delete Image (Rust)
    this.deleteImageRustFunction = new RustFunction(this, 'DeleteImageRust', {
      manifestPath: path.join(rustFunctionsPath, 'images/delete_image'),
      bundling: commonBundling,
      functionName: 'blog-delete-image-rust',
      description: 'Delete image from S3 (Rust)',
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: commonEnvironment,
    });

    // Grant S3 delete permissions
    imagesBucket.grantDelete(this.deleteImageRustFunction);

    // ===================
    // API Gateway Integrations (when Rust handles traffic)
    // ===================
    /* istanbul ignore if -- @preserve Integration tested via E2E, unit test causes cyclic deps */
    if (createApiIntegrations) {
      // /admin/posts リソース取得
      const adminResource = restApi.root.getResource('admin');
      /* istanbul ignore if -- @preserve Defense-in-depth error handling */
      if (!adminResource) {
        throw new Error('Admin resource not found');
      }
      const adminPostsResource = adminResource.addResource('posts');

      // POST /admin/posts - 記事作成 (Rust)
      adminPostsResource.addMethod(
        'POST',
        new apigateway.LambdaIntegration(this.createPostRustFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // GET /admin/posts - 記事一覧取得（管理用、認証必須）(Rust)
      adminPostsResource.addMethod(
        'GET',
        new apigateway.LambdaIntegration(this.listPostsRustFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // /admin/posts/{id}
      const adminPostByIdResource = adminPostsResource.addResource('{id}');

      // GET /admin/posts/{id} - 記事取得 (Rust)
      adminPostByIdResource.addMethod(
        'GET',
        new apigateway.LambdaIntegration(this.getPostRustFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // PUT /admin/posts/{id} - 記事更新 (Rust)
      adminPostByIdResource.addMethod(
        'PUT',
        new apigateway.LambdaIntegration(this.updatePostRustFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // DELETE /admin/posts/{id} - 記事削除 (Rust)
      adminPostByIdResource.addMethod(
        'DELETE',
        new apigateway.LambdaIntegration(this.deletePostRustFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // /admin/images
      const adminImagesResource = adminResource.addResource('images');

      // POST /admin/images/upload-url - 画像アップロードURL生成 (Rust)
      const uploadUrlResource = adminImagesResource.addResource('upload-url');
      uploadUrlResource.addMethod(
        'POST',
        new apigateway.LambdaIntegration(this.getUploadUrlRustFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // DELETE /admin/images/{key+} - 画像削除 (Rust)
      const deleteImageResource = adminImagesResource.addResource('{key+}');
      deleteImageResource.addMethod(
        'DELETE',
        new apigateway.LambdaIntegration(this.deleteImageRustFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // 公開API: /posts リソース取得
      const postsResource = restApi.root.getResource('posts');
      /* istanbul ignore if -- @preserve Defense-in-depth error handling */
      if (!postsResource) {
        throw new Error('Posts resource not found');
      }

      // GET /posts - 記事一覧取得（認証不要）(Rust)
      postsResource.addMethod(
        'GET',
        new apigateway.LambdaIntegration(this.listPostsRustFunction),
        {
          authorizationType: apigateway.AuthorizationType.NONE,
        }
      );

      // GET /posts/{id} - 記事詳細取得（認証不要）(Rust)
      const publicPostByIdResource = postsResource.addResource('{id}');
      publicPostByIdResource.addMethod(
        'GET',
        new apigateway.LambdaIntegration(this.getPublicPostRustFunction),
        {
          authorizationType: apigateway.AuthorizationType.NONE,
        }
      );

      // CDK Nag Suppressions - Public API endpoints
      NagSuppressions.addResourceSuppressions(
        postsResource,
        [
          {
            id: 'AwsSolutions-APIG4',
            reason:
              'Public API endpoints (GET /posts and GET /posts/{id}) are intentionally designed without authentication to allow public access to published blog posts.',
          },
          {
            id: 'AwsSolutions-COG4',
            reason:
              'Public API endpoints (GET /posts and GET /posts/{id}) do not require Cognito authorization as they serve public content.',
          },
        ],
        true
      );
    }

    // ===================
    // CDK Nag Suppressions
    // ===================

    const allRustFunctions = [
      this.createPostRustFunction,
      this.getPostRustFunction,
      this.getPublicPostRustFunction,
      this.listPostsRustFunction,
      this.updatePostRustFunction,
      this.deletePostRustFunction,
      this.loginRustFunction,
      this.logoutRustFunction,
      this.refreshRustFunction,
      this.getUploadUrlRustFunction,
      this.deleteImageRustFunction,
    ];

    allRustFunctions.forEach((fn) => {
      NagSuppressions.addResourceSuppressions(
        fn,
        [
          {
            id: 'AwsSolutions-IAM4',
            reason:
              'Lambda functions use AWSLambdaBasicExecutionRole which is the AWS recommended managed policy for Lambda execution. It provides minimal permissions for CloudWatch Logs.',
            appliesTo: [
              'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
            ],
          },
          {
            id: 'AwsSolutions-IAM5',
            reason:
              'Lambda functions require wildcard permissions for CloudWatch Logs (*) to create log streams and write logs. DynamoDB index access (*/index/*) is necessary for querying GSI. S3 delete and abort permissions are scoped to the images bucket. These are minimal required permissions for the functions to operate.',
            appliesTo: [
              'Resource::*',
              // Match DynamoDB table index access patterns
              { regex: '/^Resource::<.+\\.Arn>\\/index\\/\\*$/' },
              // Match S3 actions with wildcards
              'Action::s3:Abort*',
              'Action::s3:DeleteObject*',
              // Match S3 bucket resource patterns (including cross-stack references)
              { regex: '/^Resource::<.+\\.Arn>\\/\\*$/' },
              { regex: '/^Resource::.+Arn.+\\/\\*$/' },
            ],
          },
        ],
        true
      );
    });

    // ===================
    // Outputs
    // ===================

    // Posts domain outputs
    new cdk.CfnOutput(this, 'CreatePostRustFunctionArn', {
      value: this.createPostRustFunction.functionArn,
      description: 'Create Post Rust Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'GetPostRustFunctionArn', {
      value: this.getPostRustFunction.functionArn,
      description: 'Get Post Rust Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'GetPublicPostRustFunctionArn', {
      value: this.getPublicPostRustFunction.functionArn,
      description: 'Get Public Post Rust Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'ListPostsRustFunctionArn', {
      value: this.listPostsRustFunction.functionArn,
      description: 'List Posts Rust Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'UpdatePostRustFunctionArn', {
      value: this.updatePostRustFunction.functionArn,
      description: 'Update Post Rust Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'DeletePostRustFunctionArn', {
      value: this.deletePostRustFunction.functionArn,
      description: 'Delete Post Rust Lambda Function ARN',
    });

    // Auth domain outputs
    new cdk.CfnOutput(this, 'LoginRustFunctionArn', {
      value: this.loginRustFunction.functionArn,
      description: 'Login Rust Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'LogoutRustFunctionArn', {
      value: this.logoutRustFunction.functionArn,
      description: 'Logout Rust Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'RefreshRustFunctionArn', {
      value: this.refreshRustFunction.functionArn,
      description: 'Refresh Rust Lambda Function ARN',
    });

    // Images domain outputs
    new cdk.CfnOutput(this, 'GetUploadUrlRustFunctionArn', {
      value: this.getUploadUrlRustFunction.functionArn,
      description: 'Get Upload URL Rust Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'DeleteImageRustFunctionArn', {
      value: this.deleteImageRustFunction.functionArn,
      description: 'Delete Image Rust Lambda Function ARN',
    });
  }
}
