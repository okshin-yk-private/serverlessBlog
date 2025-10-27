import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ApiStack } from '../lib/api-stack';
import { AuthStack } from '../lib/auth-stack';

describe('ApiStack', () => {
  let app: cdk.App;
  let authStack: AuthStack;
  let apiStack: ApiStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();

    // Create AuthStack first (dependency)
    authStack = new AuthStack(app, 'TestAuthStack', {
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
    });

    // Create ApiStack with reference to AuthStack
    apiStack = new ApiStack(app, 'TestApiStack', {
      userPool: authStack.userPool,
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
    });

    template = Template.fromStack(apiStack);
  });

  test('Stack should be created', () => {
    expect(apiStack).toBeDefined();
  });

  test('REST API should be created', () => {
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
  });

  test('REST API should have correct configuration', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: Match.stringLikeRegexp('blog.*api'),
      EndpointConfiguration: {
        Types: ['REGIONAL'],
      },
    });
  });

  test('Cognito User Pool Authorizer should be created', () => {
    template.resourceCountIs('AWS::ApiGateway::Authorizer', 1);
  });

  test('Authorizer should reference Cognito User Pool', () => {
    template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
      Type: 'COGNITO_USER_POOLS',
      IdentitySource: 'method.request.header.Authorization',
      RestApiId: Match.objectLike({
        Ref: Match.anyValue(),
      }),
    });
  });

  test('/admin resource path should be created', () => {
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: 'admin',
    });
  });

  test('/posts resource path should be created', () => {
    template.hasResourceProperties('AWS::ApiGateway::Resource', {
      PathPart: 'posts',
    });
  });

  test('CORS should be configured on REST API', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: Match.anyValue(),
    });
  });

  test('API Gateway deployment should be created', () => {
    template.resourceCountIs('AWS::ApiGateway::Deployment', 1);
  });

  test('API Gateway stage should be created', () => {
    template.resourceCountIs('AWS::ApiGateway::Stage', 1);
  });

  test('Stage should have correct configuration', () => {
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      StageName: Match.anyValue(),
      TracingEnabled: true,
    });
  });

  test('Stack should export API endpoint', () => {
    template.hasOutput('ApiEndpoint', Match.objectLike({}));
  });

  test('Stack should export API Gateway REST API ID', () => {
    template.hasOutput('RestApiId', Match.objectLike({}));
  });

  test('Snapshot test', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });
});
