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

  beforeEach(() => {
    app = new cdk.App();

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
    };

    stack = new CdnStack(app, 'TestCdnStack', props);
    template = Template.fromStack(stack);
  });

  describe('CloudFront Function Creation', () => {
    test('should NOT create Basic Auth function when stage is not DEV', () => {
      // When stage context is not 'dev', no Basic Auth function should be created
      const functions = template.findResources('AWS::CloudFront::Function');

      // In non-DEV environment, we expect no CloudFront Functions
      expect(Object.keys(functions)).toHaveLength(0);
    });
  });

  describe('CloudFront Function Creation - DEV Environment', () => {
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
      };

      stack = new CdnStack(app, 'TestCdnStackStg', props);
      template = Template.fromStack(stack);
    });

    test('should create Basic Auth CloudFront Function in DEV environment', () => {
      // Verify CloudFront Function exists
      template.resourceCountIs('AWS::CloudFront::Function', 1);
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
      const functionKeys = Object.keys(functions);
      expect(functionKeys.length).toBe(1);

      const functionCode = functions[functionKeys[0]].Properties.FunctionCode;

      // Verify credentials are embedded
      expect(functionCode).toContain('testuser');
      expect(functionCode).toContain('testpass123');

      // Verify Base64 encoding logic exists
      expect(functionCode).toContain('Authorization');
      expect(functionCode).toContain('Basic');
      expect(functionCode).toContain('atob');
    });

    test('should return 401 Unauthorized logic in function code', () => {
      const functions = template.findResources('AWS::CloudFront::Function');
      const functionKeys = Object.keys(functions);
      const functionCode = functions[functionKeys[0]].Properties.FunctionCode;

      // Verify 401 response logic
      expect(functionCode).toContain('401');
      expect(functionCode).toContain('WWW-Authenticate');
      expect(functionCode).toContain('Basic realm');
    });

    test('should forward request to origin on successful authentication', () => {
      const functions = template.findResources('AWS::CloudFront::Function');
      const functionKeys = Object.keys(functions);
      const functionCode = functions[functionKeys[0]].Properties.FunctionCode;

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

    test('should NOT be associated with Image Distribution', () => {
      // Image distribution should not have Basic Auth
      const distributions = template.findResources(
        'AWS::CloudFront::Distribution'
      );
      const imageDistribution = Object.values(distributions).find(
        (dist: any) =>
          dist.Properties.DistributionConfig.Comment === 'CDN for blog images'
      );

      expect(imageDistribution).toBeDefined();
      expect(
        imageDistribution?.Properties.DistributionConfig.DefaultCacheBehavior
          .FunctionAssociations
      ).toBeUndefined();
    });

    test('should NOT be associated with Admin Distribution', () => {
      // Admin distribution should not have Basic Auth
      const distributions = template.findResources(
        'AWS::CloudFront::Distribution'
      );
      const adminDistribution = Object.values(distributions).find(
        (dist: any) =>
          dist.Properties.DistributionConfig.Comment ===
          'CDN for admin dashboard'
      );

      expect(adminDistribution).toBeDefined();
      expect(
        adminDistribution?.Properties.DistributionConfig.DefaultCacheBehavior
          .FunctionAssociations
      ).toBeUndefined();
    });
  });

  describe('Basic Auth Function Code Logic', () => {
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
      };

      stack = new CdnStack(app, 'TestCdnStackAuth', props);
      template = Template.fromStack(stack);
    });

    test('should handle missing Authorization header', () => {
      const functions = template.findResources('AWS::CloudFront::Function');
      const functionCode =
        functions[Object.keys(functions)[0]].Properties.FunctionCode;

      // Verify handling of missing Authorization header
      expect(functionCode).toContain('request.headers');
      expect(functionCode).toContain('authorization');

      // Should return 401 if header is missing
      expect(functionCode).toMatch(/if\s*\(/);
      expect(functionCode).toContain('statusCode');
    });

    test('should decode Base64 Authorization header', () => {
      const functions = template.findResources('AWS::CloudFront::Function');
      const functionCode =
        functions[Object.keys(functions)[0]].Properties.FunctionCode;

      // Verify Base64 decoding logic
      expect(functionCode).toContain('atob');
      expect(functionCode).toContain('split');
      expect(functionCode).toContain(':');
    });

    test('should validate username and password', () => {
      const functions = template.findResources('AWS::CloudFront::Function');
      const functionCode =
        functions[Object.keys(functions)[0]].Properties.FunctionCode;

      // Verify credential validation
      expect(functionCode).toContain('admin');
      expect(functionCode).toContain('SecureP@ss123');
      expect(functionCode).toMatch(/===|==/); // Equality comparison
    });

    test('should return proper 401 response structure', () => {
      const functions = template.findResources('AWS::CloudFront::Function');
      const functionCode =
        functions[Object.keys(functions)[0]].Properties.FunctionCode;

      // Verify 401 response structure
      expect(functionCode).toContain('statusCode');
      expect(functionCode).toContain('statusDescription');
      expect(functionCode).toContain('headers');
      expect(functionCode).toContain('www-authenticate');
    });
  });

  describe('Error Handling', () => {
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
      };

      // Should throw error when basicAuth is not provided in DEV
      expect(() => {
        new CdnStack(appNoAuth, 'TestCdnStackNoAuth', props);
      }).toThrow(/basicAuth context is required/i);
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
      };

      expect(() => {
        new CdnStack(appNoUsername, 'TestCdnStackNoUsername', props);
      }).toThrow(/username.*required/i);
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
      };

      expect(() => {
        new CdnStack(appNoPassword, 'TestCdnStackNoPassword', props);
      }).toThrow(/password.*required/i);
    });
  });
});
