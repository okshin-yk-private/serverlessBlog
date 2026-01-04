import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { RustFunction } from 'cargo-lambda-cdk';
import * as path from 'path';
import * as fs from 'fs';

// Pre-built Lambda binaries path
const lambdaTargetPath = path.join(
  __dirname,
  '../../rust-functions/target/lambda'
);

/**
 * Check if pre-built binaries should be used:
 * - CI environment (GitHub Actions sets CI=true)
 * - AND target/lambda directory exists (built by cargo lambda build --workspace)
 *
 * This allows tests to run before Rust build in CI pipeline.
 */
const usePrebuiltBinaries =
  process.env.CI === 'true' && fs.existsSync(lambdaTargetPath);

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

    // Common bundling configuration for ARM64 (used in local development)
    const commonBundling = {
      architecture: lambda.Architecture.ARM_64,
      cargoLambdaFlags: ['--release'],
    };

    // Rust functions base path
    const rustFunctionsPath = path.join(__dirname, '../../rust-functions');

    /**
     * Helper function to create Rust Lambda functions
     * - CI (after build): Uses pre-built binaries from cargo lambda build --workspace
     * - Local/CI (before build): Uses cargo-lambda-cdk RustFunction for on-demand building
     */
    const createRustLambda = (
      id: string,
      binaryName: string,
      manifestSubPath: string,
      options: {
        functionName: string;
        description: string;
        memorySize?: number;
        timeout?: cdk.Duration;
      }
    ): lambda.IFunction => {
      if (usePrebuiltBinaries) {
        // CI: Use pre-built binaries for faster deployment
        return new lambda.Function(this, id, {
          runtime: lambda.Runtime.PROVIDED_AL2023,
          architecture: lambda.Architecture.ARM_64,
          handler: 'bootstrap',
          code: lambda.Code.fromAsset(path.join(lambdaTargetPath, binaryName)),
          functionName: options.functionName,
          description: options.description,
          memorySize: options.memorySize ?? 128,
          timeout: options.timeout ?? cdk.Duration.seconds(30),
          tracing: lambda.Tracing.ACTIVE,
          environment: commonEnvironment,
        });
      } else {
        // Local: Use cargo-lambda-cdk for on-demand building
        return new RustFunction(this, id, {
          manifestPath: path.join(rustFunctionsPath, manifestSubPath),
          bundling: commonBundling,
          functionName: options.functionName,
          description: options.description,
          memorySize: options.memorySize ?? 128,
          timeout: options.timeout ?? cdk.Duration.seconds(30),
          tracing: lambda.Tracing.ACTIVE,
          environment: commonEnvironment,
        });
      }
    };

    // ===================
    // Posts Domain Functions
    // ===================

    // POST /admin/posts - Create Post (Rust)
    this.createPostRustFunction = createRustLambda(
      'CreatePostRust',
      'create_post',
      'posts/create_post',
      {
        functionName: 'blog-create-post-rust',
        description:
          'Create new blog post with Markdown to HTML conversion (Rust)',
      }
    );
    blogPostsTable.grantWriteData(this.createPostRustFunction);

    // GET /admin/posts/{id} - Get Post (Rust)
    this.getPostRustFunction = createRustLambda(
      'GetPostRust',
      'get_post',
      'posts/get_post',
      {
        functionName: 'blog-get-post-rust',
        description: 'Get blog post by ID (admin, includes markdown) (Rust)',
      }
    );
    blogPostsTable.grantReadData(this.getPostRustFunction);

    // GET /posts/{id} - Get Public Post (Rust)
    this.getPublicPostRustFunction = createRustLambda(
      'GetPublicPostRust',
      'get_public_post',
      'posts/get_public_post',
      {
        functionName: 'blog-get-public-post-rust',
        description: 'Get published blog post by ID (public, HTML only) (Rust)',
      }
    );
    blogPostsTable.grantReadData(this.getPublicPostRustFunction);

    // GET /posts - List Posts (Rust)
    this.listPostsRustFunction = createRustLambda(
      'ListPostsRust',
      'list_posts',
      'posts/list_posts',
      {
        functionName: 'blog-list-posts-rust',
        description: 'List published blog posts (Rust)',
      }
    );
    blogPostsTable.grantReadData(this.listPostsRustFunction);

    // PUT /admin/posts/{id} - Update Post (Rust)
    this.updatePostRustFunction = createRustLambda(
      'UpdatePostRust',
      'update_post',
      'posts/update_post',
      {
        functionName: 'blog-update-post-rust',
        description: 'Update existing blog post (Rust)',
      }
    );
    blogPostsTable.grantReadWriteData(this.updatePostRustFunction);

    // DELETE /admin/posts/{id} - Delete Post (Rust)
    this.deletePostRustFunction = createRustLambda(
      'DeletePostRust',
      'delete_post',
      'posts/delete_post',
      {
        functionName: 'blog-delete-post-rust',
        description: 'Delete blog post (Rust)',
      }
    );
    blogPostsTable.grantReadWriteData(this.deletePostRustFunction);
    imagesBucket.grantDelete(this.deletePostRustFunction);

    // ===================
    // Auth Domain Functions
    // ===================

    // POST /auth/login - Login (Rust)
    this.loginRustFunction = createRustLambda(
      'LoginRust',
      'login',
      'auth/login',
      {
        functionName: 'blog-login-rust',
        description: 'User authentication (Rust)',
      }
    );

    // POST /auth/logout - Logout (Rust)
    this.logoutRustFunction = createRustLambda(
      'LogoutRust',
      'logout',
      'auth/logout',
      {
        functionName: 'blog-logout-rust',
        description: 'User logout (Rust)',
      }
    );

    // POST /auth/refresh - Refresh Token (Rust)
    this.refreshRustFunction = createRustLambda(
      'RefreshRust',
      'refresh',
      'auth/refresh',
      {
        functionName: 'blog-refresh-rust',
        description: 'Token refresh (Rust)',
      }
    );

    // ===================
    // Images Domain Functions
    // ===================

    // POST /admin/images/upload-url - Get Upload URL (Rust)
    this.getUploadUrlRustFunction = createRustLambda(
      'GetUploadUrlRust',
      'get_upload_url',
      'images/get_upload_url',
      {
        functionName: 'blog-upload-url-rust',
        description: 'Generate pre-signed URL for image upload (Rust)',
      }
    );
    imagesBucket.grantPut(this.getUploadUrlRustFunction);

    // DELETE /admin/images/{key+} - Delete Image (Rust)
    this.deleteImageRustFunction = createRustLambda(
      'DeleteImageRust',
      'delete_image',
      'images/delete_image',
      {
        functionName: 'blog-delete-image-rust',
        description: 'Delete image from S3 (Rust)',
      }
    );
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
