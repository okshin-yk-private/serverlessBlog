import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import * as path from 'path';

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
 * Note: Feature flags have been removed (Task 21.4) - Go is now the only implementation.
 * All Lambda functions are always created.
 *
 * Requirements: 9.1, 9.2, 9.4, 9.5, 10.4
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
}

export class GoLambdaStack extends cdk.Stack {
  // Posts domain functions
  public readonly createPostGoFunction: lambda.Function;
  public readonly getPostGoFunction: lambda.Function;
  public readonly getPublicPostGoFunction: lambda.Function;
  public readonly listPostsGoFunction: lambda.Function;
  public readonly updatePostGoFunction: lambda.Function;
  public readonly deletePostGoFunction: lambda.Function;

  // Auth domain functions
  public readonly loginGoFunction: lambda.Function;
  public readonly logoutGoFunction: lambda.Function;
  public readonly refreshGoFunction: lambda.Function;

  // Images domain functions
  public readonly getUploadUrlGoFunction: lambda.Function;
  public readonly deleteImageGoFunction: lambda.Function;

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
    } = props;

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
    this.createPostGoFunction = createGoLambda('CreatePostGo', 'posts-create', {
      functionName: 'blog-create-post-go',
      description: 'Create new blog post with Markdown to HTML conversion (Go)',
    });
    blogPostsTable.grantWriteData(this.createPostGoFunction);

    // GET /admin/posts/{id} - Get Post (Go)
    this.getPostGoFunction = createGoLambda('GetPostGo', 'posts-get', {
      functionName: 'blog-get-post-go',
      description: 'Get blog post by ID (admin, includes markdown) (Go)',
    });
    blogPostsTable.grantReadData(this.getPostGoFunction);

    // GET /posts/{id} - Get Public Post (Go)
    this.getPublicPostGoFunction = createGoLambda(
      'GetPublicPostGo',
      'posts-get_public',
      {
        functionName: 'blog-get-public-post-go',
        description: 'Get published blog post by ID (public, HTML only) (Go)',
      }
    );
    blogPostsTable.grantReadData(this.getPublicPostGoFunction);

    // GET /posts - List Posts (Go)
    this.listPostsGoFunction = createGoLambda('ListPostsGo', 'posts-list', {
      functionName: 'blog-list-posts-go',
      description: 'List published blog posts (Go)',
    });
    blogPostsTable.grantReadData(this.listPostsGoFunction);

    // PUT /admin/posts/{id} - Update Post (Go)
    this.updatePostGoFunction = createGoLambda('UpdatePostGo', 'posts-update', {
      functionName: 'blog-update-post-go',
      description: 'Update existing blog post (Go)',
    });
    blogPostsTable.grantReadWriteData(this.updatePostGoFunction);

    // DELETE /admin/posts/{id} - Delete Post (Go)
    this.deletePostGoFunction = createGoLambda('DeletePostGo', 'posts-delete', {
      functionName: 'blog-delete-post-go',
      description: 'Delete blog post (Go)',
    });
    blogPostsTable.grantReadWriteData(this.deletePostGoFunction);
    imagesBucket.grantDelete(this.deletePostGoFunction);

    // ===================
    // Auth Domain Functions
    // ===================

    // POST /auth/login - Login (Go)
    this.loginGoFunction = createGoLambda('LoginGo', 'auth-login', {
      functionName: 'blog-login-go',
      description: 'User authentication (Go)',
    });

    // POST /auth/logout - Logout (Go)
    this.logoutGoFunction = createGoLambda('LogoutGo', 'auth-logout', {
      functionName: 'blog-logout-go',
      description: 'User logout (Go)',
    });

    // POST /auth/refresh - Refresh Token (Go)
    this.refreshGoFunction = createGoLambda('RefreshGo', 'auth-refresh', {
      functionName: 'blog-refresh-go',
      description: 'Token refresh (Go)',
    });

    // ===================
    // Images Domain Functions
    // ===================

    // POST /admin/images/upload-url - Get Upload URL (Go)
    this.getUploadUrlGoFunction = createGoLambda(
      'GetUploadUrlGo',
      'images-get_upload_url',
      {
        functionName: 'blog-upload-url-go',
        description: 'Generate pre-signed URL for image upload (Go)',
      }
    );
    imagesBucket.grantPut(this.getUploadUrlGoFunction);

    // DELETE /admin/images/{key+} - Delete Image (Go)
    this.deleteImageGoFunction = createGoLambda(
      'DeleteImageGo',
      'images-delete',
      {
        functionName: 'blog-delete-image-go',
        description: 'Delete image from S3 (Go)',
      }
    );
    imagesBucket.grantDelete(this.deleteImageGoFunction);

    // ===================
    // API Gateway Integrations (when Go handles traffic)
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

    // All Go functions
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
    ];

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
    new cdk.CfnOutput(this, 'CreatePostGoFunctionArn', {
      value: this.createPostGoFunction.functionArn,
      description: 'Create Post Go Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'GetPostGoFunctionArn', {
      value: this.getPostGoFunction.functionArn,
      description: 'Get Post Go Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'GetPublicPostGoFunctionArn', {
      value: this.getPublicPostGoFunction.functionArn,
      description: 'Get Public Post Go Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'ListPostsGoFunctionArn', {
      value: this.listPostsGoFunction.functionArn,
      description: 'List Posts Go Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'UpdatePostGoFunctionArn', {
      value: this.updatePostGoFunction.functionArn,
      description: 'Update Post Go Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'DeletePostGoFunctionArn', {
      value: this.deletePostGoFunction.functionArn,
      description: 'Delete Post Go Lambda Function ARN',
    });

    // Auth domain outputs
    new cdk.CfnOutput(this, 'LoginGoFunctionArn', {
      value: this.loginGoFunction.functionArn,
      description: 'Login Go Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'LogoutGoFunctionArn', {
      value: this.logoutGoFunction.functionArn,
      description: 'Logout Go Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'RefreshGoFunctionArn', {
      value: this.refreshGoFunction.functionArn,
      description: 'Refresh Go Lambda Function ARN',
    });

    // Images domain outputs
    new cdk.CfnOutput(this, 'GetUploadUrlGoFunctionArn', {
      value: this.getUploadUrlGoFunction.functionArn,
      description: 'Get Upload URL Go Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'DeleteImageGoFunctionArn', {
      value: this.deleteImageGoFunction.functionArn,
      description: 'Delete Image Go Lambda Function ARN',
    });
  }
}
