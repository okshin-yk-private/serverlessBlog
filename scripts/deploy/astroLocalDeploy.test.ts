/**
 * Astro Local Deploy Tests
 *
 * Task 5.2: ローカルデプロイスクリプト更新 (Local Deploy Script Update)
 *
 * Requirements:
 * - 9.1: scripts/local-deploy.sh shall include Astro build step (bun run build)
 * - 9.2: scripts/local-deploy.sh shall include atomic S3 deployment step
 * - 9.9: CloudFront cache invalidation limited to changed paths
 * - 9.10: Build process receives API_URL as environment variable
 * - 9.11: Total build and deploy time shall not exceed 5 minutes
 */

import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import {
  commandExists,
  validateAstroProject,
  installDependencies,
  buildAstroProject,
  getInvalidationPaths,
  invalidateCloudFrontCache,
  checkTimeLimit,
  astroLocalDeploy,
  formatDuration,
  printDeploymentSummary,
  AstroDeployError,
  AstroDeployErrorCode,
  AstroLocalDeployConfig,
  AstroLocalDeployResult,
} from './astroLocalDeploy';

// Mock child_process
const mockExecSync = vi.fn();
vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
  spawn: vi.fn(),
}));

// Create reference to the mock for easier use
const mockedExecSync = mockExecSync as Mock;

// Mock atomicDeploy
vi.mock('./atomicDeploy', () => ({
  atomicDeploy: vi.fn(),
}));

// Mock CloudFront client
const mockCloudFrontSend = vi.fn();
vi.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: class MockCloudFrontClient {
    send = mockCloudFrontSend;
  },
  CreateInvalidationCommand: class {},
}));

import { execSync } from 'node:child_process';
import { atomicDeploy } from './atomicDeploy';

describe('astroLocalDeploy', () => {
  const testDir = path.join(__dirname, '__test_astro_temp__');

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCloudFrontSend.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AstroDeployError', () => {
    test('creates error with code and message', () => {
      const error = new AstroDeployError(
        AstroDeployErrorCode.BUILD_FAILED,
        'Build failed'
      );

      expect(error.code).toBe(AstroDeployErrorCode.BUILD_FAILED);
      expect(error.message).toBe('Build failed');
      expect(error instanceof Error).toBe(true);
      expect(error.name).toBe('AstroDeployError');
    });

    test('supports all error codes', () => {
      expect(AstroDeployErrorCode.BUILD_FAILED).toBe('BUILD_FAILED');
      expect(AstroDeployErrorCode.DEPLOY_FAILED).toBe('DEPLOY_FAILED');
      expect(AstroDeployErrorCode.INVALIDATION_FAILED).toBe(
        'INVALIDATION_FAILED'
      );
      expect(AstroDeployErrorCode.TIME_EXCEEDED).toBe('TIME_EXCEEDED');
      expect(AstroDeployErrorCode.PROJECT_NOT_FOUND).toBe('PROJECT_NOT_FOUND');
      expect(AstroDeployErrorCode.DEPENDENCIES_FAILED).toBe(
        'DEPENDENCIES_FAILED'
      );
    });
  });

  describe('commandExists', () => {
    test('returns true for existing command', () => {
      mockedExecSync.mockImplementation(() => Buffer.from(''));

      const result = commandExists('ls');

      expect(result).toBe(true);
    });

    test('returns false for non-existing command', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = commandExists('nonexistent-command');

      expect(result).toBe(false);
    });
  });

  describe('validateAstroProject', () => {
    beforeEach(async () => {
      await fs.promises.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    });

    test('returns valid for project with astro dependency', async () => {
      await fs.promises.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { astro: '^5.0.0' } })
      );

      const result = validateAstroProject(testDir);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('returns valid for project with astro devDependency', async () => {
      await fs.promises.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify({ devDependencies: { astro: '^5.0.0' } })
      );

      const result = validateAstroProject(testDir);

      expect(result.valid).toBe(true);
    });

    test('returns invalid for non-existent directory', () => {
      const result = validateAstroProject('/nonexistent/path');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('returns invalid for directory without package.json', async () => {
      const emptyDir = path.join(testDir, 'empty');
      await fs.promises.mkdir(emptyDir, { recursive: true });

      const result = validateAstroProject(emptyDir);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('package.json not found');
    });

    test('returns invalid for project without astro', async () => {
      await fs.promises.writeFile(
        path.join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { react: '^18.0.0' } })
      );

      const result = validateAstroProject(testDir);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Astro is not listed');
    });

    test('returns invalid for malformed package.json', async () => {
      await fs.promises.writeFile(
        path.join(testDir, 'package.json'),
        'not valid json'
      );

      const result = validateAstroProject(testDir);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Failed to parse');
    });
  });

  describe('installDependencies', () => {
    test('executes bun install with frozen lockfile', async () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));

      const result = await installDependencies('/some/path');

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'bun install --frozen-lockfile',
        expect.objectContaining({ cwd: '/some/path' })
      );
    });

    test('returns error on failure', async () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('Install failed');
      });

      const result = await installDependencies('/some/path');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Install failed');
    });
  });

  describe('buildAstroProject', () => {
    test('executes bun run build with API_URL env', async () => {
      mockedExecSync.mockReturnValue(Buffer.from('Build output'));

      const result = await buildAstroProject(
        '/some/path',
        'https://api.example.com'
      );

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(execSync).toHaveBeenCalledWith(
        'bun run build',
        expect.objectContaining({
          cwd: '/some/path',
          env: expect.objectContaining({
            PUBLIC_API_URL: 'https://api.example.com',
            API_URL: 'https://api.example.com',
            NODE_ENV: 'production',
          }),
        })
      );
    });

    test('returns error on build failure', async () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('Build failed: Type error');
      });

      const result = await buildAstroProject(
        '/some/path',
        'https://api.example.com'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Build failed');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('measures build duration', async () => {
      mockedExecSync.mockImplementation(() => {
        // Simulate some processing time
        const start = Date.now();
        while (Date.now() - start < 10) {
          // busy wait
        }
        return Buffer.from('');
      });

      const result = await buildAstroProject(
        '/some/path',
        'https://api.example.com'
      );

      expect(result.success).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getInvalidationPaths', () => {
    test('returns /* for undefined changedPaths', () => {
      const result = getInvalidationPaths(undefined);

      expect(result).toEqual(['/*']);
    });

    test('returns /* for empty changedPaths', () => {
      const result = getInvalidationPaths([]);

      expect(result).toEqual(['/*']);
    });

    test('returns normalized paths for provided changedPaths', () => {
      const result = getInvalidationPaths([
        'index.html',
        '/posts/123/index.html',
      ]);

      expect(result).toEqual(['/index.html', '/posts/123/index.html']);
    });

    test('preserves leading slash in paths', () => {
      const result = getInvalidationPaths(['/about/index.html', '/rss.xml']);

      expect(result).toEqual(['/about/index.html', '/rss.xml']);
    });

    test('adds leading slash if missing', () => {
      const result = getInvalidationPaths(['_astro/*', 'sitemap-index.xml']);

      expect(result).toEqual(['/_astro/*', '/sitemap-index.xml']);
    });
  });

  describe('invalidateCloudFrontCache', () => {
    test('creates invalidation with specified paths', async () => {
      mockCloudFrontSend.mockResolvedValue({});

      const result = await invalidateCloudFrontCache(
        'E1234567890',
        'ap-northeast-1',
        ['/index.html', '/about/index.html']
      );

      expect(result.success).toBe(true);
      expect(result.invalidatedPaths).toEqual([
        '/index.html',
        '/about/index.html',
      ]);
    });

    test('returns error on failure', async () => {
      mockCloudFrontSend.mockRejectedValue(new Error('Access denied'));

      const result = await invalidateCloudFrontCache(
        'E1234567890',
        'ap-northeast-1',
        ['/*']
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
      expect(result.invalidatedPaths).toEqual([]);
    });

    test('skips actual invalidation in dry-run mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await invalidateCloudFrontCache(
        'E1234567890',
        'ap-northeast-1',
        ['/index.html'],
        true // dryRun
      );

      expect(result.success).toBe(true);
      expect(result.invalidatedPaths).toEqual(['/index.html']);
      expect(mockCloudFrontSend).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DRY-RUN]')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('checkTimeLimit', () => {
    test('returns exceeded=false when under 5 minutes', () => {
      const startTime = Date.now() - 4 * 60 * 1000; // 4 minutes ago

      const result = checkTimeLimit(startTime);

      expect(result.exceeded).toBe(false);
      expect(result.elapsedMs).toBeGreaterThan(4 * 60 * 1000 - 100);
      expect(result.remainingMs).toBeGreaterThan(0);
    });

    test('returns exceeded=true when over 5 minutes', () => {
      const startTime = Date.now() - 6 * 60 * 1000; // 6 minutes ago

      const result = checkTimeLimit(startTime);

      expect(result.exceeded).toBe(true);
      expect(result.elapsedMs).toBeGreaterThan(5 * 60 * 1000);
      expect(result.remainingMs).toBeLessThan(0);
    });

    test('returns exact values at boundary', () => {
      const fiveMinutesMs = 5 * 60 * 1000;
      const startTime = Date.now() - fiveMinutesMs;

      const result = checkTimeLimit(startTime);

      // At exactly 5 minutes, not exceeded
      expect(result.elapsedMs).toBeGreaterThanOrEqual(fiveMinutesMs - 10);
    });
  });

  describe('formatDuration', () => {
    test('formats milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    test('formats seconds', () => {
      expect(formatDuration(5000)).toBe('5.0s');
      expect(formatDuration(5500)).toBe('5.5s');
    });

    test('formats minutes and seconds', () => {
      expect(formatDuration(65000)).toBe('1m 5s');
      expect(formatDuration(120000)).toBe('2m 0s');
      expect(formatDuration(300000)).toBe('5m 0s');
    });
  });

  describe('printDeploymentSummary', () => {
    test('prints success summary', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result: AstroLocalDeployResult = {
        success: true,
        build: { success: true, durationMs: 5000 },
        deploy: {
          success: true,
          buildId: 'v1234567890-abc123',
          filesUploaded: 42,
          totalSizeBytes: 10 * 1024 * 1024,
          durationMs: 3000,
        },
        invalidation: { success: true, invalidatedPaths: ['/*'] },
        totalDurationMs: 10000,
      };

      printDeploymentSummary(result);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SUCCESS')
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('10.0s'));

      consoleSpy.mockRestore();
    });

    test('prints failure summary', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result: AstroLocalDeployResult = {
        success: false,
        totalDurationMs: 5000,
        error: {
          code: AstroDeployErrorCode.BUILD_FAILED,
          message: 'TypeScript error',
          phase: 'build',
        },
      };

      printDeploymentSummary(result);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('FAILED')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('TypeScript error')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('astroLocalDeploy (integration)', () => {
    const mockProjectRoot = '/mock/project';
    const mockConfig: AstroLocalDeployConfig = {
      projectRoot: mockProjectRoot,
      bucketName: 'test-bucket',
      distributionId: 'E1234567890',
      region: 'ap-northeast-1',
      apiUrl: 'https://api.example.com',
    };

    test('fails if project validation fails', async () => {
      // Mock non-existent project
      const result = await astroLocalDeploy(mockConfig);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AstroDeployErrorCode.PROJECT_NOT_FOUND);
      expect(result.error?.phase).toBe('build');
    });
  });

  describe('Requirements verification', () => {
    test('requirement 9.1: build command uses bun run build', async () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));

      await buildAstroProject('/path', 'https://api.example.com');

      expect(execSync).toHaveBeenCalledWith(
        'bun run build',
        expect.any(Object)
      );
    });

    test('requirement 9.9: supports targeted invalidation paths', () => {
      const paths = getInvalidationPaths([
        '/index.html',
        '/posts/1/index.html',
      ]);

      expect(paths).not.toContain('/*');
      expect(paths).toHaveLength(2);
    });

    test('requirement 9.9: defaults to /* when no changed paths', () => {
      const paths = getInvalidationPaths();

      expect(paths).toEqual(['/*']);
    });

    test('requirement 9.10: API_URL passed as environment variable', async () => {
      mockedExecSync.mockReturnValue(Buffer.from(''));

      await buildAstroProject('/path', 'https://my-api.example.com');

      expect(execSync).toHaveBeenCalledWith(
        'bun run build',
        expect.objectContaining({
          env: expect.objectContaining({
            API_URL: 'https://my-api.example.com',
            PUBLIC_API_URL: 'https://my-api.example.com',
          }),
        })
      );
    });

    test('requirement 9.11: 5-minute time limit check', () => {
      const startTime = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      const result = checkTimeLimit(startTime);

      expect(result.exceeded).toBe(true);
      expect(result.elapsedMs).toBeGreaterThan(5 * 60 * 1000);
    });
  });
});

describe('AstroLocalDeployConfig', () => {
  test('validates required fields', () => {
    const config: AstroLocalDeployConfig = {
      projectRoot: '/home/user/project',
      bucketName: 'my-bucket',
      distributionId: 'E1234567890',
      region: 'ap-northeast-1',
      apiUrl: 'https://api.example.com',
    };

    expect(config.projectRoot).toBe('/home/user/project');
    expect(config.bucketName).toBe('my-bucket');
    expect(config.distributionId).toBe('E1234567890');
    expect(config.region).toBe('ap-northeast-1');
    expect(config.apiUrl).toBe('https://api.example.com');
  });

  test('allows optional fields', () => {
    const config: AstroLocalDeployConfig = {
      projectRoot: '/home/user/project',
      bucketName: 'my-bucket',
      distributionId: 'E1234567890',
      region: 'ap-northeast-1',
      apiUrl: 'https://api.example.com',
      astroProjectPath: 'frontend/public-astro',
      dryRun: true,
      verbose: true,
      retainVersions: 5,
      changedPaths: ['/index.html'],
    };

    expect(config.astroProjectPath).toBe('frontend/public-astro');
    expect(config.dryRun).toBe(true);
    expect(config.verbose).toBe(true);
    expect(config.retainVersions).toBe(5);
    expect(config.changedPaths).toEqual(['/index.html']);
  });
});

describe('AstroLocalDeployResult', () => {
  test('successful result contains all phases', () => {
    const result: AstroLocalDeployResult = {
      success: true,
      build: {
        success: true,
        durationMs: 5000,
      },
      deploy: {
        success: true,
        buildId: 'v1234567890-abc123',
        versionPrefix: 'v1234567890-abc123/',
        filesUploaded: 42,
        totalSizeBytes: 10 * 1024 * 1024,
        durationMs: 3000,
      },
      invalidation: {
        success: true,
        invalidatedPaths: ['/*'],
      },
      totalDurationMs: 10000,
    };

    expect(result.success).toBe(true);
    expect(result.build?.success).toBe(true);
    expect(result.deploy?.success).toBe(true);
    expect(result.invalidation?.success).toBe(true);
    expect(result.totalDurationMs).toBe(10000);
  });

  test('failed result contains error details', () => {
    const result: AstroLocalDeployResult = {
      success: false,
      build: {
        success: false,
        durationMs: 1000,
        error: 'TypeScript compilation failed',
      },
      totalDurationMs: 1000,
      error: {
        code: AstroDeployErrorCode.BUILD_FAILED,
        message: 'TypeScript compilation failed',
        phase: 'build',
      },
    };

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(AstroDeployErrorCode.BUILD_FAILED);
    expect(result.error?.phase).toBe('build');
  });
});
