import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export interface CdnStackProps extends cdk.StackProps {
  imageBucketName: string;
  publicSiteBucketName: string;
  adminSiteBucketName: string;
}

export class CdnStack extends cdk.Stack {
  // Unified distribution for all sites (public, admin, images)
  public readonly distribution: cloudfront.Distribution;

  // Legacy properties for backward compatibility during migration
  // These will return the same unified distribution
  public get imageDistribution(): cloudfront.Distribution {
    return this.distribution;
  }
  public get publicSiteDistribution(): cloudfront.Distribution {
    return this.distribution;
  }
  public get adminSiteDistribution(): cloudfront.Distribution {
    return this.distribution;
  }

  constructor(scope: Construct, id: string, props: CdnStackProps) {
    super(scope, id, props);

    const { imageBucketName, publicSiteBucketName, adminSiteBucketName } =
      props;

    // Get stage context (dev, prd)
    const stage = this.node.tryGetContext('stage') || 'dev';
    const isDev = stage === 'dev';

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

    // Basic Authentication CloudFront Function for DEV environment
    // Task 4.3.1: CloudFront Functions Basic Authentication implementation
    // Requirement R47: DEV環境Basic認証機能
    let basicAuthFunction: cloudfront.Function | undefined;

    if (isDev) {
      // Get Basic Auth credentials from environment variables or AWS Parameter Store
      // Task 4.3.2: CDK cdk.context.json configuration -> Parameter Store migration
      // Requirement R47: DEV環境Basic認証機能
      // Priority: 1. Environment variables (GitHub Actions), 2. Parameter Store (Local)
      const username =
        process.env.BASIC_AUTH_USERNAME ||
        ssm.StringParameter.valueFromLookup(
          this,
          '/serverless-blog/dev/basic-auth/username'
        );

      const password =
        process.env.BASIC_AUTH_PASSWORD ||
        ssm.StringParameter.valueFromLookup(
          this,
          '/serverless-blog/dev/basic-auth/password'
        );

      // Validate that credentials are available
      if (!username || !password) {
        throw new Error(
          'DEV environment Basic Auth credentials are required. ' +
            'Set BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD environment variables, ' +
            'or ensure Parameter Store parameters exist at /serverless-blog/dev/basic-auth/*'
        );
      }

      // Check if we got dummy values from Parameter Store (initial CDK run)
      const isDummyUsername =
        username === 'dummy-value-for-/serverless-blog/dev/basic-auth/username';
      const isDummyPassword =
        password === 'dummy-value-for-/serverless-blog/dev/basic-auth/password';

      if (isDummyUsername || isDummyPassword) {
        throw new Error(
          'Parameter Store values not yet cached. ' +
            'Please run CDK deploy again, or set BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD environment variables.'
        );
      }

      // CloudFront Function code for Basic Authentication
      // - Checks Authorization header
      // - Decodes Base64 credentials
      // - Validates username and password
      // - Returns 401 Unauthorized if authentication fails
      // - Forwards request to origin if authentication succeeds
      const basicAuthCode = `function handler(event) {
  var request = event.request;
  var headers = request.headers;

  // Expected credentials (embedded at deployment time)
  var authString = 'Basic ' + btoa('${username}:${password}');

  // Check if Authorization header exists
  if (
    typeof headers.authorization === 'undefined' ||
    headers.authorization.value !== authString
  ) {
    // Return 401 Unauthorized with WWW-Authenticate header
    return {
      statusCode: 401,
      statusDescription: 'Unauthorized',
      headers: {
        'www-authenticate': { value: 'Basic realm="DEV Environment"' },
      },
    };
  }

  // Authentication successful - forward request to origin
  return request;
}`;

      basicAuthFunction = new cloudfront.Function(this, 'BasicAuthFunction', {
        functionName: `BasicAuthFunction-${stage}`,
        code: cloudfront.FunctionCode.fromInline(basicAuthCode),
        comment: 'Basic Authentication for DEV environment',
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        autoPublish: true,
      });
    }

    // CloudFront Function for Admin SPA routing
    // Strips /admin prefix and handles SPA routes (paths without extension -> /index.html)
    const adminSpaFunction = new cloudfront.Function(this, 'AdminSpaFunction', {
      functionName: `AdminSpaFunction-${stage}`,
      code: cloudfront.FunctionCode.fromInline(`function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Strip /admin prefix for origin request
  if (uri.startsWith('/admin')) {
    uri = uri.substring(6); // Remove '/admin'
    if (uri === '' || uri === '/') {
      uri = '/index.html';
    } else if (!uri.includes('.')) {
      // SPA routing: paths without extension should serve index.html
      uri = '/index.html';
    }
  }

  request.uri = uri;
  return request;
}`),
      comment:
        'SPA routing for Admin site - strips /admin prefix and handles SPA routes',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      autoPublish: true,
    });

    // CloudFront Function for Images path rewriting
    // Strips /images prefix for origin request
    const imagePathFunction = new cloudfront.Function(
      this,
      'ImagePathFunction',
      {
        functionName: `ImagePathFunction-${stage}`,
        code: cloudfront.FunctionCode.fromInline(`function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Strip /images prefix for origin request
  if (uri.startsWith('/images')) {
    uri = uri.substring(7); // Remove '/images'
    if (uri === '') {
      uri = '/';
    }
  }

  request.uri = uri;
  return request;
}`),
        comment: 'Strips /images prefix for origin request',
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        autoPublish: true,
      }
    );

    // Cache policy for images with long TTL
    const imageCachePolicy = new cloudfront.CachePolicy(
      this,
      'ImageCachePolicy',
      {
        cachePolicyName: `BlogImageCachePolicy-${stage}`,
        comment: 'Cache policy for blog images with 24 hour TTL',
        defaultTtl: cdk.Duration.hours(24),
        minTtl: cdk.Duration.hours(1),
        maxTtl: cdk.Duration.days(365),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      }
    );

    // Unified CloudFront Distribution for all sites (public, admin, images)
    // Using Origin Access Control (OAC) - recommended best practice over OAI
    // OAC provides enhanced security with short-term credentials and supports SSE-KMS
    this.distribution = new cloudfront.Distribution(
      this,
      'UnifiedDistribution',
      {
        comment: 'Unified CDN for blog (public site, admin dashboard, images)',
        // Default behavior: Public Site
        defaultBehavior: {
          origin:
            origins.S3BucketOrigin.withOriginAccessControl(publicSiteBucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          compress: true,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          // Add Basic Auth function for DEV environment (public site only)
          functionAssociations: basicAuthFunction
            ? [
                {
                  function: basicAuthFunction,
                  eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                },
              ]
            : undefined,
        },
        // Additional behaviors for admin and images
        additionalBehaviors: {
          // Admin site behavior: /admin/*
          '/admin/*': {
            origin:
              origins.S3BucketOrigin.withOriginAccessControl(adminSiteBucket),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
            cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
            compress: true,
            cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
            // Admin SPA function strips /admin prefix and handles SPA routing
            functionAssociations: [
              {
                function: adminSpaFunction,
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
              },
            ],
          },
          // Images behavior: /images/*
          '/images/*': {
            origin: origins.S3BucketOrigin.withOriginAccessControl(imageBucket),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
            cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
            compress: true,
            cachePolicy: imageCachePolicy,
            // Image path function strips /images prefix
            functionAssociations: [
              {
                function: imagePathFunction,
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
              },
            ],
          },
        },
        defaultRootObject: 'index.html',
        // SPA error handling for public site (root level)
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

    // CDK Nag suppressions for Unified Distribution
    NagSuppressions.addResourceSuppressions(
      this.distribution,
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
    // セキュリティ強化: 統一CloudFrontディストリビューションのみがS3にアクセス可能
    // All three buckets now reference the same unified distribution
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
                  'AWS:SourceArn': `arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${this.distribution.distributionId}`,
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
                  'AWS:SourceArn': `arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${this.distribution.distributionId}`,
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
                  'AWS:SourceArn': `arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${this.distribution.distributionId}`,
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

    // CloudFront domain name outputs for unified distribution
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'Unified CloudFront distribution domain name',
      exportName: 'BlogDistributionDomainName',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'Unified CloudFront distribution ID',
      exportName: 'BlogDistributionId',
    });

    // URL outputs for convenience
    new cdk.CfnOutput(this, 'PublicSiteUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'Public site URL (root path)',
      exportName: 'BlogPublicSiteUrl',
    });

    new cdk.CfnOutput(this, 'AdminSiteUrl', {
      value: `https://${this.distribution.distributionDomainName}/admin/`,
      description: 'Admin site URL (/admin/ path)',
      exportName: 'BlogAdminSiteUrl',
    });

    new cdk.CfnOutput(this, 'ImagesBaseUrl', {
      value: `https://${this.distribution.distributionDomainName}/images/`,
      description: 'Images base URL (/images/ path)',
      exportName: 'BlogImagesBaseUrl',
    });

    // Legacy outputs for backward compatibility (all point to same distribution)
    // These are required for GitHub Actions workflow cache invalidation
    new cdk.CfnOutput(this, 'ImageDistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description:
        '[LEGACY] CloudFront distribution domain name for images - use DistributionDomainName instead',
      exportName: 'ImageDistributionDomainName',
    });

    new cdk.CfnOutput(this, 'ImageDistributionId', {
      value: this.distribution.distributionId,
      description:
        '[LEGACY] CloudFront distribution ID for images - use DistributionId instead',
      exportName: 'ImageDistributionId',
    });

    new cdk.CfnOutput(this, 'PublicSiteDistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description:
        '[LEGACY] CloudFront distribution domain name for public site - use DistributionDomainName instead',
      exportName: 'PublicSiteDistributionDomainName',
    });

    new cdk.CfnOutput(this, 'PublicSiteDistributionId', {
      value: this.distribution.distributionId,
      description:
        '[LEGACY] CloudFront distribution ID for public site - use DistributionId instead',
      exportName: 'PublicSiteDistributionId',
    });

    new cdk.CfnOutput(this, 'AdminSiteDistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description:
        '[LEGACY] CloudFront distribution domain name for admin site - use DistributionDomainName instead',
      exportName: 'AdminSiteDistributionDomainName',
    });

    new cdk.CfnOutput(this, 'AdminSiteDistributionId', {
      value: this.distribution.distributionId,
      description:
        '[LEGACY] CloudFront distribution ID for admin site - use DistributionId instead',
      exportName: 'AdminSiteDistributionId',
    });
  }
}
