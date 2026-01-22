/**
 * performanceUtils.test.ts - パフォーマンス検証ユーティリティのテスト
 *
 * Task 7.1: パフォーマンス検証 (TDD)
 *
 * Requirements:
 * - 11.1: Lighthouse Performance スコア 95以上
 * - 11.2: TTFB 100ms未満
 * - 11.3: FCP 1秒未満
 * - 11.4: JavaScript バンドルサイズ 50KB未満（gzip）
 * - 11.5: インタラクティブ要素のないページでJS 0生成
 * - 11.6: Brotli/Gzip圧縮対応
 */

import { describe, it, expect } from 'vitest';
import {
  type PerformanceBudget,
  type BuildArtifact,
  type PerformanceValidationResult,
  DEFAULT_PERFORMANCE_BUDGET,
  validateBuildArtifact,
  calculateTotalJsSize,
  calculateTotalCssSize,
  hasInteractiveJs,
  validatePerformanceBudget,
  formatBytes,
  isCompressible,
} from './performanceUtils';

describe('performanceUtils', () => {
  describe('DEFAULT_PERFORMANCE_BUDGET', () => {
    it('should have correct budget values based on requirements', () => {
      // 11.1: Lighthouse score >= 95
      expect(DEFAULT_PERFORMANCE_BUDGET.lighthouseScore).toBe(95);

      // 11.2: TTFB < 100ms
      expect(DEFAULT_PERFORMANCE_BUDGET.ttfbMs).toBe(100);

      // 11.3: FCP < 1000ms (1 second)
      expect(DEFAULT_PERFORMANCE_BUDGET.fcpMs).toBe(1000);

      // 11.4: JS bundle < 50KB (gzipped) = 51200 bytes
      expect(DEFAULT_PERFORMANCE_BUDGET.maxJsBundleSizeBytes).toBe(51200);

      // Total static files < 50MB = 52428800 bytes (from Req 6.8)
      expect(DEFAULT_PERFORMANCE_BUDGET.maxTotalStaticSizeBytes).toBe(52428800);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes to human readable string', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1048576)).toBe('1.00 MB');
      expect(formatBytes(51200)).toBe('50.00 KB');
    });

    it('should handle small byte values', () => {
      expect(formatBytes(100)).toBe('100 B');
      expect(formatBytes(999)).toBe('999 B');
    });

    it('should handle large byte values', () => {
      expect(formatBytes(1073741824)).toBe('1.00 GB');
      expect(formatBytes(52428800)).toBe('50.00 MB');
    });
  });

  describe('isCompressible', () => {
    // 11.6: Brotli/Gzip圧縮対応
    it('should identify compressible file types', () => {
      expect(isCompressible('main.js')).toBe(true);
      expect(isCompressible('styles.css')).toBe(true);
      expect(isCompressible('index.html')).toBe(true);
      expect(isCompressible('data.json')).toBe(true);
      expect(isCompressible('sitemap.xml')).toBe(true);
      expect(isCompressible('feed.rss')).toBe(true);
    });

    it('should identify non-compressible file types', () => {
      expect(isCompressible('image.png')).toBe(false);
      expect(isCompressible('image.jpg')).toBe(false);
      expect(isCompressible('image.jpeg')).toBe(false);
      expect(isCompressible('image.gif')).toBe(false);
      expect(isCompressible('image.webp')).toBe(false);
      expect(isCompressible('font.woff')).toBe(false);
      expect(isCompressible('font.woff2')).toBe(false);
    });

    it('should handle paths with directories', () => {
      expect(isCompressible('_astro/main.abc123.js')).toBe(true);
      expect(isCompressible('images/photo.jpg')).toBe(false);
    });
  });

  describe('calculateTotalJsSize', () => {
    // 11.4: JavaScript バンドルサイズ 50KB未満
    it('should calculate total JS size from artifacts', () => {
      const artifacts: BuildArtifact[] = [
        { path: '_astro/main.abc123.js', sizeBytes: 10000 },
        { path: '_astro/chunk.def456.js', sizeBytes: 5000 },
        { path: 'index.html', sizeBytes: 2000 },
      ];

      expect(calculateTotalJsSize(artifacts)).toBe(15000);
    });

    it('should return 0 for no JS files', () => {
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 2000 },
        { path: '_astro/styles.css', sizeBytes: 3000 },
      ];

      expect(calculateTotalJsSize(artifacts)).toBe(0);
    });

    it('should handle mjs files', () => {
      const artifacts: BuildArtifact[] = [
        { path: '_astro/main.mjs', sizeBytes: 10000 },
      ];

      expect(calculateTotalJsSize(artifacts)).toBe(10000);
    });
  });

  describe('calculateTotalCssSize', () => {
    it('should calculate total CSS size from artifacts', () => {
      const artifacts: BuildArtifact[] = [
        { path: '_astro/main.abc123.css', sizeBytes: 5000 },
        { path: '_astro/chunk.def456.css', sizeBytes: 3000 },
        { path: 'index.html', sizeBytes: 2000 },
      ];

      expect(calculateTotalCssSize(artifacts)).toBe(8000);
    });

    it('should return 0 for no CSS files', () => {
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 2000 },
        { path: '_astro/main.js', sizeBytes: 3000 },
      ];

      expect(calculateTotalCssSize(artifacts)).toBe(0);
    });
  });

  describe('hasInteractiveJs', () => {
    // 11.5: インタラクティブ要素のないページでJS 0生成
    it('should return false for static pages with no JS', () => {
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 2000 },
        { path: 'about/index.html', sizeBytes: 1500 },
        { path: '_astro/styles.css', sizeBytes: 3000 },
      ];

      expect(hasInteractiveJs(artifacts)).toBe(false);
    });

    it('should return true when JS files exist', () => {
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 2000 },
        { path: '_astro/main.js', sizeBytes: 1000 },
      ];

      expect(hasInteractiveJs(artifacts)).toBe(true);
    });

    it('should return true when hoisted scripts exist', () => {
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 2000 },
        { path: '_astro/hoisted.abc123.js', sizeBytes: 500 },
      ];

      expect(hasInteractiveJs(artifacts)).toBe(true);
    });
  });

  describe('validateBuildArtifact', () => {
    it('should validate artifact within budget', () => {
      const artifact: BuildArtifact = {
        path: '_astro/main.js',
        sizeBytes: 30000, // 30KB < 50KB
      };

      const result = validateBuildArtifact(
        artifact,
        DEFAULT_PERFORMANCE_BUDGET
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for JS file exceeding budget', () => {
      const artifact: BuildArtifact = {
        path: '_astro/main.js',
        sizeBytes: 60000, // 60KB > 50KB
      };

      const result = validateBuildArtifact(
        artifact,
        DEFAULT_PERFORMANCE_BUDGET
      );
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('exceeds budget');
    });

    it('should pass for non-JS files regardless of size', () => {
      const artifact: BuildArtifact = {
        path: 'images/photo.jpg',
        sizeBytes: 1000000, // 1MB is fine for images
      };

      const result = validateBuildArtifact(
        artifact,
        DEFAULT_PERFORMANCE_BUDGET
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('validatePerformanceBudget', () => {
    it('should pass when all metrics are within budget', () => {
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 2000 },
        { path: 'about/index.html', sizeBytes: 1500 },
        { path: '_astro/styles.abc.css', sizeBytes: 3000 },
        // No JS files for static pages
      ];

      const result = validatePerformanceBudget(
        artifacts,
        DEFAULT_PERFORMANCE_BUDGET
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.totalJsSize).toBe(0);
      expect(result.totalCssSize).toBe(3000);
      expect(result.totalSize).toBe(6500);
      expect(result.hasInteractiveJs).toBe(false);
    });

    it('should add warning when JS is present (gzip validation done by CLI)', () => {
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 2000 },
        { path: '_astro/main.abc.js', sizeBytes: 60000 }, // 60KB > 50KB (raw)
      ];

      const result = validatePerformanceBudget(
        artifacts,
        DEFAULT_PERFORMANCE_BUDGET
      );

      // Raw JS size does not cause error - gzip validation is done by CLI script
      expect(result.valid).toBe(true);
      expect(
        result.warnings.some((w) => w.includes('JavaScript detected'))
      ).toBe(true);
      expect(
        result.warnings.some((w) => w.includes('Gzip size validation'))
      ).toBe(true);
    });

    it('should fail when total static size exceeds budget', () => {
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 53000000 }, // 53MB > 50MB
      ];

      const result = validatePerformanceBudget(
        artifacts,
        DEFAULT_PERFORMANCE_BUDGET
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Total static size'))).toBe(
        true
      );
    });

    it('should report hasInteractiveJs correctly for pages with JS', () => {
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 2000 },
        { path: '_astro/main.js', sizeBytes: 10000 },
      ];

      const result = validatePerformanceBudget(
        artifacts,
        DEFAULT_PERFORMANCE_BUDGET
      );

      expect(result.hasInteractiveJs).toBe(true);
    });

    it('should provide warnings for compressible files', () => {
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 2000 },
        { path: '_astro/main.js', sizeBytes: 10000 },
      ];

      const result = validatePerformanceBudget(
        artifacts,
        DEFAULT_PERFORMANCE_BUDGET
      );

      // Should count compressible files
      expect(result.compressibleFilesCount).toBeGreaterThan(0);
    });
  });

  describe('integration scenarios', () => {
    it('should validate a typical Astro SSG build output', () => {
      // Simulating a typical Astro build with static pages
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 5000 },
        { path: 'about/index.html', sizeBytes: 3000 },
        { path: 'posts/1/index.html', sizeBytes: 4000 },
        { path: 'posts/2/index.html', sizeBytes: 4500 },
        { path: '404.html', sizeBytes: 2000 },
        { path: 'sitemap-index.xml', sizeBytes: 500 },
        { path: 'rss.xml', sizeBytes: 2000 },
        { path: 'robots.txt', sizeBytes: 100 },
        { path: '_astro/Layout.abc123.css', sizeBytes: 8000 },
        { path: '_astro/PostCard.def456.css', sizeBytes: 2000 },
      ];

      const result = validatePerformanceBudget(
        artifacts,
        DEFAULT_PERFORMANCE_BUDGET
      );

      // For pure SSG without interactive components, should pass
      expect(result.valid).toBe(true);
      expect(result.totalJsSize).toBe(0);
      expect(result.hasInteractiveJs).toBe(false);
    });

    it('should validate build with React islands (interactive components)', () => {
      // Astro with React islands would have some JS
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 5000 },
        { path: '_astro/Layout.abc.css', sizeBytes: 8000 },
        { path: '_astro/client.abc.js', sizeBytes: 25000 }, // React hydration
        { path: '_astro/react.def.js', sizeBytes: 20000 }, // React runtime
      ];

      const result = validatePerformanceBudget(
        artifacts,
        DEFAULT_PERFORMANCE_BUDGET
      );

      // 45KB total JS is under 50KB budget
      expect(result.valid).toBe(true);
      expect(result.totalJsSize).toBe(45000);
      expect(result.hasInteractiveJs).toBe(true);
    });

    it('should warn for large JS bundles (gzip validation done by CLI)', () => {
      const artifacts: BuildArtifact[] = [
        { path: 'index.html', sizeBytes: 5000 },
        { path: '_astro/client.js', sizeBytes: 35000 },
        { path: '_astro/react.js', sizeBytes: 30000 }, // Total: 65KB (raw)
      ];

      const result = validatePerformanceBudget(
        artifacts,
        DEFAULT_PERFORMANCE_BUDGET
      );

      // Raw JS size does not cause error - gzip validation is done by CLI script
      expect(result.valid).toBe(true);
      expect(result.totalJsSize).toBe(65000);
      expect(
        result.warnings.some((w) => w.includes('JavaScript detected'))
      ).toBe(true);
    });
  });
});
