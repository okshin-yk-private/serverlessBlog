#!/usr/bin/env tsx
/**
 * Atomic Deployment CLI
 *
 * Task 5.1: S3原子的デプロイ CLI Entry Point
 *
 * Usage:
 *   bun run deploy -- --bucket my-bucket --distribution E123456 --dist ./dist
 *   bun run deploy:dry-run -- --bucket my-bucket --distribution E123456 --dist ./dist
 *
 * Requirements:
 * - 6.1-6.8: S3 atomic deployment with staging, versioning, and cleanup
 */

import { Command } from 'commander';
import {
  atomicDeploy,
  AtomicDeployConfig,
  AtomicDeployResult,
} from './atomicDeploy';
import * as path from 'node:path';

const program = new Command();

program
  .name('atomic-deploy')
  .description('Atomic deployment for Astro SSG to S3')
  .version('1.0.0')
  .requiredOption('-b, --bucket <name>', 'S3 bucket name')
  .requiredOption('-d, --distribution <id>', 'CloudFront distribution ID')
  .requiredOption('-p, --dist <path>', 'Path to dist directory', './dist')
  .option('-r, --region <region>', 'AWS region', 'ap-northeast-1')
  .option('--dry-run', 'Show what would be done without making changes', false)
  .option('--retain <count>', 'Number of versions to retain', '3')
  .action(async (options) => {
    const config: AtomicDeployConfig = {
      bucketName: options.bucket,
      distributionId: options.distribution,
      distPath: path.resolve(options.dist),
      region: options.region,
      dryRun: options.dryRun,
      retainVersions: parseInt(options.retain, 10),
    };

    console.log('');
    console.log('===========================================');
    console.log('  Atomic Deployment for Astro SSG');
    console.log('===========================================');
    console.log('');
    console.log(`  Bucket:       ${config.bucketName}`);
    console.log(`  Distribution: ${config.distributionId}`);
    console.log(`  Dist Path:    ${config.distPath}`);
    console.log(`  Region:       ${config.region}`);
    console.log(`  Dry Run:      ${config.dryRun ? 'Yes' : 'No'}`);
    console.log(`  Retain:       ${config.retainVersions} versions`);
    console.log('');

    try {
      const result: AtomicDeployResult = await atomicDeploy(config);

      console.log('');
      console.log('===========================================');
      if (result.success) {
        console.log('  Deployment Summary');
        console.log('===========================================');
        console.log(`  Build ID:     ${result.buildId}`);
        console.log(`  Version:      ${result.versionPrefix}`);
        console.log(`  Files:        ${result.filesUploaded}`);
        console.log(
          `  Size:         ${((result.totalSizeBytes ?? 0) / (1024 * 1024)).toFixed(2)} MB`
        );
        console.log(
          `  Duration:     ${(result.durationMs / 1000).toFixed(1)}s`
        );
        if (result.cleanedUpVersions && result.cleanedUpVersions.length > 0) {
          console.log(
            `  Cleaned up:   ${result.cleanedUpVersions.length} old version(s)`
          );
        }
        console.log('');
        console.log('  Deployment completed successfully!');
        process.exit(0);
      } else {
        console.log('  Deployment Failed');
        console.log('===========================================');
        console.log(`  Error Code:   ${result.error?.code}`);
        console.log(`  Message:      ${result.error?.message}`);
        console.log(
          `  Duration:     ${(result.durationMs / 1000).toFixed(1)}s`
        );
        process.exit(1);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      process.exit(1);
    }
  });

program.parse();
