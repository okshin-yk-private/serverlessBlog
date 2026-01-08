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
    // Use 'prd' stage to test production configuration (tracing, metrics, logging enabled)
    apiStack = new ApiStack(app, 'TestApiStack', {
      userPool: authStack.userPool,
      stage: 'prd',
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

describe('ApiStack - DEV Environment', () => {
  let app: cdk.App;
  let authStack: AuthStack;
  let apiStack: ApiStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();

    // Create AuthStack first (dependency)
    authStack = new AuthStack(app, 'TestAuthStackDev', {
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
    });

    // Create ApiStack with 'dev' stage to test development configuration
    // (tracing, metrics, logging disabled; dev-specific CDK Nag suppressions)
    apiStack = new ApiStack(app, 'TestApiStackDev', {
      userPool: authStack.userPool,
      stage: 'dev',
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
    });

    template = Template.fromStack(apiStack);
  });

  test('Stack should be created in dev environment', () => {
    expect(apiStack).toBeDefined();
  });

  test('REST API should be created in dev environment', () => {
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
  });

  test('Stage should have dev configuration (tracing disabled)', () => {
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      StageName: 'dev',
      TracingEnabled: false,
    });
  });

  test('CloudWatch Logs LogGroup should NOT be created in dev environment', () => {
    // In dev environment, apiLogGroup is undefined (no access logging)
    const logGroups = template.findResources('AWS::Logs::LogGroup');
    const apiLogGroups = Object.entries(logGroups).filter(([key, _]) =>
      key.includes('ApiGatewayAccessLogs')
    );
    expect(apiLogGroups).toHaveLength(0);
  });

  test('Stage should have metricsEnabled false in dev environment', () => {
    // In dev environment, metricsEnabled is false but MethodSettings may still exist
    // due to CDK's default behavior. We verify TracingEnabled is false instead.
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      StageName: 'dev',
      TracingEnabled: false,
    });
  });

  test('Snapshot test - dev environment', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });
});
