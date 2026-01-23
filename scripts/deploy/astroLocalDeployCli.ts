#!/usr/bin/env tsx
/**
 * Astro Local Deploy CLI
 *
 * Task 5.2: ローカルデプロイスクリプト更新 CLI Entry Point
 *
 * Usage:
 *   bun run scripts/deploy/astroLocalDeployCli.ts \
 *     --project-root /path/to/project \
 *     --bucket my-bucket \
 *     --distribution E123456 \
 *     --api-url https://api.example.com
 *
 * Requirements:
 * - 9.1: Astro build step (bun run build)
 * - 9.2: Atomic S3 deployment
 * - 9.9: CloudFront cache invalidation (targeted paths when possible)
 * - 9.10: API_URL environment variable
 * - 9.11: 5-minute time limit
 */

import { Command } from 'commander';
import * as path from 'node:path';
import {
  astroLocalDeploy,
  printDeploymentSummary,
  AstroLocalDeployConfig,
} from './astroLocalDeploy';

const program = new Command();

program
  .name('astro-local-deploy')
  .description('Build and deploy Astro SSG to S3 with atomic deployment')
  .version('1.0.0')
  .requiredOption('-p, --project-root <path>', 'Project root directory')
  .requiredOption('-b, --bucket <name>', 'S3 bucket name')
  .requiredOption('-d, --distribution <id>', 'CloudFront distribution ID')
  .requiredOption('-a, --api-url <url>', 'API URL for build-time data fetching')
  .option('-r, --region <region>', 'AWS region', 'ap-northeast-1')
  .option(
    '--astro-path <path>',
    'Path to Astro project (relative to project root)',
    'frontend/public-astro'
  )
  .option('--dry-run', 'Show what would be done without making changes', false)
  .option('--verbose', 'Show detailed output', false)
  .option('--retain <count>', 'Number of versions to retain', '3')
  .option(
    '--changed-paths <paths>',
    'Comma-separated list of changed paths for targeted invalidation'
  )
  .action(async (options) => {
    const config: AstroLocalDeployConfig = {
      projectRoot: path.resolve(options.projectRoot),
      bucketName: options.bucket,
      distributionId: options.distribution,
      region: options.region,
      apiUrl: options.apiUrl,
      astroProjectPath: options.astroPath,
      dryRun: options.dryRun,
      verbose: options.verbose,
      retainVersions: parseInt(options.retain, 10),
      changedPaths: options.changedPaths
        ? options.changedPaths.split(',').map((p: string) => p.trim())
        : undefined,
    };

    console.log('');
    console.log('===========================================');
    console.log('  Astro Local Deploy');
    console.log('===========================================');
    console.log('');
    console.log(`  Project:      ${config.projectRoot}`);
    console.log(`  Astro Path:   ${config.astroProjectPath}`);
    console.log(`  Bucket:       ${config.bucketName}`);
    console.log(`  Distribution: ${config.distributionId}`);
    console.log(`  Region:       ${config.region}`);
    console.log(`  API URL:      ${config.apiUrl}`);
    console.log(`  Dry Run:      ${config.dryRun ? 'Yes' : 'No'}`);
    console.log(`  Verbose:      ${config.verbose ? 'Yes' : 'No'}`);
    console.log(`  Retain:       ${config.retainVersions} versions`);
    if (config.changedPaths) {
      console.log(`  Changed:      ${config.changedPaths.join(', ')}`);
    }
    console.log('');

    try {
      const result = await astroLocalDeploy(config);

      printDeploymentSummary(result);

      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      process.exit(1);
    }
  });

program.parse();
