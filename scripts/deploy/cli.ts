#!/usr/bin/env tsx
/**
 * Atomic Deployment CLI
 *
 * Task 5.1: S3原子的デプロイ CLI Entry Point
 *
 * Usage:
 *   bun run deploy -- --bucket my-bucket --kvs-arn arn:aws:cloudfront::123:key-value-store/id --dist ./dist --revision r42-abc1234
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
  .version('2.0.0')
  .requiredOption('-b, --bucket <name>', 'S3 bucket name')
  .requiredOption('--kvs-arn <arn>', 'CloudFront KeyValueStore ARN')
  .requiredOption('-p, --dist <path>', 'Path to dist directory', './dist')
  .option('-r, --region <region>', 'AWS region', 'ap-northeast-1')
  .option('--revision <revision>', 'Monotonic release revision')
  .option('--dry-run', 'Show what would be done without making changes', false)
  .action(async (options) => {
    const config: AtomicDeployConfig = {
      bucketName: options.bucket,
      keyValueStoreArn: options.kvsArn,
      distPath: path.resolve(options.dist),
      region: options.region,
      revision: options.revision,
      dryRun: options.dryRun,
    };

    console.log('');
    console.log('===========================================');
    console.log('  Atomic Deployment for Astro SSG');
    console.log('===========================================');
    console.log('');
    console.log(`  Bucket:       ${config.bucketName}`);
    console.log(`  KVS ARN:      ${config.keyValueStoreArn}`);
    console.log(`  Revision:     ${config.revision ?? '(generated)'}`);
    console.log(`  Dist Path:    ${config.distPath}`);
    console.log(`  Region:       ${config.region}`);
    console.log(`  Dry Run:      ${config.dryRun ? 'Yes' : 'No'}`);
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
        console.log(`  Previous:     ${result.previousRevision ?? '(unset)'}`);
        console.log(
          `  Promoted:     ${result.promoted ? 'Yes' : 'No (already active)'}`
        );
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
