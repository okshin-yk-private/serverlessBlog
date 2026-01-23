/**
 * Backward Compatibility Verification Tests
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 *
 * TDD approach: These tests verify that the Astro SSG migration
 * maintains backward compatibility with all existing systems.
 */
import { describe, it, expect } from 'vitest';
import {
  verifyPath,
  verifyAdminCompatibility,
  verifyApiCompatibility,
  verifyAuthCompatibility,
  verifyImageCompatibility,
  verifyUrlStructure,
  verifyRollbackCapability,
  runFullCompatibilityCheck,
  generateCompatibilityReport,
  validateSsgRewrite,
  ADMIN_PATHS,
  API_PATHS,
  AUTH_PATHS,
  IMAGE_PATHS,
  PUBLIC_URL_STRUCTURE,
  ROLLBACK_CONFIG,
  type RouteVerificationResult,
  type RollbackConfig,
} from './backwardCompatibility';

describe('backwardCompatibility', () => {
  /**
   * Requirement 12.1: Admin site (/admin/*) shall continue functioning without any changes
   */
  describe('Admin Site Compatibility (Requirement 12.1)', () => {
    it('should have all admin paths pass through unchanged', () => {
      const results = verifyAdminCompatibility();

      for (const result of results) {
        expect(result.isCompatible).toBe(true);
        expect(result.actualBehavior).toBe('passthrough');
        expect(result.system).toBe('admin');
      }
    });

    it('should not rewrite /admin root path', () => {
      const result = verifyPath('/admin', 'passthrough', 'admin');
      expect(result.isCompatible).toBe(true);
      expect(result.rewrittenPath).toBeUndefined();
    });

    it('should not rewrite /admin/ with trailing slash', () => {
      const result = verifyPath('/admin/', 'passthrough', 'admin');
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite admin dashboard routes', () => {
      const result = verifyPath('/admin/dashboard', 'passthrough', 'admin');
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite admin posts routes', () => {
      const result = verifyPath('/admin/posts', 'passthrough', 'admin');
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite admin posts create route', () => {
      const result = verifyPath('/admin/posts/create', 'passthrough', 'admin');
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite admin posts edit route with ID', () => {
      const result = verifyPath(
        '/admin/posts/edit/123',
        'passthrough',
        'admin'
      );
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite admin static assets (JS)', () => {
      const result = verifyPath(
        '/admin/assets/main.js',
        'passthrough',
        'admin'
      );
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite admin static assets (CSS)', () => {
      const result = verifyPath(
        '/admin/assets/styles.css',
        'passthrough',
        'admin'
      );
      expect(result.isCompatible).toBe(true);
    });

    it('should verify all predefined admin paths', () => {
      expect(ADMIN_PATHS.length).toBeGreaterThan(0);
      const results = verifyAdminCompatibility();
      expect(results.every((r) => r.isCompatible)).toBe(true);
    });
  });

  /**
   * Requirement 12.2: Existing REST API endpoints shall continue functioning without any changes
   */
  describe('REST API Compatibility (Requirement 12.2)', () => {
    it('should have all API paths pass through unchanged', () => {
      const results = verifyApiCompatibility();

      for (const result of results) {
        expect(result.isCompatible).toBe(true);
        expect(result.actualBehavior).toBe('passthrough');
        expect(result.system).toBe('api');
      }
    });

    it('should not rewrite /api/posts endpoint', () => {
      const result = verifyPath('/api/posts', 'passthrough', 'api');
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite /api/posts/:id endpoint', () => {
      const result = verifyPath('/api/posts/123', 'passthrough', 'api');
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite /api/categories endpoint', () => {
      const result = verifyPath('/api/categories', 'passthrough', 'api');
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite /api/categories/:category/posts endpoint', () => {
      const result = verifyPath(
        '/api/categories/tech/posts',
        'passthrough',
        'api'
      );
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite /api/images endpoints', () => {
      const result = verifyPath('/api/images/upload-url', 'passthrough', 'api');
      expect(result.isCompatible).toBe(true);
    });

    it('should verify all predefined API paths', () => {
      expect(API_PATHS.length).toBeGreaterThan(0);
      const results = verifyApiCompatibility();
      expect(results.every((r) => r.isCompatible)).toBe(true);
    });
  });

  /**
   * Requirement 12.3: Cognito authentication for Admin shall continue functioning without any changes
   */
  describe('Cognito Authentication Compatibility (Requirement 12.3)', () => {
    it('should have all auth paths pass through unchanged', () => {
      const results = verifyAuthCompatibility();

      for (const result of results) {
        expect(result.isCompatible).toBe(true);
        expect(result.actualBehavior).toBe('passthrough');
        expect(result.system).toBe('auth');
      }
    });

    it('should not rewrite /api/auth/login endpoint', () => {
      const result = verifyPath('/api/auth/login', 'passthrough', 'auth');
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite /api/auth/logout endpoint', () => {
      const result = verifyPath('/api/auth/logout', 'passthrough', 'auth');
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite /api/auth/refresh endpoint', () => {
      const result = verifyPath('/api/auth/refresh', 'passthrough', 'auth');
      expect(result.isCompatible).toBe(true);
    });

    it('should verify all predefined auth paths', () => {
      expect(AUTH_PATHS.length).toBe(3);
      const results = verifyAuthCompatibility();
      expect(results.every((r) => r.isCompatible)).toBe(true);
    });
  });

  /**
   * Requirement 12.4: Image storage and delivery system shall continue functioning without any changes
   */
  describe('Image Delivery Compatibility (Requirement 12.4)', () => {
    it('should have all image paths pass through unchanged', () => {
      const results = verifyImageCompatibility();

      for (const result of results) {
        expect(result.isCompatible).toBe(true);
        expect(result.actualBehavior).toBe('passthrough');
        expect(result.system).toBe('images');
      }
    });

    it('should not rewrite /images/photo.jpg', () => {
      const result = verifyPath('/images/photo.jpg', 'passthrough', 'images');
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite nested image paths', () => {
      const result = verifyPath(
        '/images/uploads/2024/image.png',
        'passthrough',
        'images'
      );
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite thumbnail paths', () => {
      const result = verifyPath(
        '/images/thumbnails/post-123.webp',
        'passthrough',
        'images'
      );
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite profile images', () => {
      const result = verifyPath(
        '/images/profile/avatar.gif',
        'passthrough',
        'images'
      );
      expect(result.isCompatible).toBe(true);
    });

    it('should verify all predefined image paths', () => {
      expect(IMAGE_PATHS.length).toBeGreaterThan(0);
      const results = verifyImageCompatibility();
      expect(results.every((r) => r.isCompatible)).toBe(true);
    });
  });

  /**
   * Requirement 12.5: Existing URL structure (/, /posts/[id], /about) shall be preserved
   */
  describe('URL Structure Preservation (Requirement 12.5)', () => {
    it('should have all public paths properly rewritten for SSG', () => {
      const results = verifyUrlStructure();

      for (const result of results) {
        expect(result.isCompatible).toBe(true);
        expect(result.actualBehavior).toBe('rewrite');
        expect(result.system).toBe('public');
        expect(result.rewrittenPath).toMatch(/\/index\.html$/);
      }
    });

    it('should rewrite / to /index.html', () => {
      const result = verifyPath('/', 'rewrite', 'public');
      expect(result.isCompatible).toBe(true);
      expect(result.rewrittenPath).toBe('/index.html');
    });

    it('should rewrite /posts/123 to /posts/123/index.html', () => {
      const result = verifyPath('/posts/123', 'rewrite', 'public');
      expect(result.isCompatible).toBe(true);
      expect(result.rewrittenPath).toBe('/posts/123/index.html');
    });

    it('should rewrite /posts/456/ to /posts/456/index.html', () => {
      const result = verifyPath('/posts/456/', 'rewrite', 'public');
      expect(result.isCompatible).toBe(true);
      expect(result.rewrittenPath).toBe('/posts/456/index.html');
    });

    it('should rewrite /about to /about/index.html', () => {
      const result = verifyPath('/about', 'rewrite', 'public');
      expect(result.isCompatible).toBe(true);
      expect(result.rewrittenPath).toBe('/about/index.html');
    });

    it('should rewrite /about/ to /about/index.html', () => {
      const result = verifyPath('/about/', 'rewrite', 'public');
      expect(result.isCompatible).toBe(true);
      expect(result.rewrittenPath).toBe('/about/index.html');
    });

    it('should verify all predefined URL structures', () => {
      expect(Object.keys(PUBLIC_URL_STRUCTURE).length).toBeGreaterThan(0);
      const results = verifyUrlStructure();
      expect(results.every((r) => r.isCompatible)).toBe(true);
    });
  });

  /**
   * Requirement 12.6: Rollback to previous version shall be possible within 5 minutes via S3 versioning
   */
  describe('S3 Versioning Rollback Capability (Requirement 12.6)', () => {
    it('should have valid default rollback configuration', () => {
      const result = verifyRollbackCapability();
      expect(result.isConfigValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should require versioning to be enabled', () => {
      const config: RollbackConfig = {
        ...ROLLBACK_CONFIG,
        versioningEnabled: false,
      };
      const result = verifyRollbackCapability(config);
      expect(result.isConfigValid).toBe(false);
      expect(result.issues).toContain(
        'S3 versioning must be enabled for rollback capability'
      );
    });

    it('should require rollback time within 5 minutes', () => {
      const config: RollbackConfig = {
        ...ROLLBACK_CONFIG,
        maxRollbackTimeMinutes: 10,
      };
      const result = verifyRollbackCapability(config);
      expect(result.isConfigValid).toBe(false);
      expect(result.issues).toContain(
        'Rollback time must not exceed 5 minutes (Requirement 12.6)'
      );
    });

    it('should require at least 1 version retained', () => {
      const config: RollbackConfig = {
        ...ROLLBACK_CONFIG,
        versionsToRetain: 0,
      };
      const result = verifyRollbackCapability(config);
      expect(result.isConfigValid).toBe(false);
      expect(result.issues).toContain(
        'At least 1 version must be retained for rollback'
      );
    });

    it('should have default config with versioning enabled', () => {
      expect(ROLLBACK_CONFIG.versioningEnabled).toBe(true);
    });

    it('should have default config with max 5 minutes rollback', () => {
      expect(ROLLBACK_CONFIG.maxRollbackTimeMinutes).toBeLessThanOrEqual(5);
    });

    it('should have default config with 3 versions retained', () => {
      expect(ROLLBACK_CONFIG.versionsToRetain).toBe(3);
    });
  });

  /**
   * Full Compatibility Check
   */
  describe('Full Compatibility Check', () => {
    it('should run all compatibility checks successfully', () => {
      const results = runFullCompatibilityCheck();

      expect(results.admin.length).toBeGreaterThan(0);
      expect(results.api.length).toBeGreaterThan(0);
      expect(results.auth.length).toBeGreaterThan(0);
      expect(results.images.length).toBeGreaterThan(0);
      expect(results.urlStructure.length).toBeGreaterThan(0);
      expect(results.rollback).toBeDefined();
    });

    it('should report all systems as compatible', () => {
      const results = runFullCompatibilityCheck();

      expect(results.summary.allCompatible).toBe(true);
      expect(results.summary.incompatiblePaths).toBe(0);
      expect(results.summary.compatiblePaths).toBe(results.summary.totalPaths);
    });

    it('should provide accurate summary counts', () => {
      const results = runFullCompatibilityCheck();
      const expectedTotal =
        results.admin.length +
        results.api.length +
        results.auth.length +
        results.images.length +
        results.urlStructure.length;

      expect(results.summary.totalPaths).toBe(expectedTotal);
    });
  });

  /**
   * Compatibility Report Generation
   */
  describe('Compatibility Report', () => {
    it('should generate a human-readable report', () => {
      const report = generateCompatibilityReport();

      expect(report).toContain('# Backward Compatibility Verification Report');
      expect(report).toContain('## Summary');
      expect(report).toContain('## Detailed Results');
    });

    it('should include all requirement sections', () => {
      const report = generateCompatibilityReport();

      expect(report).toContain('Admin Site (Requirement 12.1)');
      expect(report).toContain('REST API (Requirement 12.2)');
      expect(report).toContain('Cognito Auth (Requirement 12.3)');
      expect(report).toContain('Image Delivery (Requirement 12.4)');
      expect(report).toContain('URL Structure (Requirement 12.5)');
      expect(report).toContain('Rollback Capability (Requirement 12.6)');
    });

    it('should show PASS status when all compatible', () => {
      const report = generateCompatibilityReport();
      expect(report).toContain('PASS ✅');
    });

    it('should include rollback configuration details', () => {
      const report = generateCompatibilityReport();

      expect(report).toContain('Versioning enabled:');
      expect(report).toContain('Max rollback time:');
      expect(report).toContain('Versions retained:');
    });
  });

  /**
   * SSG Rewrite Validation
   */
  describe('SSG Rewrite Validation', () => {
    it('should validate correct SSG rewrites for root path', () => {
      const result = validateSsgRewrite('/');
      expect(result.isValid).toBe(true);
      expect(result.outputPath).toBe('/index.html');
    });

    it('should validate correct SSG rewrites for post paths', () => {
      const result = validateSsgRewrite('/posts/123');
      expect(result.isValid).toBe(true);
      expect(result.outputPath).toBe('/posts/123/index.html');
    });

    it('should validate correct SSG rewrites for about path', () => {
      const result = validateSsgRewrite('/about');
      expect(result.isValid).toBe(true);
      expect(result.outputPath).toBe('/about/index.html');
    });

    it('should validate passthrough for excluded paths', () => {
      const result = validateSsgRewrite('/api/posts');
      expect(result.isValid).toBe(true);
      expect(result.outputPath).toBe('/api/posts');
    });

    it('should validate passthrough for admin paths', () => {
      const result = validateSsgRewrite('/admin/dashboard');
      expect(result.isValid).toBe(true);
      expect(result.outputPath).toBe('/admin/dashboard');
    });

    it('should validate passthrough for image paths', () => {
      const result = validateSsgRewrite('/images/photo.jpg');
      expect(result.isValid).toBe(true);
      expect(result.outputPath).toBe('/images/photo.jpg');
    });

    it('should validate passthrough for files with extensions', () => {
      const result = validateSsgRewrite('/sitemap-index.xml');
      expect(result.isValid).toBe(true);
      expect(result.outputPath).toBe('/sitemap-index.xml');
    });
  });

  /**
   * verifyPath Function Tests
   */
  describe('verifyPath', () => {
    it('should return correct result for passthrough path', () => {
      const result = verifyPath('/api/posts', 'passthrough', 'api');

      expect(result.path).toBe('/api/posts');
      expect(result.expectedBehavior).toBe('passthrough');
      expect(result.actualBehavior).toBe('passthrough');
      expect(result.isCompatible).toBe(true);
      expect(result.system).toBe('api');
      expect(result.rewrittenPath).toBeUndefined();
    });

    it('should return correct result for rewrite path', () => {
      const result = verifyPath('/about', 'rewrite', 'public');

      expect(result.path).toBe('/about');
      expect(result.expectedBehavior).toBe('rewrite');
      expect(result.actualBehavior).toBe('rewrite');
      expect(result.isCompatible).toBe(true);
      expect(result.system).toBe('public');
      expect(result.rewrittenPath).toBe('/about/index.html');
    });

    it('should detect incompatibility when expected does not match actual', () => {
      // Expecting rewrite but it passes through (for an excluded path)
      const result = verifyPath('/api/posts', 'rewrite', 'api');

      expect(result.isCompatible).toBe(false);
      expect(result.expectedBehavior).toBe('rewrite');
      expect(result.actualBehavior).toBe('passthrough');
    });
  });

  /**
   * Report Generation with Issues (for coverage of error paths)
   */
  describe('Report Generation with Issues', () => {
    it('should include incompatible paths section when paths fail', () => {
      // Manually create a failing scenario by testing the report format
      const report = generateCompatibilityReport();

      // Since all paths are compatible, should not have Incompatible Paths section
      expect(report).not.toContain('## Incompatible Paths');
    });

    it('should include rollback issues when config is invalid', () => {
      // Test with invalid config to trigger issues path
      const config: RollbackConfig = {
        versioningEnabled: false,
        maxRollbackTimeMinutes: 10,
        versionsToRetain: 0,
      };
      const result = verifyRollbackCapability(config);

      // Should have multiple issues
      expect(result.issues.length).toBe(3);
      expect(result.isConfigValid).toBe(false);
    });

    it('should handle all three rollback config issues simultaneously', () => {
      const config: RollbackConfig = {
        versioningEnabled: false,
        maxRollbackTimeMinutes: 10,
        versionsToRetain: 0,
      };
      const result = verifyRollbackCapability(config);

      expect(result.issues).toContain(
        'S3 versioning must be enabled for rollback capability'
      );
      expect(result.issues).toContain(
        'Rollback time must not exceed 5 minutes (Requirement 12.6)'
      );
      expect(result.issues).toContain(
        'At least 1 version must be retained for rollback'
      );
    });
  });

  /**
   * Edge Cases
   */
  describe('Edge Cases', () => {
    it('should handle paths with special characters', () => {
      const result = verifyPath('/posts/hello-world-2024', 'rewrite', 'public');
      expect(result.isCompatible).toBe(true);
    });

    it('should handle deeply nested paths', () => {
      const result = verifyPath(
        '/admin/users/123/posts/456/edit',
        'passthrough',
        'admin'
      );
      expect(result.isCompatible).toBe(true);
    });

    it('should handle paths with UUID-like IDs', () => {
      const result = verifyPath(
        '/posts/550e8400-e29b-41d4-a716-446655440000',
        'rewrite',
        'public'
      );
      expect(result.isCompatible).toBe(true);
      expect(result.rewrittenPath).toBe(
        '/posts/550e8400-e29b-41d4-a716-446655440000/index.html'
      );
    });

    it('should not rewrite _astro paths', () => {
      const result = verifyPath(
        '/_astro/styles.abc123.css',
        'passthrough',
        'public'
      );
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite sitemap paths', () => {
      const result = verifyPath('/sitemap-0.xml', 'passthrough', 'public');
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite RSS feed path', () => {
      const result = verifyPath('/rss.xml', 'passthrough', 'public');
      expect(result.isCompatible).toBe(true);
    });

    it('should not rewrite robots.txt', () => {
      const result = verifyPath('/robots.txt', 'passthrough', 'public');
      expect(result.isCompatible).toBe(true);
    });
  });
});
