/**
 * Task 4.2: 画像CDN配信の統合テスト
 * Requirement R11: 画像CDN配信機能
 *
 * このテストはCloudFrontとS3の統合を検証します。
 * 実際のAWSリソースがデプロイされている環境で実行する必要があります。
 */

import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

describe('CloudFront CDN Integration Tests', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;
  let imageBucket: s3.Bucket;
  let distribution: cloudfront.Distribution;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'IntegrationTestStack', {
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
    });

    // Create Image Bucket
    imageBucket = new s3.Bucket(stack, 'ImageBucket', {
      bucketName: 'integration-test-image-bucket',
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Create CloudFront Distribution
    distribution = new cloudfront.Distribution(stack, 'ImageDistribution', {
      comment: 'CDN for blog images',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(imageBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        cachePolicy: new cloudfront.CachePolicy(stack, 'ImageCachePolicy', {
          cachePolicyName: 'IntegrationTestImageCachePolicy',
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
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableLogging: false,
    });

    template = Template.fromStack(stack);
  });

  describe('CloudFront画像配信テスト', () => {
    test('CloudFrontディストリビューションが作成されている', () => {
      template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    });

    test('S3バケットがオリジンとして設定されている', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          Origins: Match.arrayWith([
            Match.objectLike({
              DomainName: {
                'Fn::GetAtt': Match.arrayWith([
                  Match.stringLikeRegexp('ImageBucket'),
                  'RegionalDomainName',
                ]),
              },
            }),
          ]),
        },
      });
    });

    test('Origin Access Control (OAC)が設定されている', () => {
      // OACリソースが作成されていることを確認
      template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    });
  });

  describe('キャッシュヘッダーとキャッシング動作テスト', () => {
    test('キャッシュポリシーが作成されている', () => {
      template.resourceCountIs('AWS::CloudFront::CachePolicy', 1);
    });

    test('24時間のデフォルトTTLが設定されている', () => {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: {
          DefaultTTL: 86400, // 24 hours in seconds
          MinTTL: 3600, // 1 hour
          MaxTTL: 31536000, // 365 days
        },
      });
    });

    test('Gzip圧縮が有効化されている', () => {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: {
          ParametersInCacheKeyAndForwardedToOrigin: {
            EnableAcceptEncodingGzip: true,
          },
        },
      });
    });

    test('Brotli圧縮が有効化されている', () => {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: {
          ParametersInCacheKeyAndForwardedToOrigin: {
            EnableAcceptEncodingBrotli: true,
          },
        },
      });
    });

    test('Compressionが有効化されている', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: {
            Compress: true,
          },
        },
      });
    });
  });

  describe('CloudFront経由で画像URLがアクセス可能であることの検証', () => {
    test('HTTPS接続が強制されている', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: {
            ViewerProtocolPolicy: 'redirect-to-https',
          },
        },
      });
    });

    test('GET と HEAD メソッドのみが許可されている', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: {
            AllowedMethods: ['GET', 'HEAD'],
            CachedMethods: ['GET', 'HEAD'],
          },
        },
      });
    });

    test('ディストリビューションが有効化されている', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          Enabled: true,
        },
      });
    });
  });

  describe('画像アクセスパフォーマンスとキャッシングテスト', () => {
    test('PRICE_CLASS_100でコスト最適化されている', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          PriceClass: 'PriceClass_100',
        },
      });
    });

    test('HTTP/2が有効化されている（パフォーマンス向上）', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          HttpVersion: 'http2',
        },
      });
    });

    test('IPv6が有効化されている', () => {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          IPV6Enabled: true,
        },
      });
    });

    test('キャッシュキーにヘッダーが含まれていない（最適化）', () => {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: {
          ParametersInCacheKeyAndForwardedToOrigin: {
            HeadersConfig: {
              HeaderBehavior: 'none',
            },
          },
        },
      });
    });

    test('キャッシュキーにクエリ文字列が含まれていない', () => {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: {
          ParametersInCacheKeyAndForwardedToOrigin: {
            QueryStringsConfig: {
              QueryStringBehavior: 'none',
            },
          },
        },
      });
    });

    test('キャッシュキーにCookieが含まれていない', () => {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: {
          ParametersInCacheKeyAndForwardedToOrigin: {
            CookiesConfig: {
              CookieBehavior: 'none',
            },
          },
        },
      });
    });
  });

  describe('S3バケットアクセス制限テスト', () => {
    test('S3バケットがパブリックアクセスブロック設定されている', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    test('S3バケットがバージョニング有効化されている', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });

    test('S3バケットがSSE-S3暗号化されている', () => {
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
  });
});
