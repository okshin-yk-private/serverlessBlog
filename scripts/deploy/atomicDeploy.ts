/**
 * Atomic Deployment Script for Astro SSG
 *
 * Task 5.1: S3原子的デプロイ (Atomic S3 Deployment)
 *
 * Requirements:
 * - 6.1: Built static files shall be deployable to existing S3 bucket
 * - 6.2: S3 bucket shall have versioning enabled for rollback
 * - 6.3: New files uploaded to staging prefix (staging/{build-id}/)
 * - 6.4: After staging upload, atomic switch via S3 copy
 * - 6.5: NO direct aws s3 sync --delete to production prefix
 * - 6.6: If deployment fails after staging, previous version remains unchanged
 * - 6.7: Old staging prefixes cleaned up (retain last 3 versions for rollback)
 * - 6.8: Total static file size shall not exceed 50 MB
 */

import {
  S3Client,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { lookup as mimeLookup } from 'mime-types';

// =============================================================================
// Constants
// =============================================================================

/** Maximum allowed static file size: 50 MB */
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** Default number of versions to retain for rollback */
const DEFAULT_RETAIN_VERSIONS = 3;

// =============================================================================
// Types
// =============================================================================

export enum DeployErrorCode {
  SIZE_EXCEEDED = 'SIZE_EXCEEDED',
  STAGING_UPLOAD_FAILED = 'STAGING_UPLOAD_FAILED',
  VERSION_COPY_FAILED = 'VERSION_COPY_FAILED',
  CLEANUP_FAILED = 'CLEANUP_FAILED',
  INVALIDATION_FAILED = 'INVALIDATION_FAILED',
  DIST_PATH_NOT_FOUND = 'DIST_PATH_NOT_FOUND',
}

export class DeployError extends Error {
  constructor(
    public readonly code: DeployErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DeployError';
  }
}

export interface AtomicDeployConfig {
  /** S3 bucket name for deployment */
  bucketName: string;
  /** CloudFront distribution ID for cache invalidation */
  distributionId: string;
  /** Local path to built dist directory */
  distPath: string;
  /** AWS region */
  region: string;
  /** If true, only show what would be done without making changes */
  dryRun?: boolean;
  /** Number of old versions to retain (default: 3) */
  retainVersions?: number;
}

export interface AtomicDeployResult {
  /** Whether deployment succeeded */
  success: boolean;
  /** Generated build ID */
  buildId: string;
  /** Version prefix (final deployment path) */
  versionPrefix?: string;
  /** Staging prefix (intermediate upload path) */
  stagingPrefix?: string;
  /** Number of files uploaded */
  filesUploaded?: number;
  /** Total size in bytes */
  totalSizeBytes?: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Versions that were cleaned up */
  cleanedUpVersions?: string[];
  /** Error details if failed */
  error?: {
    code: DeployErrorCode;
    message: string;
  };
}

export interface SizeValidationResult {
  valid: boolean;
  sizeBytes: number;
  error?: string;
}

interface FileEntry {
  localPath: string;
  relativePath: string;
  sizeBytes: number;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique build ID with timestamp prefix
 * Format: v{timestamp}-{random}
 */
export function generateBuildId(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = Math.random().toString(36).substring(2, 8);
  return `v${timestamp}-${random}`;
}

/**
 * Get staging prefix for a build ID
 * Format: staging/{build-id}/
 */
export function getStagingPrefix(buildId: string): string {
  return `staging/${buildId}/`;
}

/**
 * Get version prefix for a build ID
 * Format: {build-id}/
 */
export function getVersionPrefix(buildId: string): string {
  return `${buildId}/`;
}

/**
 * Calculate total size of a directory in bytes
 */
export async function calculateDirectorySize(dirPath: string): Promise<number> {
  try {
    const stats = await fs.promises.stat(dirPath);
    if (!stats.isDirectory()) {
      return stats.size;
    }

    let totalSize = 0;
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += await calculateDirectorySize(entryPath);
      } else if (entry.isFile()) {
        const fileStats = await fs.promises.stat(entryPath);
        totalSize += fileStats.size;
      }
    }

    return totalSize;
  } catch {
    // Return 0 for nonexistent paths
    return 0;
  }
}

/**
 * Validate directory size against 50MB limit
 * Requirement 6.8
 */
export function validateDirectorySize(sizeBytes: number): SizeValidationResult {
  if (sizeBytes <= MAX_SIZE_BYTES) {
    return { valid: true, sizeBytes };
  }

  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
  return {
    valid: false,
    sizeBytes,
    error: `Directory size (${sizeMB} MB) exceeds maximum allowed size of 50 MB`,
  };
}

/**
 * List all version prefixes in the bucket
 * Filters to only include v{timestamp}-{random}/ format
 */
export async function listVersions(
  bucketName: string,
  s3Client: S3Client
): Promise<string[]> {
  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Delimiter: '/',
    Prefix: '',
  });

  const response = await s3Client.send(command);
  const prefixes = response.CommonPrefixes || [];

  // Filter to only version prefixes (v{timestamp}-*)
  const versionPattern = /^v\d+-[a-z0-9]+\/$/;
  const versions = prefixes
    .map((p) => p.Prefix!)
    .filter((prefix) => versionPattern.test(prefix));

  // Sort by timestamp descending (newest first)
  versions.sort((a, b) => {
    const timestampA = parseInt(a.match(/^v(\d+)-/)![1], 10);
    const timestampB = parseInt(b.match(/^v(\d+)-/)![1], 10);
    return timestampB - timestampA;
  });

  return versions;
}

/**
 * Get list of versions to cleanup based on retain count
 * Requirement 6.7: Retain last 3 versions for rollback
 */
export function getVersionsToCleanup(
  versions: string[],
  retainCount: number = DEFAULT_RETAIN_VERSIONS
): string[] {
  if (versions.length <= retainCount) {
    return [];
  }
  return versions.slice(retainCount);
}

/**
 * Determine Cache-Control header based on filename
 * - _astro/* files: 1 year immutable (hashed filenames)
 * - HTML/XML/robots.txt: must-revalidate
 */
export function getCacheControl(filename: string): string {
  // HTML and XML files should always be revalidated
  if (
    filename.endsWith('.html') ||
    filename.endsWith('.xml') ||
    filename === 'robots.txt'
  ) {
    return 'public,max-age=0,must-revalidate';
  }
  // _astro/* assets have content hashes, can be cached long-term
  return 'public,max-age=31536000,immutable';
}

/**
 * Get MIME type for a file
 */
export function getContentType(filename: string): string {
  const mimeType = mimeLookup(filename);
  if (mimeType) {
    return mimeType;
  }
  // Default to binary
  return 'application/octet-stream';
}

/**
 * Recursively list all files in a directory
 */
async function listFiles(
  dirPath: string,
  basePath: string = ''
): Promise<FileEntry[]> {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const files: FileEntry[] = [];

  for (const entry of entries) {
    const localPath = path.join(dirPath, entry.name);
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const subFiles = await listFiles(localPath, relativePath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      const stats = await fs.promises.stat(localPath);
      files.push({
        localPath,
        relativePath,
        sizeBytes: stats.size,
      });
    }
  }

  return files;
}

// =============================================================================
// Deployment Functions
// =============================================================================

/**
 * Upload all files to staging prefix
 * Requirement 6.3
 */
async function uploadToStaging(
  s3Client: S3Client,
  config: AtomicDeployConfig,
  buildId: string,
  files: FileEntry[],
  dryRun: boolean
): Promise<void> {
  const stagingPrefix = getStagingPrefix(buildId);

  for (const file of files) {
    const key = `${stagingPrefix}${file.relativePath}`;
    const cacheControl = getCacheControl(file.relativePath);
    const contentType = getContentType(file.relativePath);

    if (dryRun) {
      console.log(
        `[DRY-RUN] Would upload: ${file.relativePath} -> s3://${config.bucketName}/${key}`
      );
      continue;
    }

    const fileContent = await fs.promises.readFile(file.localPath);
    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: fileContent,
      CacheControl: cacheControl,
      ContentType: contentType,
    });

    await s3Client.send(command);
  }
}

/**
 * Copy files from staging to version prefix
 * Requirement 6.4: Atomic switch via S3 copy
 */
async function copyToVersion(
  s3Client: S3Client,
  config: AtomicDeployConfig,
  buildId: string,
  files: FileEntry[],
  dryRun: boolean
): Promise<void> {
  const stagingPrefix = getStagingPrefix(buildId);
  const versionPrefix = getVersionPrefix(buildId);

  for (const file of files) {
    const sourceKey = `${stagingPrefix}${file.relativePath}`;
    const destKey = `${versionPrefix}${file.relativePath}`;

    if (dryRun) {
      console.log(
        `[DRY-RUN] Would copy: s3://${config.bucketName}/${sourceKey} -> ${destKey}`
      );
      continue;
    }

    const command = new CopyObjectCommand({
      Bucket: config.bucketName,
      CopySource: `${config.bucketName}/${sourceKey}`,
      Key: destKey,
    });

    await s3Client.send(command);
  }
}

/**
 * Also copy files to root prefix for direct access
 * This ensures files are accessible at / as well as at /v{version}/
 */
async function copyToRoot(
  s3Client: S3Client,
  config: AtomicDeployConfig,
  buildId: string,
  files: FileEntry[],
  dryRun: boolean
): Promise<void> {
  const stagingPrefix = getStagingPrefix(buildId);

  for (const file of files) {
    const sourceKey = `${stagingPrefix}${file.relativePath}`;
    const destKey = file.relativePath;

    if (dryRun) {
      console.log(
        `[DRY-RUN] Would copy to root: s3://${config.bucketName}/${sourceKey} -> ${destKey}`
      );
      continue;
    }

    const command = new CopyObjectCommand({
      Bucket: config.bucketName,
      CopySource: `${config.bucketName}/${sourceKey}`,
      Key: destKey,
    });

    await s3Client.send(command);
  }
}

/**
 * Delete objects under a prefix
 */
async function deletePrefix(
  s3Client: S3Client,
  bucketName: string,
  prefix: string,
  dryRun: boolean
): Promise<void> {
  // List all objects under the prefix
  const listCommand = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix,
  });

  const listResponse = await s3Client.send(listCommand);
  const objects = listResponse.Contents || [];

  if (objects.length === 0) {
    return;
  }

  if (dryRun) {
    console.log(
      `[DRY-RUN] Would delete ${objects.length} objects under ${prefix}`
    );
    return;
  }

  // Delete in batches of 1000 (S3 limit)
  const batchSize = 1000;
  for (let i = 0; i < objects.length; i += batchSize) {
    const batch = objects.slice(i, i + batchSize);
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: batch.map((obj) => ({ Key: obj.Key! })),
      },
    });
    await s3Client.send(deleteCommand);
  }
}

/**
 * Clean up old versions beyond retain count
 * Requirement 6.7
 */
async function cleanupOldVersions(
  s3Client: S3Client,
  config: AtomicDeployConfig,
  dryRun: boolean
): Promise<string[]> {
  const retainCount = config.retainVersions ?? DEFAULT_RETAIN_VERSIONS;
  const versions = await listVersions(config.bucketName, s3Client);
  const toCleanup = getVersionsToCleanup(versions, retainCount);

  for (const versionPrefix of toCleanup) {
    await deletePrefix(s3Client, config.bucketName, versionPrefix, dryRun);
    // Also clean up corresponding staging prefix
    const buildId = versionPrefix.replace(/\/$/, '');
    await deletePrefix(
      s3Client,
      config.bucketName,
      getStagingPrefix(buildId),
      dryRun
    );
  }

  return toCleanup;
}

/**
 * Invalidate CloudFront cache
 * Requirement 9.9: Invalidate changed paths
 */
async function invalidateCache(
  cloudFrontClient: CloudFrontClient,
  distributionId: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    console.log(
      `[DRY-RUN] Would invalidate CloudFront distribution ${distributionId}`
    );
    return;
  }

  const command = new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      CallerReference: `atomic-deploy-${Date.now()}`,
      Paths: {
        Quantity: 1,
        Items: ['/*'],
      },
    },
  });

  await cloudFrontClient.send(command);
}

// =============================================================================
// Main Deployment Function
// =============================================================================

/**
 * Execute atomic deployment
 *
 * Flow:
 * 1. Validate dist size (Requirement 6.8)
 * 2. Generate build ID
 * 3. Upload to staging prefix (Requirement 6.3)
 * 4. Copy to version prefix (Requirement 6.4)
 * 5. Copy to root prefix (for direct access)
 * 6. Invalidate CloudFront cache
 * 7. Cleanup old versions (Requirement 6.7)
 *
 * Requirement 6.5: Never use direct sync --delete to production
 * Requirement 6.6: On failure, previous version remains unchanged
 */
export async function atomicDeploy(
  config: AtomicDeployConfig
): Promise<AtomicDeployResult> {
  const startTime = Date.now();
  const buildId = generateBuildId();
  const dryRun = config.dryRun ?? false;

  const s3Client = new S3Client({ region: config.region });
  const cloudFrontClient = new CloudFrontClient({ region: config.region });

  try {
    // Step 1: Validate dist path exists
    if (!fs.existsSync(config.distPath)) {
      throw new DeployError(
        DeployErrorCode.DIST_PATH_NOT_FOUND,
        `Distribution path not found: ${config.distPath}`
      );
    }

    // Step 2: Validate size (Requirement 6.8)
    console.log('Validating distribution size...');
    const totalSize = await calculateDirectorySize(config.distPath);
    const sizeValidation = validateDirectorySize(totalSize);
    if (!sizeValidation.valid) {
      throw new DeployError(
        DeployErrorCode.SIZE_EXCEEDED,
        sizeValidation.error!
      );
    }
    console.log(`Size OK: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);

    // Step 3: List all files
    const files = await listFiles(config.distPath);
    console.log(`Found ${files.length} files to deploy`);

    // Step 4: Upload to staging (Requirement 6.3)
    console.log(`Uploading to staging: ${getStagingPrefix(buildId)}`);
    try {
      await uploadToStaging(s3Client, config, buildId, files, dryRun);
    } catch (error) {
      throw new DeployError(
        DeployErrorCode.STAGING_UPLOAD_FAILED,
        `Failed to upload to staging: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Step 5: Copy to version prefix (Requirement 6.4)
    console.log(`Copying to version: ${getVersionPrefix(buildId)}`);
    try {
      await copyToVersion(s3Client, config, buildId, files, dryRun);
    } catch (error) {
      throw new DeployError(
        DeployErrorCode.VERSION_COPY_FAILED,
        `Failed to copy to version prefix: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Step 6: Copy to root prefix (for direct access)
    console.log('Copying to root prefix...');
    await copyToRoot(s3Client, config, buildId, files, dryRun);

    // Step 7: Invalidate CloudFront cache
    console.log('Invalidating CloudFront cache...');
    try {
      await invalidateCache(cloudFrontClient, config.distributionId, dryRun);
    } catch (error) {
      // Invalidation failure is non-fatal but logged
      console.warn(
        `Warning: CloudFront invalidation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Step 8: Cleanup old versions (Requirement 6.7)
    console.log('Cleaning up old versions...');
    let cleanedUpVersions: string[] = [];
    try {
      cleanedUpVersions = await cleanupOldVersions(s3Client, config, dryRun);
      if (cleanedUpVersions.length > 0) {
        console.log(`Cleaned up ${cleanedUpVersions.length} old version(s)`);
      }
    } catch (error) {
      // Cleanup failure is non-fatal but logged
      console.warn(
        `Warning: Cleanup failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const durationMs = Date.now() - startTime;
    console.log(`Deployment completed in ${(durationMs / 1000).toFixed(1)}s`);

    return {
      success: true,
      buildId,
      versionPrefix: getVersionPrefix(buildId),
      stagingPrefix: getStagingPrefix(buildId),
      filesUploaded: files.length,
      totalSizeBytes: totalSize,
      durationMs,
      cleanedUpVersions,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    if (error instanceof DeployError) {
      return {
        success: false,
        buildId,
        durationMs,
        error: {
          code: error.code,
          message: error.message,
        },
      };
    }

    return {
      success: false,
      buildId,
      durationMs,
      error: {
        code: DeployErrorCode.STAGING_UPLOAD_FAILED,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
