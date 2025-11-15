import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface ApiStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
}

export class ApiStack extends cdk.Stack {
  public readonly restApi: apigateway.RestApi;
  public readonly authorizer: apigateway.CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { userPool } = props;

    // CloudWatch Logs for API Gateway Access Logs
    const apiLogGroup = new logs.LogGroup(this, 'ApiGatewayAccessLogs', {
      logGroupName: '/aws/apigateway/serverless-blog-api',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // REST API作成
    this.restApi = new apigateway.RestApi(this, 'BlogApi', {
      restApiName: 'serverless-blog-api',
      description: 'Serverless Blog REST API',
      // CORS設定
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
      },
      // エンドポイント設定
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
      // CloudWatchロール自動作成
      cloudWatchRole: true,
      // デプロイ設定
      deployOptions: {
        stageName: 'prod',
        tracingEnabled: true,
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(
          apiLogGroup
        ),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
      },
    });

    // Cognito User Pool Authorizer作成
    this.authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      'BlogCognitoAuthorizer',
      {
        cognitoUserPools: [userPool],
        authorizerName: 'blog-cognito-authorizer',
        identitySource: 'method.request.header.Authorization',
      }
    );

    // AuthorizerをRestApiに明示的に関連付ける
    this.authorizer._attachToApi(this.restApi);

    // /admin リソースパス作成（認証必須）
    const adminResource = this.restApi.root.addResource('admin');

    // /posts リソースパス作成（認証不要、公開API）
    const postsResource = this.restApi.root.addResource('posts');

    // Request Validator for API Gateway
    const _requestValidator = new apigateway.RequestValidator(
      this,
      'RequestValidator',
      {
        restApi: this.restApi,
        requestValidatorName: 'BlogApiRequestValidator',
        validateRequestBody: true,
        validateRequestParameters: true,
      }
    );

    // CDK Nag Suppressions
    // AwsSolutions-APIG4: API Gatewayの認証が未実装
    // 理由: リソースにメソッドが未統合のため。Lambda統合時に認証を実装予定
    NagSuppressions.addResourceSuppressions(
      this.restApi,
      [
        {
          id: 'AwsSolutions-APIG4',
          reason:
            'Authorization will be implemented when Lambda functions are integrated with API Gateway methods. Currently resources are created but methods are not yet attached.',
        },
      ],
      true
    );

    // AwsSolutions-IAM4: API GatewayのCloudWatch Logsロールに AWS管理ポリシーを使用
    // 理由: API GatewayがCloudWatch Logsに書き込むための標準的なAWS管理ポリシー
    // AmazonAPIGatewayPushToCloudWatchLogsは、API Gatewayサービス用に最適化されたポリシー
    NagSuppressions.addStackSuppressions(this, [
      {
        id: 'AwsSolutions-IAM4',
        reason:
          'API Gateway CloudWatch role uses AWS managed policy AmazonAPIGatewayPushToCloudWatchLogs which is the recommended approach for API Gateway logging.',
        appliesTo: [
          'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs',
        ],
      },
    ]);

    // Export API endpoint
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.restApi.url,
      description: 'API Gateway endpoint URL',
      exportName: 'BlogApiEndpoint',
    });

    // Export REST API ID
    new cdk.CfnOutput(this, 'RestApiId', {
      value: this.restApi.restApiId,
      description: 'REST API ID',
      exportName: 'BlogRestApiId',
    });

    // Export Authorizer ID
    new cdk.CfnOutput(this, 'AuthorizerId', {
      value: this.authorizer.authorizerId,
      description: 'Cognito Authorizer ID',
      exportName: 'BlogAuthorizerId',
    });

    // Export admin resource ID for future Lambda integrations
    new cdk.CfnOutput(this, 'AdminResourceId', {
      value: adminResource.resourceId,
      description: 'Admin resource ID',
      exportName: 'BlogAdminResourceId',
    });

    // Export posts resource ID for future Lambda integrations
    new cdk.CfnOutput(this, 'PostsResourceId', {
      value: postsResource.resourceId,
      description: 'Posts resource ID',
      exportName: 'BlogPostsResourceId',
    });
  }
}
