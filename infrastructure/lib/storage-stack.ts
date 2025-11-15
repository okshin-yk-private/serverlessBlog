import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface StorageStackProps extends cdk.StackProps {
  readonly enableAccessLogs?: boolean;
}

export class StorageStack extends cdk.Stack {
  public readonly imageBucket: s3.Bucket;
  public readonly publicSiteBucket: s3.Bucket;
  public readonly adminSiteBucket: s3.Bucket;
  public readonly accessLogsBucket?: s3.Bucket;

  constructor(scope: Construct, id: string, props?: StorageStackProps) {
    super(scope, id, props);

    const enableAccessLogs = props?.enableAccessLogs ?? false;

    // Access Logs Bucket (if enabled)
    if (enableAccessLogs) {
      this.accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
        bucketName: 'serverless-blog-access-logs',
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        lifecycleRules: [
          {
            enabled: true,
            expiration: cdk.Duration.days(90), // 90日後に削除
          },
        ],
        enforceSSL: true,
      });
    }

    // Image Storage Bucket
    this.imageBucket = new s3.Bucket(this, 'ImageBucket', {
      bucketName: 'serverless-blog-images',
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
      enforceSSL: true,
      serverAccessLogsBucket: this.accessLogsBucket,
      serverAccessLogsPrefix: enableAccessLogs ? 'image-bucket/' : undefined,
    });

    // Public Site Bucket - for hosting the public blog
    this.publicSiteBucket = new s3.Bucket(this, 'PublicSiteBucket', {
      bucketName: 'serverless-blog-public-site',
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
      serverAccessLogsBucket: this.accessLogsBucket,
      serverAccessLogsPrefix: enableAccessLogs
        ? 'public-site-bucket/'
        : undefined,
    });

    // Admin Site Bucket - for hosting the admin dashboard
    this.adminSiteBucket = new s3.Bucket(this, 'AdminSiteBucket', {
      bucketName: 'serverless-blog-admin-site',
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
      serverAccessLogsBucket: this.accessLogsBucket,
      serverAccessLogsPrefix: enableAccessLogs
        ? 'admin-site-bucket/'
        : undefined,
    });

    // CDK Nag Suppressions (開発環境用)
    if (!enableAccessLogs) {
      // AwsSolutions-S1: S3バケットのサーバーアクセスログを無効化
      // 理由: 開発環境では追加のログバケットとコストを避けるため
      // 本番環境では enableAccessLogs=true を設定してログを有効化
      NagSuppressions.addResourceSuppressions(
        this.imageBucket,
        [
          {
            id: 'AwsSolutions-S1',
            reason:
              'Server access logs disabled for development environment to reduce costs. Enable in production with enableAccessLogs=true.',
          },
        ],
        true
      );

      NagSuppressions.addResourceSuppressions(
        this.publicSiteBucket,
        [
          {
            id: 'AwsSolutions-S1',
            reason:
              'Server access logs disabled for development environment to reduce costs. Enable in production with enableAccessLogs=true.',
          },
        ],
        true
      );

      NagSuppressions.addResourceSuppressions(
        this.adminSiteBucket,
        [
          {
            id: 'AwsSolutions-S1',
            reason:
              'Server access logs disabled for development environment to reduce costs. Enable in production with enableAccessLogs=true.',
          },
        ],
        true
      );
    }

    // Export bucket names and ARNs
    new cdk.CfnOutput(this, 'ImageBucketName', {
      value: this.imageBucket.bucketName,
      description: 'Name of the Image Storage bucket',
      exportName: 'ImageBucketName',
    });

    new cdk.CfnOutput(this, 'ImageBucketArn', {
      value: this.imageBucket.bucketArn,
      description: 'ARN of the Image Storage bucket',
      exportName: 'ImageBucketArn',
    });

    new cdk.CfnOutput(this, 'PublicSiteBucketName', {
      value: this.publicSiteBucket.bucketName,
      description: 'Name of the Public Site bucket',
      exportName: 'PublicSiteBucketName',
    });

    new cdk.CfnOutput(this, 'AdminSiteBucketName', {
      value: this.adminSiteBucket.bucketName,
      description: 'Name of the Admin Site bucket',
      exportName: 'AdminSiteBucketName',
    });
  }
}
