import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import * as path from 'path';

export interface LambdaFunctionsStackProps extends cdk.StackProps {
  powertoolsLayer: lambda.ILayerVersion;
  commonLayer: lambda.ILayerVersion;
  blogPostsTable: dynamodb.ITable;
  imagesBucket: s3.IBucket;
  restApi: apigateway.IRestApi;
  authorizer: apigateway.IAuthorizer;
  cloudFrontDomainName: string;
}

export class LambdaFunctionsStack extends cdk.Stack {
  public readonly createPostFunction: NodejsFunction;
  public readonly getPostFunction: NodejsFunction;
  public readonly getPublicPostFunction: NodejsFunction;
  public readonly updatePostFunction: NodejsFunction;
  public readonly deletePostFunction: NodejsFunction;
  public readonly listPostsFunction: NodejsFunction;
  public readonly uploadUrlFunction: NodejsFunction;
  public readonly deleteImageFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: LambdaFunctionsStackProps) {
    super(scope, id, props);

    const {
      powertoolsLayer,
      commonLayer,
      blogPostsTable,
      imagesBucket,
      restApi,
      authorizer,
      cloudFrontDomainName,
    } = props;

    // 共通のLambda関数設定
    const commonFunctionProps = {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      layers: [powertoolsLayer, commonLayer],
      environment: {
        TABLE_NAME: blogPostsTable.tableName,
        BUCKET_NAME: imagesBucket.bucketName,
        CLOUDFRONT_DOMAIN: `https://${cloudFrontDomainName}`,
        POWERTOOLS_SERVICE_NAME: 'blog-platform',
        POWERTOOLS_METRICS_NAMESPACE: 'BlogPlatform',
        LOG_LEVEL: 'INFO',
      },
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
    };

    // POST /admin/posts - 記事作成
    this.createPostFunction = new NodejsFunction(this, 'CreatePostFunction', {
      ...commonFunctionProps,
      functionName: 'blog-create-post',
      entry: path.join(
        __dirname,
        '../../functions/posts/createPost/handler.ts'
      ),
      handler: 'handler',
      description: 'Create new blog post with Markdown to HTML conversion',
      bundling: {
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/tracer',
          '@aws-lambda-powertools/metrics',
        ],
      },
    });

    // DynamoDBへの書き込み権限を付与
    blogPostsTable.grantWriteData(this.createPostFunction);

    // GET /admin/posts/{id} - 記事取得（管理用）
    this.getPostFunction = new NodejsFunction(this, 'GetPostFunction', {
      ...commonFunctionProps,
      functionName: 'blog-get-post',
      entry: path.join(__dirname, '../../functions/posts/getPost/handler.ts'),
      handler: 'handler',
      description: 'Get blog post by ID (admin, includes markdown)',
      bundling: {
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/tracer',
          '@aws-lambda-powertools/metrics',
        ],
      },
    });

    // DynamoDBからの読み取り権限を付与
    blogPostsTable.grantReadData(this.getPostFunction);

    // PUT /admin/posts/{id} - 記事更新
    this.updatePostFunction = new NodejsFunction(this, 'UpdatePostFunction', {
      ...commonFunctionProps,
      functionName: 'blog-update-post',
      entry: path.join(
        __dirname,
        '../../functions/posts/updatePost/handler.ts'
      ),
      handler: 'handler',
      description: 'Update existing blog post',
      bundling: {
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/tracer',
          '@aws-lambda-powertools/metrics',
        ],
      },
    });

    // DynamoDBへの読み書き権限を付与
    blogPostsTable.grantReadWriteData(this.updatePostFunction);

    // DELETE /admin/posts/{id} - 記事削除
    this.deletePostFunction = new NodejsFunction(this, 'DeletePostFunction', {
      ...commonFunctionProps,
      functionName: 'blog-delete-post',
      entry: path.join(
        __dirname,
        '../../functions/posts/deletePost/handler.ts'
      ),
      handler: 'handler',
      description: 'Delete blog post',
      bundling: {
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/tracer',
          '@aws-lambda-powertools/metrics',
        ],
      },
    });

    // DynamoDBへの読み書き権限を付与
    blogPostsTable.grantReadWriteData(this.deletePostFunction);

    // GET /posts - 記事一覧取得（公開用）
    this.listPostsFunction = new NodejsFunction(this, 'ListPostsFunction', {
      ...commonFunctionProps,
      functionName: 'blog-list-posts',
      entry: path.join(__dirname, '../../functions/posts/listPosts/handler.ts'),
      handler: 'handler',
      description: 'List published blog posts',
      bundling: {
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/tracer',
          '@aws-lambda-powertools/metrics',
        ],
      },
    });

    // DynamoDBからの読み取り権限を付与
    blogPostsTable.grantReadData(this.listPostsFunction);

    // GET /posts/{id} - 記事詳細取得（公開用）
    this.getPublicPostFunction = new NodejsFunction(
      this,
      'GetPublicPostFunction',
      {
        ...commonFunctionProps,
        functionName: 'blog-get-public-post',
        entry: path.join(
          __dirname,
          '../../functions/posts/getPublicPost/handler.ts'
        ),
        handler: 'handler',
        description: 'Get published blog post by ID (public, HTML only)',
        bundling: {
          externalModules: [
            '@aws-lambda-powertools/logger',
            '@aws-lambda-powertools/tracer',
            '@aws-lambda-powertools/metrics',
          ],
        },
      }
    );

    // DynamoDBからの読み取り権限を付与
    blogPostsTable.grantReadData(this.getPublicPostFunction);

    // POST /admin/images/upload-url - 画像アップロードURL生成
    this.uploadUrlFunction = new NodejsFunction(this, 'UploadUrlFunction', {
      ...commonFunctionProps,
      functionName: 'blog-upload-url',
      entry: path.join(
        __dirname,
        '../../functions/images/getUploadUrl/handler.ts'
      ),
      handler: 'handler',
      description: 'Generate pre-signed URL for image upload',
      bundling: {
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/tracer',
          '@aws-lambda-powertools/metrics',
        ],
      },
    });

    // S3への書き込み権限を付与
    imagesBucket.grantPut(this.uploadUrlFunction);

    // DELETE /admin/images/{key+} - 画像削除
    this.deleteImageFunction = new NodejsFunction(this, 'DeleteImageFunction', {
      ...commonFunctionProps,
      functionName: 'blog-delete-image',
      entry: path.join(
        __dirname,
        '../../functions/images/deleteImage/handler.ts'
      ),
      handler: 'handler',
      description: 'Delete image from S3',
      bundling: {
        externalModules: [
          '@aws-lambda-powertools/logger',
          '@aws-lambda-powertools/tracer',
          '@aws-lambda-powertools/metrics',
        ],
      },
    });

    // S3からの削除権限を付与
    imagesBucket.grantDelete(this.deleteImageFunction);

    // API Gatewayとの統合

    // /admin/posts リソース取得
    const adminResource = restApi.root.getResource('admin');
    if (!adminResource) {
      throw new Error('Admin resource not found');
    }
    const adminPostsResource = adminResource.addResource('posts');

    // POST /admin/posts - 記事作成
    adminPostsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(this.createPostFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // GET /admin/posts - 記事一覧取得（管理用、認証必須）
    adminPostsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.listPostsFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // /admin/posts/{id}
    const adminPostByIdResource = adminPostsResource.addResource('{id}');

    // GET /admin/posts/{id} - 記事取得
    adminPostByIdResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.getPostFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // PUT /admin/posts/{id} - 記事更新
    adminPostByIdResource.addMethod(
      'PUT',
      new apigateway.LambdaIntegration(this.updatePostFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // DELETE /admin/posts/{id} - 記事削除
    adminPostByIdResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(this.deletePostFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // /admin/images
    const adminImagesResource = adminResource.addResource('images');

    // POST /admin/images/upload-url - 画像アップロードURL生成
    const uploadUrlResource = adminImagesResource.addResource('upload-url');
    uploadUrlResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(this.uploadUrlFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // DELETE /admin/images/{key+} - 画像削除
    const deleteImageResource = adminImagesResource.addResource('{key+}');
    deleteImageResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(this.deleteImageFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // 公開API: /posts リソース取得
    const postsResource = restApi.root.getResource('posts');
    if (!postsResource) {
      throw new Error('Posts resource not found');
    }

    // GET /posts - 記事一覧取得（認証不要）
    postsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.listPostsFunction),
      {
        authorizationType: apigateway.AuthorizationType.NONE,
      }
    );

    // GET /posts/{id} - 記事詳細取得（認証不要）
    const publicPostByIdResource = postsResource.addResource('{id}');
    publicPostByIdResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.getPublicPostFunction),
      {
        authorizationType: apigateway.AuthorizationType.NONE,
      }
    );

    // CDK Nag Suppressions

    // Public API endpoints - intentionally without authentication
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

    // Lambda IAM - All functions use AWSLambdaBasicExecutionRole
    const lambdaFunctions = [
      this.createPostFunction,
      this.getPostFunction,
      this.updatePostFunction,
      this.deletePostFunction,
      this.listPostsFunction,
      this.getPublicPostFunction,
      this.uploadUrlFunction,
      this.deleteImageFunction,
    ];

    lambdaFunctions.forEach((fn) => {
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
              'Resource::<BlogPostsTable95467250.Arn>/index/*',
              'Action::s3:Abort*',
              'Action::s3:DeleteObject*',
              'Resource::<ImageBucket97210811.Arn>/*',
            ],
          },
        ],
        true
      );
    });

    // API Gateway - WAF integration (Warning only, acceptable for development)
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-APIG3',
        reason:
          'AWS WAF integration is not required for development environment. Should be enabled in production for DDoS protection and request filtering.',
      },
    ]);

    // Outputs
    new cdk.CfnOutput(this, 'CreatePostFunctionArn', {
      value: this.createPostFunction.functionArn,
      description: 'Create Post Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'GetPostFunctionArn', {
      value: this.getPostFunction.functionArn,
      description: 'Get Post Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'UpdatePostFunctionArn', {
      value: this.updatePostFunction.functionArn,
      description: 'Update Post Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'DeletePostFunctionArn', {
      value: this.deletePostFunction.functionArn,
      description: 'Delete Post Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'ListPostsFunctionArn', {
      value: this.listPostsFunction.functionArn,
      description: 'List Posts Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'GetPublicPostFunctionArn', {
      value: this.getPublicPostFunction.functionArn,
      description: 'Get Public Post Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'UploadUrlFunctionArn', {
      value: this.uploadUrlFunction.functionArn,
      description: 'Upload URL Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'DeleteImageFunctionArn', {
      value: this.deleteImageFunction.functionArn,
      description: 'Delete Image Lambda Function ARN',
    });
  }
}
