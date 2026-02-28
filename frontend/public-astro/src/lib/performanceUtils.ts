/**
 * performanceUtils.ts - パフォーマンス検証ユーティリティ
 *
 * Task 7.1: パフォーマンス検証
 *
 * Requirements:
 * - 11.1: Lighthouse Performance スコア 95以上
 * - 11.2: TTFB 100ms未満
 * - 11.3: FCP 1秒未満
 * - 11.4: JavaScript バンドルサイズ 50KB未満（gzip）
 * - 11.5: インタラクティブ要素のないページでJS 0生成
 * - 11.6: Brotli/Gzip圧縮対応
 */

/**
 * Performance budget configuration
 */
export interface PerformanceBudget {
  /** Minimum Lighthouse Performance score (0-100) */
  lighthouseScore: number;
  /** Maximum Time to First Byte in milliseconds */
  ttfbMs: number;
  /** Maximum First Contentful Paint in milliseconds */
  fcpMs: number;
  /** Maximum JavaScript bundle size in bytes (gzipped) */
  maxJsBundleSizeBytes: number;
  /** Maximum total static files size in bytes */
  maxTotalStaticSizeBytes: number;
}

/**
 * Build artifact information
 */
export interface BuildArtifact {
  /** File path relative to dist directory */
  path: string;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * Result of validating a single artifact
 */
export interface ArtifactValidationResult {
  /** Whether the artifact passes validation */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
}

/**
 * Result of validating the overall performance budget
 */
export interface PerformanceValidationResult {
  /** Whether all validations passed */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
  /** Total JavaScript size in bytes */
  totalJsSize: number;
  /** Total CSS size in bytes */
  totalCssSize: number;
  /** Total size of all files in bytes */
  totalSize: number;
  /** Whether the build has interactive JavaScript */
  hasInteractiveJs: boolean;
  /** Number of compressible files */
  compressibleFilesCount: number;
}

/**
 * Default performance budget based on requirements
 * - 11.1: Lighthouse score >= 95
 * - 11.2: TTFB < 100ms
 * - 11.3: FCP < 1000ms
 * - 11.4: JS bundle < 50KB (gzipped)
 * - Req 6.8: Total static files < 50MB
 */
export const DEFAULT_PERFORMANCE_BUDGET: PerformanceBudget = {
  lighthouseScore: 95,
  ttfbMs: 100,
  fcpMs: 1000,
  maxJsBundleSizeBytes: 51200, // 50KB in bytes
  maxTotalStaticSizeBytes: 52428800, // 50MB in bytes
};

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;

  // Find the appropriate unit
  let unitIndex = 0;
  let value = bytes;

  while (value >= k && unitIndex < units.length - 1) {
    value /= k;
    unitIndex++;
  }

  // Format based on unit
  if (unitIndex === 0) {
    return `${Math.round(value)} B`;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Check if a file is compressible (Brotli/Gzip)
 * Requirement 11.6: Brotli/Gzip圧縮対応
 */
export function isCompressible(filePath: string): boolean {
  const compressibleExtensions = [
    '.html',
    '.css',
    '.js',
    '.mjs',
    '.json',
    '.xml',
    '.txt',
    '.svg',
    '.rss',
  ];

  const nonCompressibleExtensions = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.avif',
    '.woff',
    '.woff2',
    '.ico',
  ];

  const lowerPath = filePath.toLowerCase();

  // Check non-compressible first
  for (const ext of nonCompressibleExtensions) {
    if (lowerPath.endsWith(ext)) {
      return false;
    }
  }

  // Check compressible
  for (const ext of compressibleExtensions) {
    if (lowerPath.endsWith(ext)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate total JavaScript size from build artifacts
 * Requirement 11.4: JavaScript バンドルサイズ 50KB未満
 */
export function calculateTotalJsSize(artifacts: BuildArtifact[]): number {
  return artifacts
    .filter((a) => a.path.endsWith('.js') || a.path.endsWith('.mjs'))
    .reduce((total, a) => total + a.sizeBytes, 0);
}

/**
 * Calculate total CSS size from build artifacts
 */
export function calculateTotalCssSize(artifacts: BuildArtifact[]): number {
  return artifacts
    .filter((a) => a.path.endsWith('.css'))
    .reduce((total, a) => total + a.sizeBytes, 0);
}

/**
 * Check if build has interactive JavaScript
 * Requirement 11.5: インタラクティブ要素のないページでJS 0生成
 */
export function hasInteractiveJs(artifacts: BuildArtifact[]): boolean {
  return artifacts.some(
    (a) => a.path.endsWith('.js') || a.path.endsWith('.mjs')
  );
}

/**
 * Validate a single build artifact against budget
 */
export function validateBuildArtifact(
  artifact: BuildArtifact,
  budget: PerformanceBudget
): ArtifactValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check JS file size budget
  if (artifact.path.endsWith('.js') || artifact.path.endsWith('.mjs')) {
    if (artifact.sizeBytes > budget.maxJsBundleSizeBytes) {
      errors.push(
        `JS file "${artifact.path}" (${formatBytes(artifact.sizeBytes)}) exceeds budget (${formatBytes(budget.maxJsBundleSizeBytes)})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate overall performance budget
 */
export function validatePerformanceBudget(
  artifacts: BuildArtifact[],
  budget: PerformanceBudget
): PerformanceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const totalJsSize = calculateTotalJsSize(artifacts);
  const totalCssSize = calculateTotalCssSize(artifacts);
  const totalSize = artifacts.reduce((total, a) => total + a.sizeBytes, 0);
  const hasJs = hasInteractiveJs(artifacts);
  const compressibleFilesCount = artifacts.filter((a) =>
    isCompressible(a.path)
  ).length;

  // Note: JS budget check (11.4) requires gzipped size, which is only available
  // at CLI script level. This function validates raw sizes only.
  // The CLI script (validate-build.ts) performs the actual gzip size validation.
  if (hasJs) {
    warnings.push(
      `JavaScript detected (raw: ${formatBytes(totalJsSize)}). Gzip size validation is performed by CLI script.`
    );
  }

  // Validate total static size (Req 6.8)
  if (totalSize > budget.maxTotalStaticSizeBytes) {
    errors.push(
      `Total static size (${formatBytes(totalSize)}) exceeds budget (${formatBytes(budget.maxTotalStaticSizeBytes)})`
    );
  }

  // Warning if no compressible files found (should have at least HTML)
  if (compressibleFilesCount === 0) {
    warnings.push('No compressible files found in build output');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    totalJsSize,
    totalCssSize,
    totalSize,
    hasInteractiveJs: hasJs,
    compressibleFilesCount,
  };
}
