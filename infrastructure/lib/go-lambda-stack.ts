import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import * as path from 'path';
import {
  FeatureFlagsConfig,
  isGoEnabled,
  LambdaFunctionName,
} from './feature-flags';

// Pre-built Lambda binaries path
const goLambdaBinPath = path.join(__dirname, '../../go-functions/bin');

/**
 * GoLambdaStack - Go Lambda Functions for Serverless Blog
 *
 * This stack defines Lambda functions implemented in Go using pre-built binaries.
 * These functions run on the provided.al2023 runtime with ARM64 architecture.
 *
 * Go functions are built with:
 * CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -tags=lambda.norpc
 *
 * Requirements: 9.1, 9.2, 9.4, 9.5
 */
export interface GoLambdaStackProps extends cdk.StackProps {
  blogPostsTable: dynamodb.ITable;
  imagesBucket: s3.IBucket;
  restApi: apigateway.IRestApi;
  authorizer: apigateway.IAuthorizer;
  userPoolId: string;
  userPoolClientId: string;
  cloudFrontDomainName: string;
  /**
   * When true, create API Gateway integrations (Go handles API traffic)
   * Traffic routing: goTrafficPercent > 0 = Go handles API
   */
  createApiIntegrations?: boolean;
  /**
   * Feature flags for gradual migration between Node.js/Rust and Go.
   * When provided, only functions with Go enabled in the config will be created.
   * This allows selective deployment of Go functions for staged rollout.
   *
   * Requirements: 9.3 - CDK configuration allows feature flags for switching
   * between Node.js/Rust and Go implementations per function.
   */
  featureFlags?: FeatureFlagsConfig;
}

export class GoLambdaStack extends cdk.Stack {
  // Posts domain functions (optional when feature flags are used)
  public readonly createPostGoFunction?: lambda.Function;
  public readonly getPostGoFunction?: lambda.Function;
  public readonly getPublicPostGoFunction?: lambda.Function;
  public readonly listPostsGoFunction?: lambda.Function;
  public readonly updatePostGoFunction?: lambda.Function;
  public readonly deletePostGoFunction?: lambda.Function;

  // Auth domain functions (optional when feature flags are used)
  public readonly loginGoFunction?: lambda.Function;
  public readonly logoutGoFunction?: lambda.Function;
  public readonly refreshGoFunction?: lambda.Function;

  // Images domain functions (optional when feature flags are used)
  public readonly getUploadUrlGoFunction?: lambda.Function;
  public readonly deleteImageGoFunction?: lambda.Function;

  constructor(scope: Construct, id: string, props: GoLambdaStackProps) {
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
      featureFlags,
    } = props;

    // Helper function to check if a Go function should be created
    // When no featureFlags are provided, all functions are created (backward compatibility)
    const shouldCreateFunction = (
      functionName: LambdaFunctionName
    ): boolean => {
      if (!featureFlags) {
        return true; // No feature flags = create all functions
      }
      return isGoEnabled(functionName, featureFlags);
    };

    // Common environment variables for all Lambda functions
    // Note: AWS_REGION is automatically set by the Lambda runtime
    const commonEnvironment = {
      TABLE_NAME: blogPostsTable.tableName,
      BUCKET_NAME: imagesBucket.bucketName,
      USER_POOL_ID: userPoolId,
      USER_POOL_CLIENT_ID: userPoolClientId,
      CLOUDFRONT_DOMAIN: `https://${cloudFrontDomainName}`,
    };

    /**
     * Helper function to create Go Lambda functions
     * Uses pre-built binaries from go-functions/bin/{binaryName}/bootstrap
     */
    const createGoLambda = (
      constructId: string,
      binaryName: string,
      options: {
        functionName: string;
        description: string;
        memorySize?: number;
        timeout?: cdk.Duration;
      }
    ): lambda.Function => {
      return new lambda.Function(this, constructId, {
        runtime: lambda.Runtime.PROVIDED_AL2023,
        architecture: lambda.Architecture.ARM_64,
        handler: 'bootstrap',
        code: lambda.Code.fromAsset(path.join(goLambdaBinPath, binaryName)),
        functionName: options.functionName,
        description: options.description,
        memorySize: options.memorySize ?? 128,
        timeout: options.timeout ?? cdk.Duration.seconds(30),
        tracing: lambda.Tracing.ACTIVE,
        environment: commonEnvironment,
      });
    };

    // ===================
    // Posts Domain Functions
    // ===================

    // POST /admin/posts - Create Post (Go)
    if (shouldCreateFunction('createPost')) {
      this.createPostGoFunction = createGoLambda(
        'CreatePostGo',
        'posts-create',
        {
          functionName: 'blog-create-post-go',
          description:
            'Create new blog post with Markdown to HTML conversion (Go)',
        }
      );
      blogPostsTable.grantWriteData(this.createPostGoFunction);
    }

    // GET /admin/posts/{id} - Get Post (Go)
    if (shouldCreateFunction('getPost')) {
      this.getPostGoFunction = createGoLambda('GetPostGo', 'posts-get', {
        functionName: 'blog-get-post-go',
        description: 'Get blog post by ID (admin, includes markdown) (Go)',
      });
      blogPostsTable.grantReadData(this.getPostGoFunction);
    }

    // GET /posts/{id} - Get Public Post (Go)
    if (shouldCreateFunction('getPublicPost')) {
      this.getPublicPostGoFunction = createGoLambda(
        'GetPublicPostGo',
        'posts-get_public',
        {
          functionName: 'blog-get-public-post-go',
          description: 'Get published blog post by ID (public, HTML only) (Go)',
        }
      );
      blogPostsTable.grantReadData(this.getPublicPostGoFunction);
    }

    // GET /posts - List Posts (Go)
    if (shouldCreateFunction('listPosts')) {
      this.listPostsGoFunction = createGoLambda('ListPostsGo', 'posts-list', {
        functionName: 'blog-list-posts-go',
        description: 'List published blog posts (Go)',
      });
      blogPostsTable.grantReadData(this.listPostsGoFunction);
    }

    // PUT /admin/posts/{id} - Update Post (Go)
    if (shouldCreateFunction('updatePost')) {
      this.updatePostGoFunction = createGoLambda(
        'UpdatePostGo',
        'posts-update',
        {
          functionName: 'blog-update-post-go',
          description: 'Update existing blog post (Go)',
        }
      );
      blogPostsTable.grantReadWriteData(this.updatePostGoFunction);
    }

    // DELETE /admin/posts/{id} - Delete Post (Go)
    if (shouldCreateFunction('deletePost')) {
      this.deletePostGoFunction = createGoLambda(
        'DeletePostGo',
        'posts-delete',
        {
          functionName: 'blog-delete-post-go',
          description: 'Delete blog post (Go)',
        }
      );
      blogPostsTable.grantReadWriteData(this.deletePostGoFunction);
      imagesBucket.grantDelete(this.deletePostGoFunction);
    }

    // ===================
    // Auth Domain Functions
    // ===================

    // POST /auth/login - Login (Go)
    if (shouldCreateFunction('login')) {
      this.loginGoFunction = createGoLambda('LoginGo', 'auth-login', {
        functionName: 'blog-login-go',
        description: 'User authentication (Go)',
      });
    }

    // POST /auth/logout - Logout (Go)
    if (shouldCreateFunction('logout')) {
      this.logoutGoFunction = createGoLambda('LogoutGo', 'auth-logout', {
        functionName: 'blog-logout-go',
        description: 'User logout (Go)',
      });
    }

    // POST /auth/refresh - Refresh Token (Go)
    if (shouldCreateFunction('refresh')) {
      this.refreshGoFunction = createGoLambda('RefreshGo', 'auth-refresh', {
        functionName: 'blog-refresh-go',
        description: 'Token refresh (Go)',
      });
    }

    // ===================
    // Images Domain Functions
    // ===================

    // POST /admin/images/upload-url - Get Upload URL (Go)
    if (shouldCreateFunction('getUploadUrl')) {
      this.getUploadUrlGoFunction = createGoLambda(
        'GetUploadUrlGo',
        'images-get_upload_url',
        {
          functionName: 'blog-upload-url-go',
          description: 'Generate pre-signed URL for image upload (Go)',
        }
      );
      imagesBucket.grantPut(this.getUploadUrlGoFunction);
    }

    // DELETE /admin/images/{key+} - Delete Image (Go)
    if (shouldCreateFunction('deleteImage')) {
      this.deleteImageGoFunction = createGoLambda(
        'DeleteImageGo',
        'images-delete',
        {
          functionName: 'blog-delete-image-go',
          description: 'Delete image from S3 (Go)',
        }
      );
      imagesBucket.grantDelete(this.deleteImageGoFunction);
    }

    // ===================
    // API Gateway Integrations (when Go handles traffic)
    // ===================
    /* istanbul ignore if -- @preserve Integration tested via E2E, unit test causes cyclic deps */
    if (createApiIntegrations) {
      // Verify all required functions are created when API integrations are enabled
      // These are required for a complete API setup
      /* istanbul ignore if -- @preserve Defense-in-depth error handling */
      if (
        !this.createPostGoFunction ||
        !this.getPostGoFunction ||
        !this.getPublicPostGoFunction ||
        !this.listPostsGoFunction ||
        !this.updatePostGoFunction ||
        !this.deletePostGoFunction ||
        !this.getUploadUrlGoFunction ||
        !this.deleteImageGoFunction
      ) {
        throw new Error(
          'All Go Lambda functions must be enabled when createApiIntegrations is true. ' +
            'Ensure featureFlags is not set or all posts/images functions are set to "go".'
        );
      }

      // /admin/posts リソース取得
      const adminResource = restApi.root.getResource('admin');
      /* istanbul ignore if -- @preserve Defense-in-depth error handling */
      if (!adminResource) {
        throw new Error('Admin resource not found');
      }
      const adminPostsResource = adminResource.addResource('posts');

      // POST /admin/posts - 記事作成 (Go)
      adminPostsResource.addMethod(
        'POST',
        new apigateway.LambdaIntegration(this.createPostGoFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // GET /admin/posts - 記事一覧取得（管理用、認証必須）(Go)
      adminPostsResource.addMethod(
        'GET',
        new apigateway.LambdaIntegration(this.listPostsGoFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // /admin/posts/{id}
      const adminPostByIdResource = adminPostsResource.addResource('{id}');

      // GET /admin/posts/{id} - 記事取得 (Go)
      adminPostByIdResource.addMethod(
        'GET',
        new apigateway.LambdaIntegration(this.getPostGoFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // PUT /admin/posts/{id} - 記事更新 (Go)
      adminPostByIdResource.addMethod(
        'PUT',
        new apigateway.LambdaIntegration(this.updatePostGoFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // DELETE /admin/posts/{id} - 記事削除 (Go)
      adminPostByIdResource.addMethod(
        'DELETE',
        new apigateway.LambdaIntegration(this.deletePostGoFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // /admin/images
      const adminImagesResource = adminResource.addResource('images');

      // POST /admin/images/upload-url - 画像アップロードURL生成 (Go)
      const uploadUrlResource = adminImagesResource.addResource('upload-url');
      uploadUrlResource.addMethod(
        'POST',
        new apigateway.LambdaIntegration(this.getUploadUrlGoFunction),
        {
          authorizer,
          authorizationType: apigateway.AuthorizationType.COGNITO,
        }
      );

      // DELETE /admin/images/{key+} - 画像削除 (Go)
      const deleteImageResource = adminImagesResource.addResource('{key+}');
      deleteImageResource.addMethod(
        'DELETE',
        new apigateway.LambdaIntegration(this.deleteImageGoFunction),
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

      // GET /posts - 記事一覧取得（認証不要）(Go)
      postsResource.addMethod(
        'GET',
        new apigateway.LambdaIntegration(this.listPostsGoFunction),
        {
          authorizationType: apigateway.AuthorizationType.NONE,
        }
      );

      // GET /posts/{id} - 記事詳細取得（認証不要）(Go)
      const publicPostByIdResource = postsResource.addResource('{id}');
      publicPostByIdResource.addMethod(
        'GET',
        new apigateway.LambdaIntegration(this.getPublicPostGoFunction),
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

    // Collect all created Go functions (filter out undefined)
    const allGoFunctions: lambda.Function[] = [
      this.createPostGoFunction,
      this.getPostGoFunction,
      this.getPublicPostGoFunction,
      this.listPostsGoFunction,
      this.updatePostGoFunction,
      this.deletePostGoFunction,
      this.loginGoFunction,
      this.logoutGoFunction,
      this.refreshGoFunction,
      this.getUploadUrlGoFunction,
      this.deleteImageGoFunction,
    ].filter((fn): fn is lambda.Function => fn !== undefined);

    allGoFunctions.forEach((fn) => {
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
    if (this.createPostGoFunction) {
      new cdk.CfnOutput(this, 'CreatePostGoFunctionArn', {
        value: this.createPostGoFunction.functionArn,
        description: 'Create Post Go Lambda Function ARN',
      });
    }

    if (this.getPostGoFunction) {
      new cdk.CfnOutput(this, 'GetPostGoFunctionArn', {
        value: this.getPostGoFunction.functionArn,
        description: 'Get Post Go Lambda Function ARN',
      });
    }

    if (this.getPublicPostGoFunction) {
      new cdk.CfnOutput(this, 'GetPublicPostGoFunctionArn', {
        value: this.getPublicPostGoFunction.functionArn,
        description: 'Get Public Post Go Lambda Function ARN',
      });
    }

    if (this.listPostsGoFunction) {
      new cdk.CfnOutput(this, 'ListPostsGoFunctionArn', {
        value: this.listPostsGoFunction.functionArn,
        description: 'List Posts Go Lambda Function ARN',
      });
    }

    if (this.updatePostGoFunction) {
      new cdk.CfnOutput(this, 'UpdatePostGoFunctionArn', {
        value: this.updatePostGoFunction.functionArn,
        description: 'Update Post Go Lambda Function ARN',
      });
    }

    if (this.deletePostGoFunction) {
      new cdk.CfnOutput(this, 'DeletePostGoFunctionArn', {
        value: this.deletePostGoFunction.functionArn,
        description: 'Delete Post Go Lambda Function ARN',
      });
    }

    // Auth domain outputs
    if (this.loginGoFunction) {
      new cdk.CfnOutput(this, 'LoginGoFunctionArn', {
        value: this.loginGoFunction.functionArn,
        description: 'Login Go Lambda Function ARN',
      });
    }

    if (this.logoutGoFunction) {
      new cdk.CfnOutput(this, 'LogoutGoFunctionArn', {
        value: this.logoutGoFunction.functionArn,
        description: 'Logout Go Lambda Function ARN',
      });
    }

    if (this.refreshGoFunction) {
      new cdk.CfnOutput(this, 'RefreshGoFunctionArn', {
        value: this.refreshGoFunction.functionArn,
        description: 'Refresh Go Lambda Function ARN',
      });
    }

    // Images domain outputs
    if (this.getUploadUrlGoFunction) {
      new cdk.CfnOutput(this, 'GetUploadUrlGoFunctionArn', {
        value: this.getUploadUrlGoFunction.functionArn,
        description: 'Get Upload URL Go Lambda Function ARN',
      });
    }

    if (this.deleteImageGoFunction) {
      new cdk.CfnOutput(this, 'DeleteImageGoFunctionArn', {
        value: this.deleteImageGoFunction.functionArn,
        description: 'Delete Image Go Lambda Function ARN',
      });
    }
  }
}
