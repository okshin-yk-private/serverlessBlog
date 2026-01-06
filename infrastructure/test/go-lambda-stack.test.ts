import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { GoLambdaStack } from '../lib/go-lambda-stack';

describe('GoLambdaStack', () => {
  let app: cdk.App;
  let stack: GoLambdaStack;
  let template: Template;

  // Mock resources for testing
  let mockBlogPostsTable: dynamodb.Table;
  let mockImagesBucket: s3.Bucket;
  let mockRestApi: apigateway.RestApi;
  let mockAuthorizer: apigateway.CognitoUserPoolsAuthorizer;
  let mockUserPool: cognito.UserPool;
  let mockUserPoolClient: cognito.UserPoolClient;

  beforeEach(() => {
    // Skip bundling during tests
    app = new cdk.App({
      context: {
        'aws:cdk:bundling-stacks': [],
      },
    });

    // Create mock stack for dependencies
    const mockStack = new cdk.Stack(app, 'MockStack', {
      env: { account: '123456789012', region: 'ap-northeast-1' },
    });

    // Create mock DynamoDB table
    mockBlogPostsTable = new dynamodb.Table(mockStack, 'MockTable', {
      tableName: 'mock-blog-posts',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create mock S3 bucket
    mockImagesBucket = new s3.Bucket(mockStack, 'MockBucket', {
      bucketName: 'mock-images-bucket',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create mock Cognito User Pool and Client
    mockUserPool = new cognito.UserPool(mockStack, 'MockUserPool', {
      userPoolName: 'mock-user-pool',
    });

    mockUserPoolClient = mockUserPool.addClient('MockUserPoolClient', {
      userPoolClientName: 'mock-client',
    });

    // Create mock API Gateway
    mockRestApi = new apigateway.RestApi(mockStack, 'MockApi', {
      restApiName: 'mock-api',
    });

    // Add admin resource for Lambda functions to attach to
    const adminResource = mockRestApi.root.addResource('admin');
    adminResource.addResource('posts');
    adminResource.addResource('images');
    mockRestApi.root.addResource('posts');
    mockRestApi.root.addResource('auth');

    // Create mock authorizer and attach it to the API
    mockAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      mockStack,
      'MockAuthorizer',
      {
        cognitoUserPools: [mockUserPool],
      }
    );

    // Attach authorizer to a method to avoid validation error
    mockRestApi.root.addMethod(
      'GET',
      new apigateway.MockIntegration({
        integrationResponses: [{ statusCode: '200' }],
        requestTemplates: { 'application/json': '{"statusCode": 200}' },
      }),
      {
        authorizer: mockAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [{ statusCode: '200' }],
      }
    );

    // Create GoLambdaStack
    stack = new GoLambdaStack(app, 'TestGoLambdaStack', {
      env: { account: '123456789012', region: 'ap-northeast-1' },
      blogPostsTable: mockBlogPostsTable,
      imagesBucket: mockImagesBucket,
      restApi: mockRestApi,
      authorizer: mockAuthorizer,
      userPoolId: mockUserPool.userPoolId,
      userPoolClientId: mockUserPoolClient.userPoolClientId,
      cloudFrontDomainName: 'dxxxxxxxxxxxx.cloudfront.net',
    });

    template = Template.fromStack(stack);
  });

  describe('Stack creation', () => {
    test('Stack should be created', () => {
      expect(stack).toBeDefined();
    });
  });

  describe('Lambda Function Configuration', () => {
    test('should create 11 Lambda functions', () => {
      // Posts: 6, Auth: 3, Images: 2 = 11 functions
      template.resourceCountIs('AWS::Lambda::Function', 11);
    });

    test('Lambda functions should use provided.al2023 runtime', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'provided.al2023',
      });
    });

    test('Lambda functions should use ARM64 architecture', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Architectures: ['arm64'],
      });
    });

    test('Lambda functions should have bootstrap as handler', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'bootstrap',
      });
    });

    test('Lambda functions should have 128MB memory by default', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 128,
      });
    });

    test('Lambda functions should have 30 second timeout', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Timeout: 30,
      });
    });

    test('Lambda functions should have X-Ray tracing enabled', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        TracingConfig: {
          Mode: 'Active',
        },
      });
    });
  });

  describe('Environment Variables', () => {
    test('Lambda functions should have TABLE_NAME environment variable', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            TABLE_NAME: Match.anyValue(),
          }),
        },
      });
    });

    test('Lambda functions should have BUCKET_NAME environment variable', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            BUCKET_NAME: Match.anyValue(),
          }),
        },
      });
    });

    test('Lambda functions should have USER_POOL_ID environment variable', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            USER_POOL_ID: Match.anyValue(),
          }),
        },
      });
    });

    test('Lambda functions should have USER_POOL_CLIENT_ID environment variable', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            USER_POOL_CLIENT_ID: Match.anyValue(),
          }),
        },
      });
    });

    test('Lambda functions should have CLOUDFRONT_DOMAIN environment variable', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            CLOUDFRONT_DOMAIN: Match.anyValue(),
          }),
        },
      });
    });

    // Note: AWS_REGION is automatically set by the Lambda runtime, not in environment variables
  });

  describe('Posts Domain Functions', () => {
    test('should create CreatePostGo function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-create-post-go',
      });
    });

    test('should create GetPostGo function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-get-post-go',
      });
    });

    test('should create GetPublicPostGo function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-get-public-post-go',
      });
    });

    test('should create ListPostsGo function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-list-posts-go',
      });
    });

    test('should create UpdatePostGo function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-update-post-go',
      });
    });

    test('should create DeletePostGo function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-delete-post-go',
      });
    });
  });

  describe('Auth Domain Functions', () => {
    test('should create LoginGo function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-login-go',
      });
    });

    test('should create LogoutGo function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-logout-go',
      });
    });

    test('should create RefreshGo function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-refresh-go',
      });
    });
  });

  describe('Images Domain Functions', () => {
    test('should create GetUploadUrlGo function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-upload-url-go',
      });
    });

    test('should create DeleteImageGo function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-delete-image-go',
      });
    });
  });

  describe('IAM Permissions', () => {
    test('should grant DynamoDB read permissions to Lambda functions', () => {
      // Check that at least one policy has DynamoDB read actions
      const policies = template.findResources('AWS::IAM::Policy');
      const hasDynamoDbReadPermissions = Object.values(policies).some(
        (policy) => {
          const statements = policy.Properties?.PolicyDocument?.Statement || [];
          return statements.some((stmt: Record<string, unknown>) => {
            const actions = stmt.Action as string[] | undefined;
            return (
              actions?.includes('dynamodb:GetRecords') ||
              actions?.includes('dynamodb:GetItem') ||
              actions?.includes('dynamodb:Query') ||
              actions?.includes('dynamodb:Scan') ||
              actions?.includes('dynamodb:BatchGetItem')
            );
          });
        }
      );
      expect(hasDynamoDbReadPermissions).toBe(true);
    });

    test('should grant S3 put permissions to upload function', () => {
      // Check that at least one policy has S3 put actions
      const policies = template.findResources('AWS::IAM::Policy');
      const hasS3PutPermissions = Object.values(policies).some((policy) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        return statements.some((stmt: Record<string, unknown>) => {
          const actions = stmt.Action as string[] | undefined;
          return (
            actions?.includes('s3:PutObject') ||
            actions?.includes('s3:PutObject*')
          );
        });
      });
      expect(hasS3PutPermissions).toBe(true);
    });

    test('should grant S3 delete permissions to delete image function', () => {
      // Check that at least one policy has S3 delete actions
      const policies = template.findResources('AWS::IAM::Policy');
      const hasS3DeletePermissions = Object.values(policies).some((policy) => {
        const statements = policy.Properties?.PolicyDocument?.Statement || [];
        return statements.some((stmt: Record<string, unknown>) => {
          const actions = stmt.Action as string[] | undefined;
          return (
            actions?.includes('s3:DeleteObject') ||
            actions?.includes('s3:DeleteObject*')
          );
        });
      });
      expect(hasS3DeletePermissions).toBe(true);
    });
  });

  describe('Outputs', () => {
    test('should export CreatePostGo function ARN', () => {
      template.hasOutput('CreatePostGoFunctionArn', {
        Value: Match.objectLike({
          'Fn::GetAtt': Match.anyValue(),
        }),
      });
    });
  });

  describe('Snapshot', () => {
    test('Snapshot test', () => {
      // Normalize asset hashes for stable snapshots
      const templateJson = template.toJSON();
      const templateString = JSON.stringify(templateJson, null, 2).replace(
        /"S3Key":\s*"[a-f0-9]{64}\.zip"/g,
        '"S3Key": "[ASSET_HASH].zip"'
      );
      expect(JSON.parse(templateString)).toMatchSnapshot();
    });
  });
});

// Note: API Integrations tests are covered by integration/E2E tests
// Unit testing createApiIntegrations=true causes cyclic stack dependencies
// The API integration code paths are protected by istanbul ignore comments

/**
 * Feature Flags Integration Tests
 * Requirements: 9.3 - CDK configuration allows feature flags for switching
 * between Node.js/Rust and Go implementations per function.
 */
describe('GoLambdaStack with Feature Flags', () => {
  let app: cdk.App;
  let mockStack: cdk.Stack;
  let mockBlogPostsTable: dynamodb.Table;
  let mockImagesBucket: s3.Bucket;
  let mockRestApi: apigateway.RestApi;
  let mockAuthorizer: apigateway.CognitoUserPoolsAuthorizer;
  let mockUserPool: cognito.UserPool;
  let mockUserPoolClient: cognito.UserPoolClient;

  beforeEach(() => {
    app = new cdk.App({
      context: {
        'aws:cdk:bundling-stacks': [],
      },
    });

    mockStack = new cdk.Stack(app, 'MockStack', {
      env: { account: '123456789012', region: 'ap-northeast-1' },
    });

    mockBlogPostsTable = new dynamodb.Table(mockStack, 'MockTable', {
      tableName: 'mock-blog-posts',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    mockImagesBucket = new s3.Bucket(mockStack, 'MockBucket', {
      bucketName: 'mock-images-bucket',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    mockUserPool = new cognito.UserPool(mockStack, 'MockUserPool', {
      userPoolName: 'mock-user-pool',
    });

    mockUserPoolClient = mockUserPool.addClient('MockUserPoolClient', {
      userPoolClientName: 'mock-client',
    });

    mockRestApi = new apigateway.RestApi(mockStack, 'MockApi', {
      restApiName: 'mock-api',
    });

    const adminResource = mockRestApi.root.addResource('admin');
    adminResource.addResource('posts');
    adminResource.addResource('images');
    mockRestApi.root.addResource('posts');
    mockRestApi.root.addResource('auth');

    mockAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      mockStack,
      'MockAuthorizer',
      {
        cognitoUserPools: [mockUserPool],
      }
    );

    mockRestApi.root.addMethod(
      'GET',
      new apigateway.MockIntegration({
        integrationResponses: [{ statusCode: '200' }],
        requestTemplates: { 'application/json': '{"statusCode": 200}' },
      }),
      {
        authorizer: mockAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [{ statusCode: '200' }],
      }
    );
  });

  test('should create only Go-enabled functions when feature flags specify Go', () => {
    const stack = new GoLambdaStack(app, 'TestGoLambdaStackWithFlags', {
      env: { account: '123456789012', region: 'ap-northeast-1' },
      blogPostsTable: mockBlogPostsTable,
      imagesBucket: mockImagesBucket,
      restApi: mockRestApi,
      authorizer: mockAuthorizer,
      userPoolId: mockUserPool.userPoolId,
      userPoolClientId: mockUserPoolClient.userPoolClientId,
      cloudFrontDomainName: 'dxxxxxxxxxxxx.cloudfront.net',
      featureFlags: {
        default: 'nodejs', // Default to Node.js
        function: {
          // Only migrate read-only functions to Go (Phase 1 migration)
          getPublicPost: 'go',
          listPosts: 'go',
        },
      },
    });

    const template = Template.fromStack(stack);

    // Should create only 2 Lambda functions (getPublicPost and listPosts)
    template.resourceCountIs('AWS::Lambda::Function', 2);

    // Verify getPublicPost function is created
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'blog-get-public-post-go',
    });

    // Verify listPosts function is created
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'blog-list-posts-go',
    });

    // Verify createPost function is NOT created
    expect(stack.createPostGoFunction).toBeUndefined();
    expect(stack.getPostGoFunction).toBeUndefined();
    expect(stack.loginGoFunction).toBeUndefined();
  });

  test('should create all functions when no feature flags are provided (backward compatibility)', () => {
    const stack = new GoLambdaStack(app, 'TestGoLambdaStackNoFlags', {
      env: { account: '123456789012', region: 'ap-northeast-1' },
      blogPostsTable: mockBlogPostsTable,
      imagesBucket: mockImagesBucket,
      restApi: mockRestApi,
      authorizer: mockAuthorizer,
      userPoolId: mockUserPool.userPoolId,
      userPoolClientId: mockUserPoolClient.userPoolClientId,
      cloudFrontDomainName: 'dxxxxxxxxxxxx.cloudfront.net',
      // No featureFlags provided
    });

    const template = Template.fromStack(stack);

    // Should create all 11 Lambda functions
    template.resourceCountIs('AWS::Lambda::Function', 11);

    // All functions should be defined
    expect(stack.createPostGoFunction).toBeDefined();
    expect(stack.getPostGoFunction).toBeDefined();
    expect(stack.getPublicPostGoFunction).toBeDefined();
    expect(stack.listPostsGoFunction).toBeDefined();
    expect(stack.updatePostGoFunction).toBeDefined();
    expect(stack.deletePostGoFunction).toBeDefined();
    expect(stack.loginGoFunction).toBeDefined();
    expect(stack.logoutGoFunction).toBeDefined();
    expect(stack.refreshGoFunction).toBeDefined();
    expect(stack.getUploadUrlGoFunction).toBeDefined();
    expect(stack.deleteImageGoFunction).toBeDefined();
  });

  test('should create domain-level functions when domain flag is set to Go', () => {
    const stack = new GoLambdaStack(app, 'TestGoLambdaStackDomainFlags', {
      env: { account: '123456789012', region: 'ap-northeast-1' },
      blogPostsTable: mockBlogPostsTable,
      imagesBucket: mockImagesBucket,
      restApi: mockRestApi,
      authorizer: mockAuthorizer,
      userPoolId: mockUserPool.userPoolId,
      userPoolClientId: mockUserPoolClient.userPoolClientId,
      cloudFrontDomainName: 'dxxxxxxxxxxxx.cloudfront.net',
      featureFlags: {
        default: 'nodejs',
        domain: {
          posts: 'go', // All posts domain functions
          auth: 'nodejs', // Keep auth on Node.js
          images: 'nodejs', // Keep images on Node.js
        },
      },
    });

    const template = Template.fromStack(stack);

    // Should create 6 Lambda functions (all posts domain)
    template.resourceCountIs('AWS::Lambda::Function', 6);

    // Posts domain functions should be created
    expect(stack.createPostGoFunction).toBeDefined();
    expect(stack.getPostGoFunction).toBeDefined();
    expect(stack.getPublicPostGoFunction).toBeDefined();
    expect(stack.listPostsGoFunction).toBeDefined();
    expect(stack.updatePostGoFunction).toBeDefined();
    expect(stack.deletePostGoFunction).toBeDefined();

    // Auth and images domain functions should NOT be created
    expect(stack.loginGoFunction).toBeUndefined();
    expect(stack.logoutGoFunction).toBeUndefined();
    expect(stack.refreshGoFunction).toBeUndefined();
    expect(stack.getUploadUrlGoFunction).toBeUndefined();
    expect(stack.deleteImageGoFunction).toBeUndefined();
  });

  test('should create all functions when default is Go', () => {
    const stack = new GoLambdaStack(app, 'TestGoLambdaStackAllGo', {
      env: { account: '123456789012', region: 'ap-northeast-1' },
      blogPostsTable: mockBlogPostsTable,
      imagesBucket: mockImagesBucket,
      restApi: mockRestApi,
      authorizer: mockAuthorizer,
      userPoolId: mockUserPool.userPoolId,
      userPoolClientId: mockUserPoolClient.userPoolClientId,
      cloudFrontDomainName: 'dxxxxxxxxxxxx.cloudfront.net',
      featureFlags: {
        default: 'go', // All Go
      },
    });

    const template = Template.fromStack(stack);

    // Should create all 11 Lambda functions
    template.resourceCountIs('AWS::Lambda::Function', 11);
  });

  test('should create no functions when all default to nodejs', () => {
    const stack = new GoLambdaStack(app, 'TestGoLambdaStackNoGo', {
      env: { account: '123456789012', region: 'ap-northeast-1' },
      blogPostsTable: mockBlogPostsTable,
      imagesBucket: mockImagesBucket,
      restApi: mockRestApi,
      authorizer: mockAuthorizer,
      userPoolId: mockUserPool.userPoolId,
      userPoolClientId: mockUserPoolClient.userPoolClientId,
      cloudFrontDomainName: 'dxxxxxxxxxxxx.cloudfront.net',
      featureFlags: {
        default: 'nodejs', // All Node.js (no Go functions)
      },
    });

    const template = Template.fromStack(stack);

    // Should create 0 Lambda functions
    template.resourceCountIs('AWS::Lambda::Function', 0);

    // All function refs should be undefined
    expect(stack.createPostGoFunction).toBeUndefined();
    expect(stack.getPostGoFunction).toBeUndefined();
    expect(stack.getPublicPostGoFunction).toBeUndefined();
    expect(stack.listPostsGoFunction).toBeUndefined();
    expect(stack.updatePostGoFunction).toBeUndefined();
    expect(stack.deletePostGoFunction).toBeUndefined();
    expect(stack.loginGoFunction).toBeUndefined();
    expect(stack.logoutGoFunction).toBeUndefined();
    expect(stack.refreshGoFunction).toBeUndefined();
    expect(stack.getUploadUrlGoFunction).toBeUndefined();
    expect(stack.deleteImageGoFunction).toBeUndefined();
  });

  test('function-level override should take precedence over domain-level', () => {
    const stack = new GoLambdaStack(app, 'TestGoLambdaStackFunctionOverride', {
      env: { account: '123456789012', region: 'ap-northeast-1' },
      blogPostsTable: mockBlogPostsTable,
      imagesBucket: mockImagesBucket,
      restApi: mockRestApi,
      authorizer: mockAuthorizer,
      userPoolId: mockUserPool.userPoolId,
      userPoolClientId: mockUserPoolClient.userPoolClientId,
      cloudFrontDomainName: 'dxxxxxxxxxxxx.cloudfront.net',
      featureFlags: {
        default: 'nodejs',
        domain: {
          posts: 'go', // All posts to Go
        },
        function: {
          createPost: 'nodejs', // But createPost stays on Node.js
        },
      },
    });

    const template = Template.fromStack(stack);

    // Should create 5 Lambda functions (posts domain minus createPost)
    template.resourceCountIs('AWS::Lambda::Function', 5);

    // createPost should NOT be created (function-level override)
    expect(stack.createPostGoFunction).toBeUndefined();

    // Other posts functions should be created
    expect(stack.getPostGoFunction).toBeDefined();
    expect(stack.getPublicPostGoFunction).toBeDefined();
    expect(stack.listPostsGoFunction).toBeDefined();
    expect(stack.updatePostGoFunction).toBeDefined();
    expect(stack.deletePostGoFunction).toBeDefined();
  });

  test('should only create outputs for enabled functions', () => {
    const stack = new GoLambdaStack(app, 'TestGoLambdaStackOutputs', {
      env: { account: '123456789012', region: 'ap-northeast-1' },
      blogPostsTable: mockBlogPostsTable,
      imagesBucket: mockImagesBucket,
      restApi: mockRestApi,
      authorizer: mockAuthorizer,
      userPoolId: mockUserPool.userPoolId,
      userPoolClientId: mockUserPoolClient.userPoolClientId,
      cloudFrontDomainName: 'dxxxxxxxxxxxx.cloudfront.net',
      featureFlags: {
        default: 'nodejs',
        function: {
          listPosts: 'go',
        },
      },
    });

    const template = Template.fromStack(stack);

    // Should have output for listPosts
    template.hasOutput('ListPostsGoFunctionArn', {
      Value: Match.objectLike({
        'Fn::GetAtt': Match.anyValue(),
      }),
    });

    // Should NOT have output for createPost
    const outputs = template.findOutputs('*');
    expect(outputs['CreatePostGoFunctionArn']).toBeUndefined();
  });
});
