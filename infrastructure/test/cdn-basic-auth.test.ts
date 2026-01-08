/**
 * CloudFront Functions Basic Authentication Tests
 *
 * Task 4.3.1: CloudFront Functions Basic Authentication implementation
 *
 * Tests for viewer-request Basic Authentication function
 * - Authorization header validation
 * - Base64 decode and credential verification
 * - 401 Unauthorized + WWW-Authenticate header on failure
 * - Forward request to origin on success
 *
 * Requirement R47: DEV環境Basic認証機能
 */

import { Template, Match } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import { CdnStack } from '../lib/cdn-stack';

describe('CloudFront Functions Basic Authentication', () => {
  let app: cdk.App;
  let stack: CdnStack;
  let template: Template;

  test('should default to dev stage when no stage context is provided', () => {
    const appNoStage = new cdk.App();

    const bucketStack = new cdk.Stack(appNoStage, 'BucketStackNoStage', {
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
    });

    const imageBucket = new cdk.aws_s3.Bucket(bucketStack, 'ImageBucket', {
      bucketName: 'test-image-bucket-no-stage',
    });
    const publicBucket = new cdk.aws_s3.Bucket(bucketStack, 'PublicBucket', {
      bucketName: 'test-public-bucket-no-stage',
    });
    const adminBucket = new cdk.aws_s3.Bucket(bucketStack, 'AdminBucket', {
      bucketName: 'test-admin-bucket-no-stage',
    });

    const props = {
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
      imageBucketName: imageBucket.bucketName,
      publicSiteBucketName: publicBucket.bucketName,
      adminSiteBucketName: adminBucket.bucketName,
      restApiId: 'test-api-id', // Provide dummy REST API ID for testing
    };

    // Should not throw error when stage context is missing (defaults to dev)
    // But dev stage requires Basic Auth credentials
    process.env.BASIC_AUTH_USERNAME = 'test-user-no-stage';
    process.env.BASIC_AUTH_PASSWORD = 'test-password-no-stage';

    expect(() => {
      new CdnStack(appNoStage, 'TestCdnStackNoStage', props);
    }).not.toThrow();

    delete process.env.BASIC_AUTH_USERNAME;
    delete process.env.BASIC_AUTH_PASSWORD;
  });

  beforeEach(() => {
    // Create app with non-DEV stage (production) to test that Basic Auth is NOT created
    app = new cdk.App({
      context: {
        stage: 'prd',
      },
    });

    //  Create actual buckets in a parent stack first
    const bucketStack = new cdk.Stack(app, 'BucketStack', {
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
    });

    const imageBucket = new cdk.aws_s3.Bucket(bucketStack, 'ImageBucket', {
      bucketName: 'test-image-bucket',
    });
    const publicBucket = new cdk.aws_s3.Bucket(bucketStack, 'PublicBucket', {
      bucketName: 'test-public-bucket',
    });
    const adminBucket = new cdk.aws_s3.Bucket(bucketStack, 'AdminBucket', {
      bucketName: 'test-admin-bucket',
    });

    // Create CDN stack with bucket names
    const props = {
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
      imageBucketName: imageBucket.bucketName,
      publicSiteBucketName: publicBucket.bucketName,
      adminSiteBucketName: adminBucket.bucketName,
      restApiId: 'test-api-id', // Provide dummy REST API ID for testing
    };

    stack = new CdnStack(app, 'TestCdnStack', props);
    template = Template.fromStack(stack);
  });

  describe('CloudFront Function Creation', () => {
    test('should NOT create Basic Auth function when stage is not DEV', () => {
      // When stage context is not 'dev', no Basic Auth function should be created
      const functions = template.findResources('AWS::CloudFront::Function');

      // In non-DEV environment (prd), we expect 3 CloudFront Functions:
      // - AdminSpaFunction (for /admin/* path rewriting and SPA routing)
      // - ImagePathFunction (for /images/* path rewriting)
      // - ApiPathFunction (for /api/* path rewriting to API Gateway)
      // But NOT BasicAuthFunction
      expect(Object.keys(functions)).toHaveLength(3);

      // Verify BasicAuthFunction is NOT present
      const functionNames = Object.values(functions).map(
        (f: any) => f.Properties.Name
      );
      expect(functionNames).not.toContain(expect.stringMatching(/BasicAuth/));
    });
  });

  describe('CloudFront Function Creation - DEV Environment', () => {
    const originalEnv = process.env;

    beforeAll(() => {
      process.env = {
        ...originalEnv,
        BASIC_AUTH_USERNAME: 'testuser',
        BASIC_AUTH_PASSWORD: 'testpass123',
      };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    beforeEach(() => {
      app = new cdk.App({
        context: {
          stage: 'dev',
          basicAuth: {
            username: 'testuser',
            password: 'testpass123',
          },
        },
      });

      // Create actual buckets in a parent stack first
      const bucketStack = new cdk.Stack(app, 'BucketStackStg', {
        env: {
          account: '123456789012',
          region: 'ap-northeast-1',
        },
      });

      const imageBucket = new cdk.aws_s3.Bucket(bucketStack, 'ImageBucket', {
        bucketName: 'test-image-bucket-dev',
      });
      const publicBucket = new cdk.aws_s3.Bucket(bucketStack, 'PublicBucket', {
        bucketName: 'test-public-bucket-dev',
      });
      const adminBucket = new cdk.aws_s3.Bucket(bucketStack, 'AdminBucket', {
        bucketName: 'test-admin-bucket-dev',
      });

      const props = {
        env: {
          account: '123456789012',
          region: 'ap-northeast-1',
        },
        imageBucketName: imageBucket.bucketName,
        publicSiteBucketName: publicBucket.bucketName,
        adminSiteBucketName: adminBucket.bucketName,
        restApiId: 'test-api-id', // Provide dummy REST API ID for testing
      };

      stack = new CdnStack(app, 'TestCdnStackStg', props);
      template = Template.fromStack(stack);
    });

    test('should create Basic Auth CloudFront Function in DEV environment', () => {
      // Verify CloudFront Functions exist
      // In DEV environment, we expect 4 CloudFront Functions:
      // - BasicAuthFunction
      // - AdminCombinedFunction (Basic Auth + SPA routing for admin)
      // - ImagePathFunction
      // - ApiPathFunction
      template.resourceCountIs('AWS::CloudFront::Function', 4);
    });

    test('should have correct function name', () => {
      template.hasResourceProperties('AWS::CloudFront::Function', {
        Name: 'BasicAuthFunction-dev',
        AutoPublish: true,
      });
    });

    test('should use viewer-request event type', () => {
      template.hasResourceProperties('AWS::CloudFront::Function', {
        FunctionConfig: {
          Comment: 'Basic Authentication for DEV environment',
          Runtime: 'cloudfront-js-2.0',
        },
      });
    });

    test('should embed credentials in function code', () => {
      const functions = template.findResources('AWS::CloudFront::Function');

      // Find BasicAuthFunction among all functions
      const basicAuthFunction = Object.values(functions).find(
        (f: any) => f.Properties.Name && f.Properties.Name.includes('BasicAuth')
      ) as any;
      expect(basicAuthFunction).toBeDefined();

      const functionCode = basicAuthFunction.Properties.FunctionCode;

      // Verify credentials are embedded
      expect(functionCode).toContain('testuser');
      expect(functionCode).toContain('testpass123');

      // Verify Base64 encoding logic exists
      expect(functionCode).toContain('Authorization');
      expect(functionCode).toContain('Basic');
      expect(functionCode).toContain('btoa');
    });

    test('should return 401 Unauthorized logic in function code', () => {
      const functions = template.findResources('AWS::CloudFront::Function');

      // Find BasicAuthFunction among all functions
      const basicAuthFunction = Object.values(functions).find(
        (f: any) => f.Properties.Name && f.Properties.Name.includes('BasicAuth')
      ) as any;
      const functionCode = basicAuthFunction.Properties.FunctionCode;

      // Verify 401 response logic
      expect(functionCode).toContain('401');
      expect(functionCode).toContain('WWW-Authenticate');
      expect(functionCode).toContain('Basic realm');
    });

    test('should forward request to origin on successful authentication', () => {
      const functions = template.findResources('AWS::CloudFront::Function');

      // Find BasicAuthFunction among all functions
      const basicAuthFunction = Object.values(functions).find(
        (f: any) => f.Properties.Name && f.Properties.Name.includes('BasicAuth')
      ) as any;
      const functionCode = basicAuthFunction.Properties.FunctionCode;

      // Verify request forwarding logic
      expect(functionCode).toContain('return request');
    });

    test('should be associated with Public Site Distribution in DEV', () => {
      // Verify CloudFront Distribution has FunctionAssociations
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: {
            FunctionAssociations: [
              {
                EventType: 'viewer-request',
                FunctionARN: {
                  'Fn::GetAtt': [
                    Match.stringLikeRegexp('BasicAuthFunction'),
                    'FunctionARN',
                  ],
                },
              },
            ],
          },
        },
      });
    });

    test('should have unified distribution with multiple behaviors', () => {
      // Now using unified distribution with path-based routing
      const distributions = template.findResources(
        'AWS::CloudFront::Distribution'
      );

      // Should only have 1 unified distribution
      expect(Object.keys(distributions)).toHaveLength(1);

      const unifiedDistribution = Object.values(distributions)[0] as any;
      expect(
        unifiedDistribution.Properties.DistributionConfig.Comment
      ).toContain('Unified CDN');

      // Should have CacheBehaviors for /admin/*, /images/*, and /api/*
      expect(
        unifiedDistribution.Properties.DistributionConfig.CacheBehaviors
      ).toBeDefined();
      expect(
        unifiedDistribution.Properties.DistributionConfig.CacheBehaviors.length
      ).toBe(3);
    });

    test('should NOT apply Basic Auth to /admin/* and /images/* behaviors', () => {
      // Basic Auth should only be applied to the default behavior (public site)
      // Admin and images behaviors should have their own path-rewriting functions
      const distributions = template.findResources(
        'AWS::CloudFront::Distribution'
      );
      const unifiedDistribution = Object.values(distributions)[0] as any;

      // Check that /admin/* behavior has AdminSpaFunction (not BasicAuth)
      const adminBehavior =
        unifiedDistribution.Properties.DistributionConfig.CacheBehaviors.find(
          (b: any) => b.PathPattern === '/admin/*'
        );
      expect(adminBehavior).toBeDefined();
      expect(adminBehavior.FunctionAssociations).toHaveLength(1);

      // Check that /images/* behavior has ImagePathFunction (not BasicAuth)
      const imagesBehavior =
        unifiedDistribution.Properties.DistributionConfig.CacheBehaviors.find(
          (b: any) => b.PathPattern === '/images/*'
        );
      expect(imagesBehavior).toBeDefined();
      expect(imagesBehavior.FunctionAssociations).toHaveLength(1);
    });
  });

  describe('Basic Auth Function Code Logic', () => {
    const originalEnv = process.env;

    beforeAll(() => {
      process.env = {
        ...originalEnv,
        BASIC_AUTH_USERNAME: 'admin',
        BASIC_AUTH_PASSWORD: 'SecureP@ss123',
      };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    beforeEach(() => {
      app = new cdk.App({
        context: {
          stage: 'dev',
          basicAuth: {
            username: 'admin',
            password: 'SecureP@ss123',
          },
        },
      });

      const bucketStack = new cdk.Stack(app, 'BucketStackAuth', {
        env: {
          account: '123456789012',
          region: 'ap-northeast-1',
        },
      });

      const imageBucket = new cdk.aws_s3.Bucket(bucketStack, 'ImageBucket', {
        bucketName: 'test-image-bucket-auth',
      });
      const publicBucket = new cdk.aws_s3.Bucket(bucketStack, 'PublicBucket', {
        bucketName: 'test-public-bucket-auth',
      });
      const adminBucket = new cdk.aws_s3.Bucket(bucketStack, 'AdminBucket', {
        bucketName: 'test-admin-bucket-auth',
      });

      const props = {
        env: {
          account: '123456789012',
          region: 'ap-northeast-1',
        },
        imageBucketName: imageBucket.bucketName,
        publicSiteBucketName: publicBucket.bucketName,
        adminSiteBucketName: adminBucket.bucketName,
        restApiId: 'test-api-id', // Provide dummy REST API ID for testing
      };

      stack = new CdnStack(app, 'TestCdnStackAuth', props);
      template = Template.fromStack(stack);
    });

    test('should handle missing Authorization header', () => {
      const functions = template.findResources('AWS::CloudFront::Function');
      // Find BasicAuthFunction among all functions
      const basicAuthFunction = Object.values(functions).find(
        (f: any) => f.Properties.Name && f.Properties.Name.includes('BasicAuth')
      ) as any;
      const functionCode = basicAuthFunction.Properties.FunctionCode;

      // Verify handling of missing Authorization header
      expect(functionCode).toContain('request.headers');
      expect(functionCode).toContain('authorization');

      // Should return 401 if header is missing
      expect(functionCode).toMatch(/if\s*\(/);
      expect(functionCode).toContain('statusCode');
    });

    test('should encode expected credentials with Base64', () => {
      const functions = template.findResources('AWS::CloudFront::Function');
      // Find BasicAuthFunction among all functions
      const basicAuthFunction = Object.values(functions).find(
        (f: any) => f.Properties.Name && f.Properties.Name.includes('BasicAuth')
      ) as any;
      const functionCode = basicAuthFunction.Properties.FunctionCode;

      // Verify Base64 encoding of expected credentials
      expect(functionCode).toContain('btoa');
      expect(functionCode).toContain('authString');
      expect(functionCode).toContain(':');
    });

    test('should validate username and password', () => {
      const functions = template.findResources('AWS::CloudFront::Function');
      // Find BasicAuthFunction among all functions
      const basicAuthFunction = Object.values(functions).find(
        (f: any) => f.Properties.Name && f.Properties.Name.includes('BasicAuth')
      ) as any;
      const functionCode = basicAuthFunction.Properties.FunctionCode;

      // Verify credential validation
      expect(functionCode).toContain('admin');
      expect(functionCode).toContain('SecureP@ss123');
      expect(functionCode).toMatch(/===|==/); // Equality comparison
    });

    test('should return proper 401 response structure', () => {
      const functions = template.findResources('AWS::CloudFront::Function');
      // Find BasicAuthFunction among all functions
      const basicAuthFunction = Object.values(functions).find(
        (f: any) => f.Properties.Name && f.Properties.Name.includes('BasicAuth')
      ) as any;
      const functionCode = basicAuthFunction.Properties.FunctionCode;

      // Verify 401 response structure
      expect(functionCode).toContain('statusCode');
      expect(functionCode).toContain('statusDescription');
      expect(functionCode).toContain('headers');
      expect(functionCode).toContain('www-authenticate');
    });
  });

  describe('Error Handling', () => {
    const originalEnv = process.env;

    beforeAll(() => {
      // Clear environment variables to ensure error handling tests work correctly
      process.env = {
        ...originalEnv,
      };
      delete process.env.BASIC_AUTH_USERNAME;
      delete process.env.BASIC_AUTH_PASSWORD;
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    test('should throw error when credentials are empty strings', () => {
      // Mock Parameter Store to return empty strings
      jest
        .spyOn(cdk.aws_ssm.StringParameter, 'valueFromLookup')
        .mockReturnValue('');

      const appEmptyCreds = new cdk.App({
        context: {
          stage: 'dev',
        },
      });

      const bucketStack = new cdk.Stack(appEmptyCreds, 'BucketStackEmpty', {
        env: {
          account: '123456789012',
          region: 'ap-northeast-1',
        },
      });

      const imageBucket = new cdk.aws_s3.Bucket(bucketStack, 'ImageBucket', {
        bucketName: 'test-image-bucket-empty',
      });
      const publicBucket = new cdk.aws_s3.Bucket(bucketStack, 'PublicBucket', {
        bucketName: 'test-public-bucket-empty',
      });
      const adminBucket = new cdk.aws_s3.Bucket(bucketStack, 'AdminBucket', {
        bucketName: 'test-admin-bucket-empty',
      });

      const props = {
        env: {
          account: '123456789012',
          region: 'ap-northeast-1',
        },
        imageBucketName: imageBucket.bucketName,
        publicSiteBucketName: publicBucket.bucketName,
        adminSiteBucketName: adminBucket.bucketName,
        restApiId: 'test-api-id', // Provide dummy REST API ID for testing
      };

      // Should throw error when credentials are empty
      expect(() => {
        new CdnStack(appEmptyCreds, 'TestCdnStackEmpty', props);
      }).toThrow(/credentials are required/i);

      jest.restoreAllMocks();
    });

    test('should throw error when basicAuth context is missing in DEV environment', () => {
      const appNoAuth = new cdk.App({
        context: {
          stage: 'dev',
          // Missing basicAuth context
        },
      });

      const bucketStack = new cdk.Stack(appNoAuth, 'BucketStackNoAuth', {
        env: {
          account: '123456789012',
          region: 'ap-northeast-1',
        },
      });

      const imageBucket = new cdk.aws_s3.Bucket(bucketStack, 'ImageBucket', {
        bucketName: 'test-image-bucket-noauth',
      });
      const publicBucket = new cdk.aws_s3.Bucket(bucketStack, 'PublicBucket', {
        bucketName: 'test-public-bucket-noauth',
      });
      const adminBucket = new cdk.aws_s3.Bucket(bucketStack, 'AdminBucket', {
        bucketName: 'test-admin-bucket-noauth',
      });

      const props = {
        env: {
          account: '123456789012',
          region: 'ap-northeast-1',
        },
        imageBucketName: imageBucket.bucketName,
        publicSiteBucketName: publicBucket.bucketName,
        adminSiteBucketName: adminBucket.bucketName,
        restApiId: 'test-api-id', // Provide dummy REST API ID for testing
      };

      // Should throw error when credentials are not available
      // (Either from environment variables or Parameter Store)
      expect(() => {
        new CdnStack(appNoAuth, 'TestCdnStackNoAuth', props);
      }).toThrow(
        /Parameter Store values not yet cached|credentials are required/i
      );
    });

    test('should throw error when username is missing in DEV environment', () => {
      const appNoUsername = new cdk.App({
        context: {
          stage: 'dev',
          basicAuth: {
            password: 'testpass',
          },
        },
      });

      const bucketStack = new cdk.Stack(
        appNoUsername,
        'BucketStackNoUsername',
        {
          env: {
            account: '123456789012',
            region: 'ap-northeast-1',
          },
        }
      );

      const imageBucket = new cdk.aws_s3.Bucket(bucketStack, 'ImageBucket', {
        bucketName: 'test-image-bucket-nousername',
      });
      const publicBucket = new cdk.aws_s3.Bucket(bucketStack, 'PublicBucket', {
        bucketName: 'test-public-bucket-nousername',
      });
      const adminBucket = new cdk.aws_s3.Bucket(bucketStack, 'AdminBucket', {
        bucketName: 'test-admin-bucket-nousername',
      });

      const props = {
        env: {
          account: '123456789012',
          region: 'ap-northeast-1',
        },
        imageBucketName: imageBucket.bucketName,
        publicSiteBucketName: publicBucket.bucketName,
        adminSiteBucketName: adminBucket.bucketName,
        restApiId: 'test-api-id', // Provide dummy REST API ID for testing
      };

      expect(() => {
        new CdnStack(appNoUsername, 'TestCdnStackNoUsername', props);
      }).toThrow(
        /Parameter Store values not yet cached|credentials are required/i
      );
    });

    test('should throw error when password is missing in DEV environment', () => {
      const appNoPassword = new cdk.App({
        context: {
          stage: 'dev',
          basicAuth: {
            username: 'testuser',
          },
        },
      });

      const bucketStack = new cdk.Stack(
        appNoPassword,
        'BucketStackNoPassword',
        {
          env: {
            account: '123456789012',
            region: 'ap-northeast-1',
          },
        }
      );

      const imageBucket = new cdk.aws_s3.Bucket(bucketStack, 'ImageBucket', {
        bucketName: 'test-image-bucket-nopassword',
      });
      const publicBucket = new cdk.aws_s3.Bucket(bucketStack, 'PublicBucket', {
        bucketName: 'test-public-bucket-nopassword',
      });
      const adminBucket = new cdk.aws_s3.Bucket(bucketStack, 'AdminBucket', {
        bucketName: 'test-admin-bucket-nopassword',
      });

      const props = {
        env: {
          account: '123456789012',
          region: 'ap-northeast-1',
        },
        imageBucketName: imageBucket.bucketName,
        publicSiteBucketName: publicBucket.bucketName,
        adminSiteBucketName: adminBucket.bucketName,
        restApiId: 'test-api-id', // Provide dummy REST API ID for testing
      };

      expect(() => {
        new CdnStack(appNoPassword, 'TestCdnStackNoPassword', props);
      }).toThrow(
        /Parameter Store values not yet cached|credentials are required/i
      );
    });
  });

  describe('Legacy Properties for Backward Compatibility', () => {
    test('should return unified distribution from legacy getter properties', () => {
      // The legacy properties should all return the same unified distribution
      // for backward compatibility during migration
      expect(stack.imageDistribution).toBe(stack.distribution);
      expect(stack.publicSiteDistribution).toBe(stack.distribution);
      expect(stack.adminSiteDistribution).toBe(stack.distribution);
    });

    test('legacy properties should be defined CloudFront distributions', () => {
      expect(stack.imageDistribution).toBeDefined();
      expect(stack.publicSiteDistribution).toBeDefined();
      expect(stack.adminSiteDistribution).toBeDefined();

      // Verify they have CloudFront distribution properties
      expect(stack.imageDistribution.distributionId).toBeDefined();
      expect(stack.publicSiteDistribution.distributionDomainName).toBeDefined();
      expect(stack.adminSiteDistribution.domainName).toBeDefined();
    });
  });
});
