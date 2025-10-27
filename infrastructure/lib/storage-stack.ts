import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class StorageStack extends cdk.Stack {
  public readonly imageBucket: s3.Bucket;
  public readonly publicSiteBucket: s3.Bucket;
  public readonly adminSiteBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
    });

    // Public Site Bucket - for hosting the public blog
    this.publicSiteBucket = new s3.Bucket(this, 'PublicSiteBucket', {
      bucketName: 'serverless-blog-public-site',
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      enforceSSL: true,
    });

    // Admin Site Bucket - for hosting the admin dashboard
    this.adminSiteBucket = new s3.Bucket(this, 'AdminSiteBucket', {
      bucketName: 'serverless-blog-admin-site',
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enforceSSL: true,
    });

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
