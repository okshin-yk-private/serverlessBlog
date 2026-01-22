/**
 * Astro Local Deploy Module
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

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  atomicDeploy,
  AtomicDeployConfig,
  AtomicDeployResult,
} from './atomicDeploy';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';

// =============================================================================
// Constants
// =============================================================================

/** Maximum allowed build + deploy time in milliseconds (5 minutes) */
const MAX_TOTAL_TIME_MS = 5 * 60 * 1000;

/** Default paths */
const DEFAULT_ASTRO_PROJECT_PATH = 'frontend/public-astro';
const _DEFAULT_DIST_PATH = 'frontend/public-astro/dist';

// =============================================================================
// Types
// =============================================================================

export enum AstroDeployErrorCode {
  BUILD_FAILED = 'BUILD_FAILED',
  DEPLOY_FAILED = 'DEPLOY_FAILED',
  INVALIDATION_FAILED = 'INVALIDATION_FAILED',
  TIME_EXCEEDED = 'TIME_EXCEEDED',
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  DEPENDENCIES_FAILED = 'DEPENDENCIES_FAILED',
}

export class AstroDeployError extends Error {
  constructor(
    public readonly code: AstroDeployErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AstroDeployError';
  }
}

export interface AstroLocalDeployConfig {
  /** Project root directory */
  projectRoot: string;
  /** S3 bucket name for deployment */
  bucketName: string;
  /** CloudFront distribution ID */
  distributionId: string;
  /** AWS region */
  region: string;
  /** API URL for build-time data fetching */
  apiUrl: string;
  /** Path to Astro project (relative to project root) */
  astroProjectPath?: string;
  /** If true, skip actual deployment */
  dryRun?: boolean;
  /** If true, show detailed output */
  verbose?: boolean;
  /** Number of versions to retain */
  retainVersions?: number;
  /** Changed paths for targeted invalidation (optional) */
  changedPaths?: string[];
}

export interface AstroLocalDeployResult {
  /** Whether the entire pipeline succeeded */
  success: boolean;
  /** Build phase result */
  build?: {
    success: boolean;
    durationMs: number;
    error?: string;
  };
  /** Deploy phase result */
  deploy?: AtomicDeployResult;
  /** Invalidation phase result */
  invalidation?: {
    success: boolean;
    invalidatedPaths: string[];
    error?: string;
  };
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Error information if failed */
  error?: {
    code: AstroDeployErrorCode;
    message: string;
    phase: 'build' | 'deploy' | 'invalidation';
  };
}

export interface BuildResult {
  success: boolean;
  durationMs: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a command exists in PATH
 */
export function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate Astro project exists
 */
export function validateAstroProject(projectPath: string): {
  valid: boolean;
  error?: string;
} {
  const packageJsonPath = path.join(projectPath, 'package.json');

  if (!fs.existsSync(projectPath)) {
    return {
      valid: false,
      error: `Astro project directory not found: ${projectPath}`,
    };
  }

  if (!fs.existsSync(packageJsonPath)) {
    return {
      valid: false,
      error: `package.json not found in: ${projectPath}`,
    };
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const hasAstro =
      packageJson.dependencies?.astro || packageJson.devDependencies?.astro;

    if (!hasAstro) {
      return {
        valid: false,
        error: 'Astro is not listed as a dependency in package.json',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to parse package.json: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Install dependencies with bun (frozen lockfile)
 */
export async function installDependencies(
  projectPath: string,
  verbose: boolean = false
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const options = {
      cwd: projectPath,
      stdio: verbose ? ('inherit' as const) : ('pipe' as const),
    };

    try {
      execSync('bun install --frozen-lockfile', {
        ...options,
        encoding: 'utf-8',
      });
      resolve({ success: true });
    } catch (error) {
      resolve({
        success: false,
        error: `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });
}

/**
 * Build Astro project
 * Requirement 9.1: Include Astro build step (bun run build)
 * Requirement 9.10: Build process receives API_URL as environment variable
 */
export async function buildAstroProject(
  projectPath: string,
  apiUrl: string,
  verbose: boolean = false
): Promise<BuildResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      PUBLIC_API_URL: apiUrl,
      API_URL: apiUrl,
      NODE_ENV: 'production',
    };

    const options = {
      cwd: projectPath,
      env,
      stdio: verbose ? ('inherit' as const) : ('pipe' as const),
    };

    try {
      const result = execSync('bun run build', {
        ...options,
        encoding: 'utf-8',
      });

      const durationMs = Date.now() - startTime;
      resolve({
        success: true,
        durationMs,
        stdout: typeof result === 'string' ? result : undefined,
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      resolve({
        success: false,
        durationMs,
        error: errorMessage,
        stderr: errorMessage,
      });
    }
  });
}

/**
 * Get changed paths for targeted CloudFront invalidation
 * Requirement 9.9: Invalidate only changed paths (not /* wildcard) when possible
 *
 * If changedPaths is provided, use those.
 * Otherwise, returns ['/*'] for full invalidation.
 */
export function getInvalidationPaths(changedPaths?: string[]): string[] {
  if (changedPaths && changedPaths.length > 0) {
    // Normalize paths to ensure they start with /
    return changedPaths.map((p) => (p.startsWith('/') ? p : `/${p}`));
  }
  // Default to full invalidation
  return ['/*'];
}

/**
 * Create CloudFront cache invalidation
 * Requirement 9.9: Invalidate changed paths only when possible
 */
export async function invalidateCloudFrontCache(
  distributionId: string,
  region: string,
  paths: string[],
  dryRun: boolean = false
): Promise<{ success: boolean; invalidatedPaths: string[]; error?: string }> {
  if (dryRun) {
    console.log(
      `[DRY-RUN] Would invalidate CloudFront paths: ${paths.join(', ')}`
    );
    return { success: true, invalidatedPaths: paths };
  }

  try {
    const client = new CloudFrontClient({ region });
    const command = new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `astro-local-deploy-${Date.now()}`,
        Paths: {
          Quantity: paths.length,
          Items: paths,
        },
      },
    });

    await client.send(command);
    return { success: true, invalidatedPaths: paths };
  } catch (error) {
    return {
      success: false,
      invalidatedPaths: [],
      error: `CloudFront invalidation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check if total time exceeds limit
 * Requirement 9.11: Total build and deploy time shall not exceed 5 minutes
 */
export function checkTimeLimit(startTime: number): {
  exceeded: boolean;
  elapsedMs: number;
  remainingMs: number;
} {
  const elapsedMs = Date.now() - startTime;
  const remainingMs = MAX_TOTAL_TIME_MS - elapsedMs;
  return {
    exceeded: elapsedMs > MAX_TOTAL_TIME_MS,
    elapsedMs,
    remainingMs,
  };
}

// =============================================================================
// Main Deployment Function
// =============================================================================

/**
 * Execute complete Astro local deploy pipeline
 *
 * Flow:
 * 1. Validate Astro project
 * 2. Install dependencies (bun install --frozen-lockfile)
 * 3. Build Astro project (bun run build)
 * 4. Deploy to S3 using atomic deployment
 * 5. Invalidate CloudFront cache (targeted paths when possible)
 *
 * Requirements:
 * - 9.1: Astro build step
 * - 9.2: Atomic S3 deployment
 * - 9.9: Targeted CloudFront invalidation
 * - 9.10: API_URL environment variable
 * - 9.11: 5-minute time limit
 */
export async function astroLocalDeploy(
  config: AstroLocalDeployConfig
): Promise<AstroLocalDeployResult> {
  const startTime = Date.now();
  const verbose = config.verbose ?? false;
  const dryRun = config.dryRun ?? false;

  const astroProjectPath = path.join(
    config.projectRoot,
    config.astroProjectPath ?? DEFAULT_ASTRO_PROJECT_PATH
  );
  const distPath = path.join(astroProjectPath, 'dist');

  // Step 1: Validate project
  if (verbose) console.log('Validating Astro project...');
  const validation = validateAstroProject(astroProjectPath);
  if (!validation.valid) {
    return {
      success: false,
      totalDurationMs: Date.now() - startTime,
      error: {
        code: AstroDeployErrorCode.PROJECT_NOT_FOUND,
        message: validation.error!,
        phase: 'build',
      },
    };
  }

  // Step 2: Install dependencies
  if (verbose) console.log('Installing dependencies...');
  const installResult = await installDependencies(astroProjectPath, verbose);
  if (!installResult.success) {
    return {
      success: false,
      totalDurationMs: Date.now() - startTime,
      error: {
        code: AstroDeployErrorCode.DEPENDENCIES_FAILED,
        message: installResult.error!,
        phase: 'build',
      },
    };
  }

  // Step 3: Build Astro project
  if (verbose) console.log('Building Astro project...');
  const buildResult = await buildAstroProject(
    astroProjectPath,
    config.apiUrl,
    verbose
  );

  if (!buildResult.success) {
    return {
      success: false,
      build: buildResult,
      totalDurationMs: Date.now() - startTime,
      error: {
        code: AstroDeployErrorCode.BUILD_FAILED,
        message: buildResult.error ?? 'Build failed',
        phase: 'build',
      },
    };
  }

  // Check time limit after build
  const timeCheck1 = checkTimeLimit(startTime);
  if (timeCheck1.exceeded) {
    return {
      success: false,
      build: buildResult,
      totalDurationMs: timeCheck1.elapsedMs,
      error: {
        code: AstroDeployErrorCode.TIME_EXCEEDED,
        message: `Build phase exceeded 5-minute time limit (${(timeCheck1.elapsedMs / 1000 / 60).toFixed(1)} min)`,
        phase: 'build',
      },
    };
  }

  // Step 4: Deploy to S3
  if (verbose) console.log('Deploying to S3...');
  const deployConfig: AtomicDeployConfig = {
    bucketName: config.bucketName,
    distributionId: config.distributionId,
    distPath,
    region: config.region,
    dryRun,
    retainVersions: config.retainVersions,
  };

  const deployResult = await atomicDeploy(deployConfig);

  if (!deployResult.success) {
    return {
      success: false,
      build: buildResult,
      deploy: deployResult,
      totalDurationMs: Date.now() - startTime,
      error: {
        code: AstroDeployErrorCode.DEPLOY_FAILED,
        message: deployResult.error?.message ?? 'Deployment failed',
        phase: 'deploy',
      },
    };
  }

  // Check time limit after deploy
  const timeCheck2 = checkTimeLimit(startTime);
  if (timeCheck2.exceeded) {
    return {
      success: false,
      build: buildResult,
      deploy: deployResult,
      totalDurationMs: timeCheck2.elapsedMs,
      error: {
        code: AstroDeployErrorCode.TIME_EXCEEDED,
        message: `Deploy phase exceeded 5-minute time limit (${(timeCheck2.elapsedMs / 1000 / 60).toFixed(1)} min)`,
        phase: 'deploy',
      },
    };
  }

  // Step 5: CloudFront invalidation
  // Note: The atomicDeploy function already does a full invalidation.
  // Here we support targeted invalidation if changedPaths is provided.
  if (verbose) console.log('Creating CloudFront invalidation...');
  const invalidationPaths = getInvalidationPaths(config.changedPaths);
  const invalidationResult = await invalidateCloudFrontCache(
    config.distributionId,
    config.region,
    invalidationPaths,
    dryRun
  );

  // Invalidation failure is non-fatal but logged
  if (!invalidationResult.success) {
    console.warn(`Warning: ${invalidationResult.error}`);
  }

  const totalDurationMs = Date.now() - startTime;

  return {
    success: true,
    build: buildResult,
    deploy: deployResult,
    invalidation: invalidationResult,
    totalDurationMs,
  };
}

// =============================================================================
// CLI Support Functions
// =============================================================================

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Print deployment result summary
 */
export function printDeploymentSummary(result: AstroLocalDeployResult): void {
  console.log('');
  console.log('===========================================');
  console.log('  Astro Local Deploy Summary');
  console.log('===========================================');
  console.log('');

  if (result.success) {
    console.log(`  Status:       SUCCESS`);
  } else {
    console.log(`  Status:       FAILED`);
    console.log(`  Error:        ${result.error?.message}`);
    console.log(`  Phase:        ${result.error?.phase}`);
  }

  console.log(`  Total Time:   ${formatDuration(result.totalDurationMs)}`);

  if (result.build) {
    console.log('');
    console.log('  Build Phase:');
    console.log(`    Duration:   ${formatDuration(result.build.durationMs)}`);
    console.log(`    Status:     ${result.build.success ? 'OK' : 'FAILED'}`);
  }

  if (result.deploy) {
    console.log('');
    console.log('  Deploy Phase:');
    console.log(`    Build ID:   ${result.deploy.buildId}`);
    console.log(`    Files:      ${result.deploy.filesUploaded ?? 0}`);
    console.log(
      `    Size:       ${((result.deploy.totalSizeBytes ?? 0) / (1024 * 1024)).toFixed(2)} MB`
    );
    console.log(`    Duration:   ${formatDuration(result.deploy.durationMs)}`);
  }

  if (result.invalidation) {
    console.log('');
    console.log('  Invalidation:');
    console.log(
      `    Paths:      ${result.invalidation.invalidatedPaths.join(', ')}`
    );
    console.log(
      `    Status:     ${result.invalidation.success ? 'OK' : 'FAILED'}`
    );
  }

  console.log('');
}
