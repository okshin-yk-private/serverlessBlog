import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';

export interface LambdaFunctionsStackProps extends cdk.StackProps {
  powertoolsLayer: lambda.ILayerVersion;
  commonLayer: lambda.ILayerVersion;
  blogPostsTable: dynamodb.ITable;
  imagesBucket: s3.IBucket;
  restApi: apigateway.IRestApi;
  authorizer: apigateway.IAuthorizer;
}

export class LambdaFunctionsStack extends cdk.Stack {
  public readonly createPostFunction: lambda.Function;
  public readonly getPostFunction: lambda.Function;
  public readonly getPublicPostFunction: lambda.Function;
  public readonly updatePostFunction: lambda.Function;
  public readonly deletePostFunction: lambda.Function;
  public readonly listPostsFunction: lambda.Function;
  public readonly uploadUrlFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaFunctionsStackProps) {
    super(scope, id, props);

    const {
      powertoolsLayer,
      commonLayer,
      blogPostsTable,
      imagesBucket,
      restApi,
      authorizer,
    } = props;

    // 共通のLambda関数設定
    const commonFunctionProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      layers: [powertoolsLayer, commonLayer],
      environment: {
        TABLE_NAME: blogPostsTable.tableName,
        BUCKET_NAME: imagesBucket.bucketName,
        POWERTOOLS_SERVICE_NAME: 'blog-platform',
        POWERTOOLS_METRICS_NAMESPACE: 'BlogPlatform',
        LOG_LEVEL: 'INFO',
      },
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
    };

    // POST /admin/posts - 記事作成
    this.createPostFunction = new lambda.Function(this, 'CreatePostFunction', {
      ...commonFunctionProps,
      functionName: 'blog-create-post',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../functions/posts/createPost')
      ),
      handler: 'index.handler',
      description: 'Create new blog post with Markdown to HTML conversion',
    });

    // DynamoDBへの書き込み権限を付与
    blogPostsTable.grantWriteData(this.createPostFunction);

    // GET /admin/posts/{id} - 記事取得（管理用）
    this.getPostFunction = new lambda.Function(this, 'GetPostFunction', {
      ...commonFunctionProps,
      functionName: 'blog-get-post',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../functions/posts/getPost')
      ),
      handler: 'index.handler',
      description: 'Get blog post by ID (admin, includes markdown)',
    });

    // DynamoDBからの読み取り権限を付与
    blogPostsTable.grantReadData(this.getPostFunction);

    // PUT /admin/posts/{id} - 記事更新
    this.updatePostFunction = new lambda.Function(this, 'UpdatePostFunction', {
      ...commonFunctionProps,
      functionName: 'blog-update-post',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../functions/posts/updatePost')
      ),
      handler: 'index.handler',
      description: 'Update existing blog post',
    });

    // DynamoDBへの読み書き権限を付与
    blogPostsTable.grantReadWriteData(this.updatePostFunction);

    // DELETE /admin/posts/{id} - 記事削除
    this.deletePostFunction = new lambda.Function(this, 'DeletePostFunction', {
      ...commonFunctionProps,
      functionName: 'blog-delete-post',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../functions/posts/deletePost')
      ),
      handler: 'index.handler',
      description: 'Delete blog post',
    });

    // DynamoDBへの読み書き権限を付与
    blogPostsTable.grantReadWriteData(this.deletePostFunction);

    // GET /posts - 記事一覧取得（公開用）
    this.listPostsFunction = new lambda.Function(this, 'ListPostsFunction', {
      ...commonFunctionProps,
      functionName: 'blog-list-posts',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../functions/posts/listPosts')
      ),
      handler: 'index.handler',
      description: 'List published blog posts',
    });

    // DynamoDBからの読み取り権限を付与
    blogPostsTable.grantReadData(this.listPostsFunction);

    // GET /posts/{id} - 記事詳細取得（公開用）
    this.getPublicPostFunction = new lambda.Function(
      this,
      'GetPublicPostFunction',
      {
        ...commonFunctionProps,
        functionName: 'blog-get-public-post',
        code: lambda.Code.fromAsset(
          path.join(__dirname, '../../functions/posts/getPublicPost')
        ),
        handler: 'index.handler',
        description: 'Get published blog post by ID (public, HTML only)',
      }
    );

    // DynamoDBからの読み取り権限を付与
    blogPostsTable.grantReadData(this.getPublicPostFunction);

    // POST /admin/images/upload-url - 画像アップロードURL生成
    this.uploadUrlFunction = new lambda.Function(this, 'UploadUrlFunction', {
      ...commonFunctionProps,
      functionName: 'blog-upload-url',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../functions/images/getUploadUrl')
      ),
      handler: 'index.handler',
      description: 'Generate pre-signed URL for image upload',
    });

    // S3への書き込み権限を付与
    imagesBucket.grantPut(this.uploadUrlFunction);

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
  }
}
