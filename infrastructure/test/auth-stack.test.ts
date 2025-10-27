import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AuthStack } from '../lib/auth-stack';

describe('AuthStack', () => {
  let app: cdk.App;
  let stack: AuthStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new AuthStack(app, 'TestAuthStack', {
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
    });
    template = Template.fromStack(stack);
  });

  test('Stack should be created', () => {
    expect(stack).toBeDefined();
  });

  test('Cognito User Pool should be created', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
  });

  test('User Pool should have correct configuration', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: Match.stringLikeRegexp('serverless-blog'),
      AutoVerifiedAttributes: ['email'],
      UsernameAttributes: ['email'],
      MfaConfiguration: 'OPTIONAL',
    });
  });

  test('User Pool should have password policy', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireLowercase: true,
          RequireUppercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        },
      },
    });
  });

  test('User Pool should disable self sign up', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: true,
      },
    });
  });

  test('User Pool Client should be created', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
  });

  test('User Pool Client should have correct configuration', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      UserPoolId: Match.objectLike({
        Ref: Match.anyValue(),
      }),
      GenerateSecret: false,
      ClientName: 'serverless-blog-admin-client',
    });
  });

  test('User Pool Client should have correct auth flows', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ExplicitAuthFlows: Match.arrayWith([
        'ALLOW_USER_PASSWORD_AUTH',
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH',
      ]),
    });
  });

  test('Stack should export User Pool ID', () => {
    template.hasOutput('UserPoolId', {
      Value: Match.objectLike({
        Ref: Match.anyValue(),
      }),
    });
  });

  test('Stack should export User Pool Client ID', () => {
    template.hasOutput('UserPoolClientId', {
      Value: Match.objectLike({
        Ref: Match.anyValue(),
      }),
    });
  });

  test('Stack should export User Pool ARN', () => {
    template.hasOutput('UserPoolArn', {
      Value: Match.objectLike({
        'Fn::GetAtt': Match.anyValue(),
      }),
    });
  });

  test('Snapshot test', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });
});
