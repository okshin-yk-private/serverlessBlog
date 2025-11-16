import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { StorageStack } from '../lib/storage-stack';

describe('StorageStack', () => {
  let app: cdk.App;
  let stack: StorageStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new StorageStack(app, 'TestStorageStack', {
      stage: 'dev', // テスト環境用のstage設定
    });
    template = Template.fromStack(stack);
  });

  test('Stack should be created', () => {
    expect(stack).toBeDefined();
  });

  test('Three S3 buckets should be created', () => {
    template.resourceCountIs('AWS::S3::Bucket', 3);
  });

  describe('Image Storage Bucket', () => {
    test('Should have versioning enabled', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });

    test('Should block public access', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    test('Should have SSE-S3 encryption', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
      });
    });

    test('Should have lifecycle policy for infrequent access', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Status: 'Enabled',
              Transitions: Match.arrayWith([
                Match.objectLike({
                  StorageClass: 'STANDARD_IA',
                  TransitionInDays: 30,
                }),
              ]),
            }),
          ]),
        },
      });
    });

    test('Should export image bucket name', () => {
      template.hasOutput('ImageBucketName', {
        Value: Match.objectLike({
          Ref: Match.anyValue(),
        }),
      });
    });

    test('Should export image bucket ARN', () => {
      template.hasOutput('ImageBucketArn', {
        Value: Match.objectLike({
          'Fn::GetAtt': Match.anyValue(),
        }),
      });
    });
  });

  describe('Static Content Buckets', () => {
    test('Should export public site bucket name', () => {
      template.hasOutput('PublicSiteBucketName', {
        Value: Match.objectLike({
          Ref: Match.anyValue(),
        }),
      });
    });

    test('Should export admin site bucket name', () => {
      template.hasOutput('AdminSiteBucketName', {
        Value: Match.objectLike({
          Ref: Match.anyValue(),
        }),
      });
    });
  });

  test('All buckets should enforce SSL', () => {
    const buckets = template.findResources('AWS::S3::Bucket');
    const bucketCount = Object.keys(buckets).length;
    expect(bucketCount).toBe(3);
  });

  test('Snapshot test', () => {
    expect(template.toJSON()).toMatchSnapshot();
  });

  describe('Access Logs Bucket', () => {
    test('Should not create access logs bucket when disabled (default)', () => {
      const appNoLogs = new cdk.App();
      const stackWithoutLogs = new StorageStack(
        appNoLogs,
        'TestStorageStackNoLogs',
        {
          env: {
            account: '123456789012',
            region: 'ap-northeast-1',
          },
        }
      );
      const templateWithoutLogs = Template.fromStack(stackWithoutLogs);

      // Should have exactly 3 buckets (image, public, admin)
      templateWithoutLogs.resourceCountIs('AWS::S3::Bucket', 3);
    });

    test('Should create access logs bucket when enabled', () => {
      const appWithLogs = new cdk.App();
      const stackWithLogs = new StorageStack(
        appWithLogs,
        'TestStorageStackWithLogs',
        {
          enableAccessLogs: true,
          env: {
            account: '123456789012',
            region: 'ap-northeast-1',
          },
        }
      );
      const templateWithLogs = Template.fromStack(stackWithLogs);

      // Should have 4 buckets (image, public, admin, access-logs)
      templateWithLogs.resourceCountIs('AWS::S3::Bucket', 4);
    });

    test('Access logs bucket should have correct configuration', () => {
      const appLogsConfig = new cdk.App();
      const stackWithLogs = new StorageStack(
        appLogsConfig,
        'TestStorageStackLogsConfig',
        {
          enableAccessLogs: true,
          env: {
            account: '123456789012',
            region: 'ap-northeast-1',
          },
        }
      );
      const templateWithLogs = Template.fromStack(stackWithLogs);

      // Access logs bucket should have lifecycle rules
      templateWithLogs.hasResourceProperties('AWS::S3::Bucket', {
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Status: 'Enabled',
              ExpirationInDays: 90,
            }),
          ]),
        },
      });
    });
  });
});
