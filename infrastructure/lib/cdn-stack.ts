import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface CdnStackProps extends cdk.StackProps {
  imageBucketName: string;
  publicSiteBucketName: string;
  adminSiteBucketName: string;
}

export class CdnStack extends cdk.Stack {
  public readonly imageDistribution: cloudfront.Distribution;
  public readonly publicSiteDistribution: cloudfront.Distribution;
  public readonly adminSiteDistribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    const { imageBucketName, publicSiteBucketName, adminSiteBucketName } =
      props;

    // Import buckets by name to avoid circular dependencies
    const imageBucket = s3.Bucket.fromBucketName(
      this,
      'ImportedImageBucket',
      imageBucketName
    );
    const publicSiteBucket = s3.Bucket.fromBucketName(
      this,
      'ImportedPublicSiteBucket',
      publicSiteBucketName
    );
    const adminSiteBucket = s3.Bucket.fromBucketName(
      this,
      'ImportedAdminSiteBucket',
      adminSiteBucketName
    );

    // CloudFront Distribution for Image CDN
    // Using Origin Access Control (OAC) - recommended best practice over OAI
    // OAC provides enhanced security with short-term credentials and supports SSE-KMS
    this.imageDistribution = new cloudfront.Distribution(
      this,
      'ImageDistribution',
      {
        comment: 'CDN for blog images',
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(imageBucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          compress: true, // Enable Gzip/Brotli compression
          cachePolicy: new cloudfront.CachePolicy(this, 'ImageCachePolicy', {
            cachePolicyName: 'BlogImageCachePolicy',
            comment: 'Cache policy for blog images with 24 hour TTL',
            defaultTtl: cdk.Duration.hours(24),
            minTtl: cdk.Duration.hours(1),
            maxTtl: cdk.Duration.days(365),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
            headerBehavior: cloudfront.CacheHeaderBehavior.none(),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
          }),
        },
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe edge locations for cost optimization
        enableLogging: false, // Disable access logging for cost optimization (can be enabled later)
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      }
    );

    // CDK Nag suppressions for Image Distribution
    NagSuppressions.addResourceSuppressions(
      this.imageDistribution,
      [
        {
          id: 'AwsSolutions-CFR1',
          reason:
            'Geo restrictions not required for development environment. Can be enabled in production based on business requirements.',
        },
        {
          id: 'AwsSolutions-CFR2',
          reason:
            'AWS WAF integration not required for development environment. Should be enabled in production for enhanced security against web attacks.',
        },
        {
          id: 'AwsSolutions-CFR3',
          reason:
            'Access logging disabled for development environment to reduce costs. Enable in production.',
        },
        {
          id: 'AwsSolutions-CFR4',
          reason:
            'Using default CloudFront certificate for development. The minimumProtocolVersion is set to TLS_V1_2_2021, but CFR4 requires custom certificate to enforce this.',
        },
      ],
      true
    );

    // CloudFront Distribution for Public Site
    // Using Origin Access Control (OAC) - recommended best practice over OAI
    this.publicSiteDistribution = new cloudfront.Distribution(
      this,
      'PublicSiteDistribution',
      {
        comment: 'CDN for public blog site',
        defaultBehavior: {
          origin:
            origins.S3BucketOrigin.withOriginAccessControl(publicSiteBucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          compress: true,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        defaultRootObject: 'index.html',
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.minutes(5),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.minutes(5),
          },
        ],
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
        enableLogging: false,
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      }
    );

    // CDK Nag suppressions for Public Site Distribution
    NagSuppressions.addResourceSuppressions(
      this.publicSiteDistribution,
      [
        {
          id: 'AwsSolutions-CFR1',
          reason:
            'Geo restrictions not required for development environment. Can be enabled in production based on business requirements.',
        },
        {
          id: 'AwsSolutions-CFR2',
          reason:
            'AWS WAF integration not required for development environment. Should be enabled in production for enhanced security against web attacks.',
        },
        {
          id: 'AwsSolutions-CFR3',
          reason:
            'Access logging disabled for development environment to reduce costs. Enable in production.',
        },
        {
          id: 'AwsSolutions-CFR4',
          reason:
            'Using default CloudFront certificate for development. The minimumProtocolVersion is set to TLS_V1_2_2021, but CFR4 requires custom certificate to enforce this.',
        },
      ],
      true
    );

    // CloudFront Distribution for Admin Site
    // Using Origin Access Control (OAC) - recommended best practice over OAI
    this.adminSiteDistribution = new cloudfront.Distribution(
      this,
      'AdminSiteDistribution',
      {
        comment: 'CDN for admin dashboard',
        defaultBehavior: {
          origin:
            origins.S3BucketOrigin.withOriginAccessControl(adminSiteBucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          compress: true,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        defaultRootObject: 'index.html',
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.minutes(5),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.minutes(5),
          },
        ],
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
        enableLogging: false,
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      }
    );

    // CDK Nag suppressions for Admin Site Distribution
    NagSuppressions.addResourceSuppressions(
      this.adminSiteDistribution,
      [
        {
          id: 'AwsSolutions-CFR1',
          reason:
            'Geo restrictions not required for development environment. Can be enabled in production based on business requirements.',
        },
        {
          id: 'AwsSolutions-CFR2',
          reason:
            'AWS WAF integration not required for development environment. Should be enabled in production for enhanced security against web attacks.',
        },
        {
          id: 'AwsSolutions-CFR3',
          reason:
            'Access logging disabled for development environment to reduce costs. Enable in production.',
        },
        {
          id: 'AwsSolutions-CFR4',
          reason:
            'Using default CloudFront certificate for development. The minimumProtocolVersion is set to TLS_V1_2_2021, but CFR4 requires custom certificate to enforce this.',
        },
      ],
      true
    );

    // Add restrictive bucket policies for OAC
    // セキュリティ強化: 特定のCloudFrontディストリビューションのみがS3にアクセス可能
    const _imageBucketPolicy = new s3.CfnBucketPolicy(
      this,
      'ImageBucketPolicy',
      {
        bucket: imageBucketName,
        policyDocument: {
          Statement: [
            {
              Sid: 'AllowCloudFrontOAC',
              Effect: 'Allow',
              Principal: {
                Service: 'cloudfront.amazonaws.com',
              },
              Action: 's3:GetObject',
              Resource: `arn:aws:s3:::${imageBucketName}/*`,
              Condition: {
                StringEquals: {
                  'AWS:SourceArn': `arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${this.imageDistribution.distributionId}`,
                },
              },
            },
            {
              Sid: 'DenyInsecureTransport',
              Effect: 'Deny',
              Principal: '*',
              Action: 's3:*',
              Resource: [
                `arn:aws:s3:::${imageBucketName}`,
                `arn:aws:s3:::${imageBucketName}/*`,
              ],
              Condition: {
                Bool: {
                  'aws:SecureTransport': 'false',
                },
              },
            },
          ],
        },
      }
    );

    const _publicSiteBucketPolicy = new s3.CfnBucketPolicy(
      this,
      'PublicSiteBucketPolicy',
      {
        bucket: publicSiteBucketName,
        policyDocument: {
          Statement: [
            {
              Sid: 'AllowCloudFrontOAC',
              Effect: 'Allow',
              Principal: {
                Service: 'cloudfront.amazonaws.com',
              },
              Action: 's3:GetObject',
              Resource: `arn:aws:s3:::${publicSiteBucketName}/*`,
              Condition: {
                StringEquals: {
                  'AWS:SourceArn': `arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${this.publicSiteDistribution.distributionId}`,
                },
              },
            },
            {
              Sid: 'DenyInsecureTransport',
              Effect: 'Deny',
              Principal: '*',
              Action: 's3:*',
              Resource: [
                `arn:aws:s3:::${publicSiteBucketName}`,
                `arn:aws:s3:::${publicSiteBucketName}/*`,
              ],
              Condition: {
                Bool: {
                  'aws:SecureTransport': 'false',
                },
              },
            },
          ],
        },
      }
    );

    const _adminSiteBucketPolicy = new s3.CfnBucketPolicy(
      this,
      'AdminSiteBucketPolicy',
      {
        bucket: adminSiteBucketName,
        policyDocument: {
          Statement: [
            {
              Sid: 'AllowCloudFrontOAC',
              Effect: 'Allow',
              Principal: {
                Service: 'cloudfront.amazonaws.com',
              },
              Action: 's3:GetObject',
              Resource: `arn:aws:s3:::${adminSiteBucketName}/*`,
              Condition: {
                StringEquals: {
                  'AWS:SourceArn': `arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${this.adminSiteDistribution.distributionId}`,
                },
              },
            },
            {
              Sid: 'DenyInsecureTransport',
              Effect: 'Deny',
              Principal: '*',
              Action: 's3:*',
              Resource: [
                `arn:aws:s3:::${adminSiteBucketName}`,
                `arn:aws:s3:::${adminSiteBucketName}/*`,
              ],
              Condition: {
                Bool: {
                  'aws:SecureTransport': 'false',
                },
              },
            },
          ],
        },
      }
    );

    // CDK Nag Suppressions
    // AwsSolutions-S5 は既にCloudFront Origin Access Control (OAC)を使用しているため不要
    // OACはOAIの後継で、以下の利点があります：
    // - SSE-KMSサポート
    // - 動的リクエスト（PUT/DELETE）サポート
    // - 短期認証情報による強化されたセキュリティ
    // PublicSiteBucketとAdminSiteBucketはCloudFront経由でのみアクセス可能

    // CloudFront domain name outputs
    new cdk.CfnOutput(this, 'ImageDistributionDomainName', {
      value: this.imageDistribution.distributionDomainName,
      description: 'CloudFront distribution domain name for images',
      exportName: 'ImageDistributionDomainName',
    });

    new cdk.CfnOutput(this, 'ImageDistributionId', {
      value: this.imageDistribution.distributionId,
      description: 'CloudFront distribution ID for images',
      exportName: 'ImageDistributionId',
    });

    new cdk.CfnOutput(this, 'PublicSiteDistributionDomainName', {
      value: this.publicSiteDistribution.distributionDomainName,
      description: 'CloudFront distribution domain name for public site',
      exportName: 'PublicSiteDistributionDomainName',
    });

    new cdk.CfnOutput(this, 'PublicSiteDistributionId', {
      value: this.publicSiteDistribution.distributionId,
      description: 'CloudFront distribution ID for public site',
      exportName: 'PublicSiteDistributionId',
    });

    new cdk.CfnOutput(this, 'AdminSiteDistributionDomainName', {
      value: this.adminSiteDistribution.distributionDomainName,
      description: 'CloudFront distribution domain name for admin site',
      exportName: 'AdminSiteDistributionDomainName',
    });

    new cdk.CfnOutput(this, 'AdminSiteDistributionId', {
      value: this.adminSiteDistribution.distributionId,
      description: 'CloudFront distribution ID for admin site',
      exportName: 'AdminSiteDistributionId',
    });
  }
}
