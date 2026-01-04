import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { RustLambdaStack } from '../lib/rust-lambda-stack';

describe('RustLambdaStack', () => {
  let app: cdk.App;
  let stack: RustLambdaStack;
  let template: Template;

  // Mock resources for testing
  let mockBlogPostsTable: dynamodb.Table;
  let mockImagesBucket: s3.Bucket;
  let mockRestApi: apigateway.RestApi;
  let mockAuthorizer: apigateway.CognitoUserPoolsAuthorizer;
  let mockUserPool: cognito.UserPool;
  let mockUserPoolClient: cognito.UserPoolClient;

  beforeEach(() => {
    // Skip bundling during tests by setting aws:cdk:bundling-stacks to empty array
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

    // Create RustLambdaStack
    stack = new RustLambdaStack(app, 'TestRustLambdaStack', {
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

    test('Lambda functions should have 128MB memory', () => {
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
  });

  describe('Posts Domain Functions', () => {
    test('should create CreatePostRust function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-create-post-rust',
      });
    });

    test('should create GetPostRust function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-get-post-rust',
      });
    });

    test('should create GetPublicPostRust function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-get-public-post-rust',
      });
    });

    test('should create ListPostsRust function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-list-posts-rust',
      });
    });

    test('should create UpdatePostRust function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-update-post-rust',
      });
    });

    test('should create DeletePostRust function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-delete-post-rust',
      });
    });
  });

  describe('Auth Domain Functions', () => {
    test('should create LoginRust function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-login-rust',
      });
    });

    test('should create LogoutRust function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-logout-rust',
      });
    });

    test('should create RefreshRust function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-refresh-rust',
      });
    });
  });

  describe('Images Domain Functions', () => {
    test('should create GetUploadUrlRust function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-upload-url-rust',
      });
    });

    test('should create DeleteImageRust function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'blog-delete-image-rust',
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
    test('should export CreatePostRust function ARN', () => {
      template.hasOutput('CreatePostRustFunctionArn', {
        Value: Match.objectLike({
          'Fn::GetAtt': Match.anyValue(),
        }),
      });
    });
  });

  describe('Snapshot', () => {
    test('Snapshot test', () => {
      expect(template.toJSON()).toMatchSnapshot();
    });
  });
});
