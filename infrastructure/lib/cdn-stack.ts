import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface CdnStackProps extends cdk.StackProps {
  imageBucket: s3.Bucket;
}

export class CdnStack extends cdk.Stack {
  public readonly imageDistribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    const { imageBucket } = props;

    // CloudFront Distribution for Image CDN
    this.imageDistribution = new cloudfront.Distribution(this, 'ImageDistribution', {
      comment: 'CDN for blog images',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(imageBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
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
    });

    // CloudFront domain name output
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
  }
}
