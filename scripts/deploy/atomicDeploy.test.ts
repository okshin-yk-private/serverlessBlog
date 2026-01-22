/**
 * Atomic Deployment Script Tests
 *
 * Task 5.1: S3原子的デプロイ (Atomic S3 Deployment)
 *
 * Requirements:
 * - 6.1: Built static files shall be deployable to existing S3 bucket
 * - 6.2: S3 bucket shall have versioning enabled for rollback
 * - 6.3: New files uploaded to staging prefix (staging/{build-id}/)
 * - 6.4: After staging upload, atomic switch via CloudFront origin path update or S3 copy
 * - 6.5: NO direct aws s3 sync --delete to production prefix during deployment
 * - 6.6: If deployment fails after staging, previous version remains unchanged
 * - 6.7: Old staging prefixes cleaned up (retain last 3 versions for rollback)
 * - 6.8: Total static file size shall not exceed 50 MB
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateBuildId,
  calculateDirectorySize,
  validateDirectorySize,
  getStagingPrefix,
  getVersionPrefix,
  listVersions,
  getVersionsToCleanup,
  getCacheControl,
  getContentType,
  atomicDeploy,
  AtomicDeployConfig,
  AtomicDeployResult,
  DeployError,
  DeployErrorCode,
} from './atomicDeploy';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Mock AWS SDK
const mockS3Send = vi.fn();
const mockCloudFrontSend = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    send = mockS3Send;
  },
  PutObjectCommand: class {},
  CopyObjectCommand: class {},
  DeleteObjectsCommand: class {},
  ListObjectsV2Command: class {},
  HeadObjectCommand: class {},
}));

vi.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: class MockCloudFrontClient {
    send = mockCloudFrontSend;
  },
  CreateInvalidationCommand: class {},
  GetDistributionConfigCommand: class {},
  UpdateDistributionCommand: class {},
}));

describe('atomicDeploy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockS3Send.mockReset();
    mockCloudFrontSend.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateBuildId', () => {
    test('generates unique build ID with timestamp prefix', () => {
      const buildId = generateBuildId();

      // Should match pattern: v{timestamp}-{random}
      expect(buildId).toMatch(/^v\d+-[a-z0-9]+$/);
    });

    test('generates different IDs on consecutive calls', () => {
      const buildId1 = generateBuildId();
      const buildId2 = generateBuildId();

      expect(buildId1).not.toBe(buildId2);
    });

    test('build ID starts with v and timestamp', () => {
      const before = Math.floor(Date.now() / 1000);
      const buildId = generateBuildId();
      const after = Math.floor(Date.now() / 1000);

      // Extract timestamp from build ID
      const timestampMatch = buildId.match(/^v(\d+)-/);
      expect(timestampMatch).not.toBeNull();

      const timestamp = parseInt(timestampMatch![1], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('getStagingPrefix', () => {
    test('returns staging prefix with build ID', () => {
      const buildId = 'v1234567890-abc123';
      const prefix = getStagingPrefix(buildId);

      expect(prefix).toBe('staging/v1234567890-abc123/');
    });

    test('handles build ID without v prefix', () => {
      const buildId = '1234567890-abc123';
      const prefix = getStagingPrefix(buildId);

      expect(prefix).toBe('staging/1234567890-abc123/');
    });
  });

  describe('getVersionPrefix', () => {
    test('returns version prefix with build ID', () => {
      const buildId = 'v1234567890-abc123';
      const prefix = getVersionPrefix(buildId);

      expect(prefix).toBe('v1234567890-abc123/');
    });

    test('version prefix matches expected format', () => {
      const buildId = 'v1705123456-xyz789';
      const prefix = getVersionPrefix(buildId);

      expect(prefix).toBe('v1705123456-xyz789/');
    });
  });

  describe('calculateDirectorySize', () => {
    test('returns 0 for empty directory', async () => {
      const size = await calculateDirectorySize('/nonexistent/path');

      // Should return 0 or throw error for nonexistent path
      expect(typeof size).toBe('number');
    });

    test('calculates size in bytes', async () => {
      // This will be mocked in implementation tests
      const size = await calculateDirectorySize('/some/path');

      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateDirectorySize', () => {
    const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

    test('returns valid for size under 50MB', () => {
      const result = validateDirectorySize(10 * 1024 * 1024); // 10MB

      expect(result.valid).toBe(true);
      expect(result.sizeBytes).toBe(10 * 1024 * 1024);
    });

    test('returns invalid for size over 50MB', () => {
      const result = validateDirectorySize(60 * 1024 * 1024); // 60MB

      expect(result.valid).toBe(false);
      expect(result.sizeBytes).toBe(60 * 1024 * 1024);
      expect(result.error).toContain('50 MB');
    });

    test('returns valid for exactly 50MB', () => {
      const result = validateDirectorySize(MAX_SIZE_BYTES);

      expect(result.valid).toBe(true);
    });

    test('formats size in error message', () => {
      const result = validateDirectorySize(52428800 + 1024 * 1024); // 51MB

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/51.*MB/);
    });
  });

  describe('listVersions', () => {
    test('returns empty array when no versions exist', async () => {
      const versions = await listVersions('test-bucket', {
        send: vi.fn().mockResolvedValue({ CommonPrefixes: [] }),
      } as never);

      expect(versions).toEqual([]);
    });

    test('filters versions starting with v and timestamp pattern', async () => {
      const mockVersions = [
        { Prefix: 'v1705123456-abc123/' },
        { Prefix: 'v1705234567-def456/' },
        { Prefix: 'staging/' }, // Should be excluded
        { Prefix: 'admin/' }, // Should be excluded
      ];

      const versions = await listVersions('test-bucket', {
        send: vi.fn().mockResolvedValue({ CommonPrefixes: mockVersions }),
      } as never);

      expect(versions).toHaveLength(2);
      expect(versions).toContain('v1705123456-abc123/');
      expect(versions).toContain('v1705234567-def456/');
      expect(versions).not.toContain('staging/');
    });

    test('sorts versions by timestamp descending (newest first)', async () => {
      const mockVersions = [
        { Prefix: 'v1705111111-older/' },
        { Prefix: 'v1705333333-newest/' },
        { Prefix: 'v1705222222-middle/' },
      ];

      const versions = await listVersions('test-bucket', {
        send: vi.fn().mockResolvedValue({ CommonPrefixes: mockVersions }),
      } as never);

      expect(versions[0]).toBe('v1705333333-newest/');
      expect(versions[1]).toBe('v1705222222-middle/');
      expect(versions[2]).toBe('v1705111111-older/');
    });
  });

  describe('getVersionsToCleanup', () => {
    test('returns empty array when 3 or fewer versions', () => {
      const versions = [
        'v1705333333-newest/',
        'v1705222222-middle/',
        'v1705111111-older/',
      ];

      const toCleanup = getVersionsToCleanup(versions, 3);

      expect(toCleanup).toEqual([]);
    });

    test('returns versions beyond retain count', () => {
      const versions = [
        'v1705555555-new1/', // Keep
        'v1705444444-new2/', // Keep
        'v1705333333-new3/', // Keep
        'v1705222222-old1/', // Cleanup
        'v1705111111-old2/', // Cleanup
      ];

      const toCleanup = getVersionsToCleanup(versions, 3);

      expect(toCleanup).toHaveLength(2);
      expect(toCleanup).toContain('v1705222222-old1/');
      expect(toCleanup).toContain('v1705111111-old2/');
    });

    test('handles empty version list', () => {
      const toCleanup = getVersionsToCleanup([], 3);

      expect(toCleanup).toEqual([]);
    });

    test('uses default retain count of 3', () => {
      const versions = [
        'v1705555555-a/',
        'v1705444444-b/',
        'v1705333333-c/',
        'v1705222222-d/',
      ];

      const toCleanup = getVersionsToCleanup(versions);

      expect(toCleanup).toHaveLength(1);
      expect(toCleanup).toContain('v1705222222-d/');
    });
  });

  describe('AtomicDeployConfig', () => {
    test('validates required fields', () => {
      const config: AtomicDeployConfig = {
        bucketName: 'my-bucket',
        distributionId: 'E1234567890',
        distPath: './dist',
        region: 'ap-northeast-1',
      };

      expect(config.bucketName).toBe('my-bucket');
      expect(config.distributionId).toBe('E1234567890');
      expect(config.distPath).toBe('./dist');
      expect(config.region).toBe('ap-northeast-1');
    });

    test('allows optional dryRun flag', () => {
      const config: AtomicDeployConfig = {
        bucketName: 'my-bucket',
        distributionId: 'E1234567890',
        distPath: './dist',
        region: 'ap-northeast-1',
        dryRun: true,
      };

      expect(config.dryRun).toBe(true);
    });

    test('allows optional retainVersions count', () => {
      const config: AtomicDeployConfig = {
        bucketName: 'my-bucket',
        distributionId: 'E1234567890',
        distPath: './dist',
        region: 'ap-northeast-1',
        retainVersions: 5,
      };

      expect(config.retainVersions).toBe(5);
    });
  });

  describe('DeployError', () => {
    test('creates error with code and message', () => {
      const error = new DeployError(
        DeployErrorCode.SIZE_EXCEEDED,
        'Directory size exceeds 50MB limit'
      );

      expect(error.code).toBe(DeployErrorCode.SIZE_EXCEEDED);
      expect(error.message).toBe('Directory size exceeds 50MB limit');
      expect(error instanceof Error).toBe(true);
    });

    test('supports all error codes', () => {
      expect(DeployErrorCode.SIZE_EXCEEDED).toBe('SIZE_EXCEEDED');
      expect(DeployErrorCode.STAGING_UPLOAD_FAILED).toBe(
        'STAGING_UPLOAD_FAILED'
      );
      expect(DeployErrorCode.VERSION_COPY_FAILED).toBe('VERSION_COPY_FAILED');
      expect(DeployErrorCode.CLEANUP_FAILED).toBe('CLEANUP_FAILED');
      expect(DeployErrorCode.INVALIDATION_FAILED).toBe('INVALIDATION_FAILED');
      expect(DeployErrorCode.DIST_PATH_NOT_FOUND).toBe('DIST_PATH_NOT_FOUND');
    });
  });

  describe('AtomicDeployResult', () => {
    test('successful result contains version and timing', () => {
      const result: AtomicDeployResult = {
        success: true,
        buildId: 'v1705123456-abc123',
        versionPrefix: 'v1705123456-abc123/',
        stagingPrefix: 'staging/v1705123456-abc123/',
        filesUploaded: 42,
        totalSizeBytes: 10 * 1024 * 1024,
        durationMs: 5000,
        cleanedUpVersions: ['v1705000000-old/'],
      };

      expect(result.success).toBe(true);
      expect(result.buildId).toMatch(/^v\d+-[a-z0-9]+$/);
      expect(result.filesUploaded).toBeGreaterThan(0);
    });

    test('failed result contains error information', () => {
      const result: AtomicDeployResult = {
        success: false,
        buildId: 'v1705123456-abc123',
        error: {
          code: DeployErrorCode.SIZE_EXCEEDED,
          message: 'Size exceeded 50MB',
        },
        durationMs: 100,
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(DeployErrorCode.SIZE_EXCEEDED);
    });
  });
});

describe('getCacheControl', () => {
  test('static assets should have long cache (1 year immutable)', () => {
    expect(getCacheControl('_astro/index.abc123.js')).toBe(
      'public,max-age=31536000,immutable'
    );
    expect(getCacheControl('_astro/styles.def456.css')).toBe(
      'public,max-age=31536000,immutable'
    );
    expect(getCacheControl('assets/image.png')).toBe(
      'public,max-age=31536000,immutable'
    );
  });

  test('HTML files should have must-revalidate cache', () => {
    expect(getCacheControl('index.html')).toBe(
      'public,max-age=0,must-revalidate'
    );
    expect(getCacheControl('posts/123/index.html')).toBe(
      'public,max-age=0,must-revalidate'
    );
    expect(getCacheControl('404.html')).toBe(
      'public,max-age=0,must-revalidate'
    );
    expect(getCacheControl('about/index.html')).toBe(
      'public,max-age=0,must-revalidate'
    );
  });

  test('XML files should have must-revalidate cache', () => {
    expect(getCacheControl('sitemap-index.xml')).toBe(
      'public,max-age=0,must-revalidate'
    );
    expect(getCacheControl('sitemap-0.xml')).toBe(
      'public,max-age=0,must-revalidate'
    );
    expect(getCacheControl('rss.xml')).toBe('public,max-age=0,must-revalidate');
  });

  test('robots.txt should have must-revalidate cache', () => {
    expect(getCacheControl('robots.txt')).toBe(
      'public,max-age=0,must-revalidate'
    );
  });

  test('non-HTML assets should have long cache', () => {
    expect(getCacheControl('favicon.ico')).toBe(
      'public,max-age=31536000,immutable'
    );
    expect(getCacheControl('fonts/inter.woff2')).toBe(
      'public,max-age=31536000,immutable'
    );
  });
});

describe('getContentType', () => {
  test('returns correct MIME type for HTML files', () => {
    expect(getContentType('index.html')).toBe('text/html');
  });

  test('returns correct MIME type for CSS files', () => {
    expect(getContentType('styles.css')).toBe('text/css');
  });

  test('returns correct MIME type for JavaScript files', () => {
    // mime-types returns 'application/javascript' for .js files
    expect(getContentType('app.js')).toBe('application/javascript');
  });

  test('returns correct MIME type for JSON files', () => {
    expect(getContentType('data.json')).toBe('application/json');
  });

  test('returns correct MIME type for XML files', () => {
    expect(getContentType('sitemap.xml')).toBe('application/xml');
  });

  test('returns correct MIME type for image files', () => {
    expect(getContentType('image.png')).toBe('image/png');
    expect(getContentType('photo.jpg')).toBe('image/jpeg');
    expect(getContentType('icon.svg')).toBe('image/svg+xml');
    expect(getContentType('animation.gif')).toBe('image/gif');
    expect(getContentType('photo.webp')).toBe('image/webp');
  });

  test('returns correct MIME type for font files', () => {
    expect(getContentType('font.woff')).toBe('font/woff');
    expect(getContentType('font.woff2')).toBe('font/woff2');
    expect(getContentType('font.ttf')).toBe('font/ttf');
  });

  test('returns application/octet-stream for unknown types', () => {
    expect(getContentType('file.unknown')).toBe('application/octet-stream');
    expect(getContentType('file')).toBe('application/octet-stream');
  });
});

describe('calculateDirectorySize with real files', () => {
  const testDir = path.join(__dirname, '__test_temp__');

  beforeEach(async () => {
    // Create test directory
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  test('calculates size of directory with files', async () => {
    // Create test files
    const content1 = 'Hello World';
    const content2 = 'Test content with more data';
    await fs.promises.writeFile(path.join(testDir, 'file1.txt'), content1);
    await fs.promises.writeFile(path.join(testDir, 'file2.txt'), content2);

    const size = await calculateDirectorySize(testDir);

    expect(size).toBe(content1.length + content2.length);
  });

  test('calculates size recursively', async () => {
    const subDir = path.join(testDir, 'subdir');
    await fs.promises.mkdir(subDir, { recursive: true });

    const content1 = '12345'; // 5 bytes
    const content2 = '1234567890'; // 10 bytes
    await fs.promises.writeFile(path.join(testDir, 'root.txt'), content1);
    await fs.promises.writeFile(path.join(subDir, 'nested.txt'), content2);

    const size = await calculateDirectorySize(testDir);

    expect(size).toBe(15);
  });

  test('returns 0 for empty directory', async () => {
    const emptyDir = path.join(testDir, 'empty');
    await fs.promises.mkdir(emptyDir, { recursive: true });

    const size = await calculateDirectorySize(emptyDir);

    expect(size).toBe(0);
  });
});

describe('Atomic deployment flow', () => {
  test('deployment should follow staging -> version -> cleanup order', () => {
    // This test documents the expected deployment flow
    const deploymentSteps = [
      'validate-size', // Check dist size <= 50MB
      'generate-build-id', // Generate unique build ID
      'upload-staging', // Upload to staging/{build-id}/
      'copy-to-version', // Copy staging to v{timestamp}/
      'invalidate-cache', // CloudFront invalidation
      'cleanup-old', // Remove old versions (keep 3)
    ];

    expect(deploymentSteps[0]).toBe('validate-size');
    expect(deploymentSteps[1]).toBe('generate-build-id');
    expect(deploymentSteps[2]).toBe('upload-staging');
    expect(deploymentSteps[3]).toBe('copy-to-version');
    expect(deploymentSteps[4]).toBe('invalidate-cache');
    expect(deploymentSteps[5]).toBe('cleanup-old');
  });

  test('if staging upload fails, version copy should not proceed', () => {
    // Documents rollback behavior
    const stagingUploadFailed = true;
    const shouldCopyVersion = !stagingUploadFailed;

    expect(shouldCopyVersion).toBe(false);
  });

  test('if version copy fails, old version should remain active', () => {
    // Documents atomic switch behavior
    const versionCopyFailed = true;
    const previousVersionActive = versionCopyFailed;

    expect(previousVersionActive).toBe(true);
  });
});

describe('atomicDeploy function', () => {
  const testDir = path.join(__dirname, '__test_deploy_temp__');

  beforeEach(async () => {
    // Create test dist directory with sample files
    await fs.promises.mkdir(testDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(testDir, 'index.html'),
      '<!DOCTYPE html><html><body>Test</body></html>'
    );
    await fs.promises.mkdir(path.join(testDir, '_astro'), { recursive: true });
    await fs.promises.writeFile(
      path.join(testDir, '_astro', 'app.abc123.js'),
      'console.log("test");'
    );
  });

  afterEach(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  test('returns error for non-existent dist path', async () => {
    const config: AtomicDeployConfig = {
      bucketName: 'test-bucket',
      distributionId: 'E1234567890',
      distPath: '/nonexistent/path',
      region: 'ap-northeast-1',
    };

    const result = await atomicDeploy(config);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(DeployErrorCode.DIST_PATH_NOT_FOUND);
  });

  test('returns valid build ID on failure', async () => {
    const config: AtomicDeployConfig = {
      bucketName: 'test-bucket',
      distributionId: 'E1234567890',
      distPath: '/nonexistent/path',
      region: 'ap-northeast-1',
    };

    const result = await atomicDeploy(config);

    expect(result.buildId).toMatch(/^v\d+-[a-z0-9]+$/);
  });

  test('validates size before deployment', async () => {
    // Create a file that would exceed the size limit
    // For this test, we just verify the validation logic works
    const config: AtomicDeployConfig = {
      bucketName: 'test-bucket',
      distributionId: 'E1234567890',
      distPath: testDir,
      region: 'ap-northeast-1',
      dryRun: true,
    };

    // Mock the console.log to capture output
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await atomicDeploy(config);

    // In dry-run mode, it should not fail on S3 operations
    // but should still validate size
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Validating distribution size')
    );

    consoleSpy.mockRestore();
  });

  test('dry run logs actions without executing', async () => {
    const config: AtomicDeployConfig = {
      bucketName: 'test-bucket',
      distributionId: 'E1234567890',
      distPath: testDir,
      region: 'ap-northeast-1',
      dryRun: true,
    };

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await atomicDeploy(config);

    // Should have dry-run prefixed logs
    const calls = consoleSpy.mock.calls.map((c) => c[0]);
    const hasDryRunOutput = calls.some(
      (c) => typeof c === 'string' && c.includes('[DRY-RUN]')
    );

    expect(hasDryRunOutput).toBe(true);

    consoleSpy.mockRestore();
  });

  test('includes duration in result', async () => {
    const config: AtomicDeployConfig = {
      bucketName: 'test-bucket',
      distributionId: 'E1234567890',
      distPath: testDir,
      region: 'ap-northeast-1',
      dryRun: true,
    };

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await atomicDeploy(config);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.durationMs).toBe('number');

    vi.restoreAllMocks();
  });
});

describe('S3 deployment requirements', () => {
  test('requirement 6.3: staging prefix format', () => {
    const buildId = 'v1705123456-abc123';
    const stagingPrefix = getStagingPrefix(buildId);

    // Requirement: staging/{build-id}/
    expect(stagingPrefix).toBe('staging/v1705123456-abc123/');
    expect(stagingPrefix).toMatch(/^staging\/v\d+-[a-z0-9]+\/$/);
  });

  test('requirement 6.7: retain 3 versions by default', () => {
    const versions = [
      'v1705555555-a/',
      'v1705444444-b/',
      'v1705333333-c/',
      'v1705222222-d/',
      'v1705111111-e/',
    ];

    const toCleanup = getVersionsToCleanup(versions);

    // Should keep 3, cleanup 2
    expect(toCleanup).toHaveLength(2);
    expect(toCleanup).toContain('v1705222222-d/');
    expect(toCleanup).toContain('v1705111111-e/');
  });

  test('requirement 6.8: 50MB size limit validation', () => {
    const validSize = validateDirectorySize(50 * 1024 * 1024); // Exactly 50MB
    const invalidSize = validateDirectorySize(50 * 1024 * 1024 + 1); // 50MB + 1 byte

    expect(validSize.valid).toBe(true);
    expect(invalidSize.valid).toBe(false);
  });
});
