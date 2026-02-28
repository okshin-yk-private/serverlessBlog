#!/usr/bin/env bun
/**
 * validate-build.ts - Build Output Validation Script
 *
 * Task 7.1: パフォーマンス検証
 *
 * This script validates the Astro build output against performance budgets.
 *
 * Requirements:
 * - 11.4: JavaScript バンドルサイズ 50KB未満（gzip）
 * - 11.5: インタラクティブ要素のないページでJS 0生成
 * - 11.6: Brotli/Gzip圧縮対応確認
 * - 6.8: Total static files < 50MB
 *
 * Usage:
 *   bun run scripts/validate-build.ts [--dist <path>] [--verbose]
 *
 * Exit codes:
 *   0: All validations passed
 *   1: Validation failed
 */

import * as fs from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';
import {
  type BuildArtifact,
  DEFAULT_PERFORMANCE_BUDGET,
  validatePerformanceBudget,
  formatBytes,
  isCompressible,
} from '../src/lib/performanceUtils';

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const distIndex = args.indexOf('--dist');

// Validate --dist argument
let distDir = './dist';
if (distIndex !== -1) {
  const distValue = args[distIndex + 1];
  if (!distValue || distValue.startsWith('-')) {
    console.error('Error: --dist requires a directory path');
    console.error(
      'Usage: bun run scripts/validate-build.ts [--dist <path>] [--verbose]'
    );
    process.exit(1);
  }
  distDir = distValue;
}

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Calculate gzipped size of a file
 */
function getGzippedSize(filePath: string): number {
  const content = fs.readFileSync(filePath);
  const gzipped = gzipSync(content);
  return gzipped.length;
}

/**
 * Main validation function
 */
async function main(): Promise<void> {
  console.log('🔍 Validating Astro build output...\n');

  // Check if dist directory exists
  if (!fs.existsSync(distDir)) {
    console.error(`❌ Build directory not found: ${distDir}`);
    console.error('   Run "bun run build" first.');
    process.exit(1);
  }

  // Get all files in dist directory
  const allFiles = getAllFiles(distDir);

  if (allFiles.length === 0) {
    console.error('❌ No files found in build directory');
    process.exit(1);
  }

  console.log(`📁 Found ${allFiles.length} files in ${distDir}\n`);

  // Build artifacts list with sizes
  const artifacts: BuildArtifact[] = [];
  let totalGzippedJsSize = 0;

  for (const filePath of allFiles) {
    const relativePath = path.relative(distDir, filePath);
    const stats = fs.statSync(filePath);
    const sizeBytes = stats.size;

    artifacts.push({
      path: relativePath,
      sizeBytes,
    });

    // Calculate gzipped size for JS files (requirement 11.4)
    if (relativePath.endsWith('.js') || relativePath.endsWith('.mjs')) {
      const gzippedSize = getGzippedSize(filePath);
      totalGzippedJsSize += gzippedSize;

      if (verbose) {
        console.log(
          `   📦 ${relativePath}: ${formatBytes(sizeBytes)} → ${formatBytes(gzippedSize)} (gzip)`
        );
      }
    }
  }

  // Run validation
  const result = validatePerformanceBudget(
    artifacts,
    DEFAULT_PERFORMANCE_BUDGET
  );

  // Print summary
  console.log('📊 Build Summary:');
  console.log(`   Total files: ${artifacts.length}`);
  console.log(`   Total size: ${formatBytes(result.totalSize)}`);
  console.log(`   Total JS (raw): ${formatBytes(result.totalJsSize)}`);
  console.log(`   Total JS (gzip): ${formatBytes(totalGzippedJsSize)}`);
  console.log(`   Total CSS: ${formatBytes(result.totalCssSize)}`);
  console.log(
    `   Has interactive JS: ${result.hasInteractiveJs ? 'Yes' : 'No'}`
  );
  console.log(`   Compressible files: ${result.compressibleFilesCount}`);
  console.log('');

  // Print file breakdown if verbose
  if (verbose) {
    console.log('📂 File Breakdown:');

    // Group by type
    const htmlFiles = artifacts.filter((a) => a.path.endsWith('.html'));
    const jsFiles = artifacts.filter(
      (a) => a.path.endsWith('.js') || a.path.endsWith('.mjs')
    );
    const cssFiles = artifacts.filter((a) => a.path.endsWith('.css'));
    const xmlFiles = artifacts.filter(
      (a) => a.path.endsWith('.xml') || a.path.endsWith('.rss')
    );
    const otherFiles = artifacts.filter(
      (a) =>
        !a.path.endsWith('.html') &&
        !a.path.endsWith('.js') &&
        !a.path.endsWith('.mjs') &&
        !a.path.endsWith('.css') &&
        !a.path.endsWith('.xml') &&
        !a.path.endsWith('.rss')
    );

    console.log(`\n   📄 HTML files (${htmlFiles.length}):`);
    for (const f of htmlFiles) {
      console.log(`      ${f.path}: ${formatBytes(f.sizeBytes)}`);
    }

    console.log(`\n   📜 JavaScript files (${jsFiles.length}):`);
    for (const f of jsFiles) {
      console.log(`      ${f.path}: ${formatBytes(f.sizeBytes)}`);
    }

    console.log(`\n   🎨 CSS files (${cssFiles.length}):`);
    for (const f of cssFiles) {
      console.log(`      ${f.path}: ${formatBytes(f.sizeBytes)}`);
    }

    console.log(`\n   📰 XML/RSS files (${xmlFiles.length}):`);
    for (const f of xmlFiles) {
      console.log(`      ${f.path}: ${formatBytes(f.sizeBytes)}`);
    }

    if (otherFiles.length > 0) {
      console.log(`\n   📎 Other files (${otherFiles.length}):`);
      for (const f of otherFiles) {
        console.log(`      ${f.path}: ${formatBytes(f.sizeBytes)}`);
      }
    }

    console.log('');
  }

  // Check gzipped JS budget specifically (11.4)
  const jsGzipBudget = DEFAULT_PERFORMANCE_BUDGET.maxJsBundleSizeBytes;
  if (totalGzippedJsSize > jsGzipBudget) {
    result.valid = false;
    result.errors.push(
      `JavaScript bundle size (gzip: ${formatBytes(totalGzippedJsSize)}) exceeds budget (${formatBytes(jsGzipBudget)})`
    );
  }

  // Print validation results
  if (result.errors.length > 0) {
    console.log('❌ Validation Errors:');
    for (const error of result.errors) {
      console.log(`   • ${error}`);
    }
    console.log('');
  }

  if (result.warnings.length > 0) {
    console.log('⚠️  Validation Warnings:');
    for (const warning of result.warnings) {
      console.log(`   • ${warning}`);
    }
    console.log('');
  }

  // Print budget comparison
  console.log('📏 Budget Comparison:');
  console.log(
    `   JS Bundle (gzip): ${formatBytes(totalGzippedJsSize)} / ${formatBytes(jsGzipBudget)} ${totalGzippedJsSize <= jsGzipBudget ? '✅' : '❌'}`
  );
  console.log(
    `   Total Size: ${formatBytes(result.totalSize)} / ${formatBytes(DEFAULT_PERFORMANCE_BUDGET.maxTotalStaticSizeBytes)} ${result.totalSize <= DEFAULT_PERFORMANCE_BUDGET.maxTotalStaticSizeBytes ? '✅' : '❌'}`
  );
  console.log('');

  // Print static page optimization check (11.5)
  if (!result.hasInteractiveJs) {
    console.log('✅ Zero JS for static pages (Requirement 11.5)');
  } else {
    console.log(
      `ℹ️  Interactive JS detected: ${formatBytes(result.totalJsSize)} (raw), ${formatBytes(totalGzippedJsSize)} (gzip)`
    );
    console.log(
      '   This is expected if using React islands or client-side interactivity.'
    );
  }
  console.log('');

  // Print compression check (11.6)
  const compressibleCount = artifacts.filter((a) =>
    isCompressible(a.path)
  ).length;
  console.log(
    `✅ ${compressibleCount} files ready for Brotli/Gzip compression (Requirement 11.6)`
  );
  console.log('');

  // Final result
  if (result.valid) {
    console.log('✅ All performance budget validations passed!');
    process.exit(0);
  } else {
    console.log('❌ Performance budget validation failed');
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('Script error:', error);
  process.exit(1);
});
