import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'BlogUserPool', {
      userPoolName: 'serverless-blog-user-pool',
      // サインイン属性: メールアドレス
      signInAliases: {
        email: true,
      },
      // 自己登録を無効化（管理者による手動ユーザー作成のみ）
      selfSignUpEnabled: false,
      // メールアドレスの自動検証
      autoVerify: {
        email: true,
      },
      // パスワードポリシー
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      // MFA設定: Optional（将来的にRequiredに変更可能）
      mfa: cognito.Mfa.OPTIONAL,
      // アカウント復旧設定
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // リソース削除ポリシー: 本番環境では RETAIN を推奨
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // User Pool Client（管理画面用）
    this.userPoolClient = new cognito.UserPoolClient(
      this,
      'BlogUserPoolClient',
      {
        userPool: this.userPool,
        userPoolClientName: 'serverless-blog-admin-client',
        // 認証フロー
        authFlows: {
          userPassword: true, // USER_PASSWORD_AUTH
          userSrp: true, // USER_SRP_AUTH
          custom: false,
          adminUserPassword: false,
        },
        // Refreshトークンを有効化
        generateSecret: false, // フロントエンドアプリなのでシークレット不要
        // トークンの有効期限
        accessTokenValidity: cdk.Duration.hours(1),
        idTokenValidity: cdk.Duration.hours(1),
        refreshTokenValidity: cdk.Duration.days(30),
        // OAuthフローは使用しない
        oAuth: undefined,
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.COGNITO,
        ],
      }
    );

    // Export User Pool ID for frontend configuration
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'BlogUserPoolId',
    });

    // Export User Pool Client ID for frontend configuration
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'BlogUserPoolClientId',
    });

    // Export User Pool ARN for API Gateway Authorizer
    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN',
      exportName: 'BlogUserPoolArn',
    });
  }
}
