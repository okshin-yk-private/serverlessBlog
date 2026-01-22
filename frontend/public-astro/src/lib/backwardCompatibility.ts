/**
 * Backward Compatibility Verification Module
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 *
 * This module provides utilities to verify that the Astro SSG migration
 * maintains backward compatibility with existing systems:
 * - Admin site (/admin/*) routing
 * - REST API endpoints (/api/*)
 * - Cognito authentication (via /api/auth/*)
 * - Image delivery system (/images/*)
 * - URL structure preservation (/, /posts/[id], /about)
 * - S3 versioning rollback capability
 *
 * The verification ensures that the CloudFront routing changes
 * do not affect existing functionality.
 */

import { isExcludedPath, rewriteUri } from './cloudfrontRouting';

/**
 * Route verification result
 */
export interface RouteVerificationResult {
  path: string;
  expectedBehavior: 'passthrough' | 'rewrite';
  actualBehavior: 'passthrough' | 'rewrite';
  rewrittenPath?: string;
  isCompatible: boolean;
  system: 'admin' | 'api' | 'auth' | 'images' | 'public';
}

/**
 * Admin site paths that must be preserved (Requirement 12.1)
 */
export const ADMIN_PATHS = [
  '/admin',
  '/admin/',
  '/admin/dashboard',
  '/admin/posts',
  '/admin/posts/create',
  '/admin/posts/edit/123',
  '/admin/settings',
  '/admin/assets/main.js',
  '/admin/assets/styles.css',
] as const;

/**
 * REST API paths that must be preserved (Requirement 12.2)
 */
export const API_PATHS = [
  '/api/posts',
  '/api/posts/123',
  '/api/posts?publishStatus=published',
  '/api/categories',
  '/api/categories/tech/posts',
  '/api/images/upload-url',
  '/api/images/delete',
] as const;

/**
 * Cognito authentication paths that must be preserved (Requirement 12.3)
 */
export const AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
] as const;

/**
 * Image delivery paths that must be preserved (Requirement 12.4)
 */
export const IMAGE_PATHS = [
  '/images/photo.jpg',
  '/images/uploads/2024/image.png',
  '/images/thumbnails/post-123.webp',
  '/images/profile/avatar.gif',
] as const;

/**
 * Public site URL structure that must be preserved (Requirement 12.5)
 * These paths should be rewritten to index.html by the SSG routing
 */
export const PUBLIC_URL_STRUCTURE = {
  home: '/',
  postDetail: '/posts/123',
  postDetailWithSlash: '/posts/456/',
  about: '/about',
  aboutWithSlash: '/about/',
} as const;

/**
 * S3 versioning rollback configuration (Requirement 12.6)
 */
export interface RollbackConfig {
  /** Maximum time in minutes to complete rollback */
  maxRollbackTimeMinutes: number;
  /** Number of versions to retain for rollback */
  versionsToRetain: number;
  /** S3 bucket versioning enabled */
  versioningEnabled: boolean;
}

export const ROLLBACK_CONFIG: RollbackConfig = {
  maxRollbackTimeMinutes: 5,
  versionsToRetain: 3,
  versioningEnabled: true,
};

/**
 * Verify a single path's routing behavior
 */
export function verifyPath(
  path: string,
  expectedBehavior: 'passthrough' | 'rewrite',
  system: RouteVerificationResult['system']
): RouteVerificationResult {
  const rewrittenPath = rewriteUri(path);
  const actualBehavior = rewrittenPath === path ? 'passthrough' : 'rewrite';

  return {
    path,
    expectedBehavior,
    actualBehavior,
    rewrittenPath: actualBehavior === 'rewrite' ? rewrittenPath : undefined,
    isCompatible: actualBehavior === expectedBehavior,
    system,
  };
}

/**
 * Verify Admin site paths are not affected by SSG routing (Requirement 12.1)
 * Admin routes must pass through unchanged to the Admin S3 bucket
 */
export function verifyAdminCompatibility(): RouteVerificationResult[] {
  return ADMIN_PATHS.map((path) => verifyPath(path, 'passthrough', 'admin'));
}

/**
 * Verify REST API paths are not affected by SSG routing (Requirement 12.2)
 * API routes must pass through unchanged to API Gateway
 */
export function verifyApiCompatibility(): RouteVerificationResult[] {
  return API_PATHS.map((path) => {
    // Extract just the path part (before query string)
    const pathOnly = path.split('?')[0];
    return verifyPath(pathOnly, 'passthrough', 'api');
  });
}

/**
 * Verify Cognito authentication paths work correctly (Requirement 12.3)
 * Auth endpoints are part of the API, must pass through unchanged
 */
export function verifyAuthCompatibility(): RouteVerificationResult[] {
  return AUTH_PATHS.map((path) => verifyPath(path, 'passthrough', 'auth'));
}

/**
 * Verify Image delivery paths are not affected (Requirement 12.4)
 * Image routes must pass through unchanged to Images S3 bucket
 */
export function verifyImageCompatibility(): RouteVerificationResult[] {
  return IMAGE_PATHS.map((path) => verifyPath(path, 'passthrough', 'images'));
}

/**
 * Verify public site URL structure is preserved (Requirement 12.5)
 * These routes should be rewritten to index.html for SSG
 */
export function verifyUrlStructure(): RouteVerificationResult[] {
  return Object.entries(PUBLIC_URL_STRUCTURE).map(([_name, path]) => {
    const result = verifyPath(path, 'rewrite', 'public');
    // Additional check: rewritten path should end with /index.html
    if (result.rewrittenPath && !result.rewrittenPath.endsWith('/index.html')) {
      return { ...result, isCompatible: false };
    }
    return result;
  });
}

/**
 * Verify rollback capability configuration (Requirement 12.6)
 */
export function verifyRollbackCapability(
  config: RollbackConfig = ROLLBACK_CONFIG
): {
  isConfigValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!config.versioningEnabled) {
    issues.push('S3 versioning must be enabled for rollback capability');
  }

  if (config.maxRollbackTimeMinutes > 5) {
    issues.push('Rollback time must not exceed 5 minutes (Requirement 12.6)');
  }

  if (config.versionsToRetain < 1) {
    issues.push('At least 1 version must be retained for rollback');
  }

  return {
    isConfigValid: issues.length === 0,
    issues,
  };
}

/**
 * Run all backward compatibility verification checks
 */
export function runFullCompatibilityCheck(): {
  admin: RouteVerificationResult[];
  api: RouteVerificationResult[];
  auth: RouteVerificationResult[];
  images: RouteVerificationResult[];
  urlStructure: RouteVerificationResult[];
  rollback: ReturnType<typeof verifyRollbackCapability>;
  summary: {
    totalPaths: number;
    compatiblePaths: number;
    incompatiblePaths: number;
    allCompatible: boolean;
  };
} {
  const admin = verifyAdminCompatibility();
  const api = verifyApiCompatibility();
  const auth = verifyAuthCompatibility();
  const images = verifyImageCompatibility();
  const urlStructure = verifyUrlStructure();
  const rollback = verifyRollbackCapability();

  const allResults = [...admin, ...api, ...auth, ...images, ...urlStructure];
  const totalPaths = allResults.length;
  const compatiblePaths = allResults.filter((r) => r.isCompatible).length;
  const incompatiblePaths = totalPaths - compatiblePaths;

  return {
    admin,
    api,
    auth,
    images,
    urlStructure,
    rollback,
    summary: {
      totalPaths,
      compatiblePaths,
      incompatiblePaths,
      allCompatible: incompatiblePaths === 0 && rollback.isConfigValid,
    },
  };
}

/**
 * Generate a human-readable compatibility report
 */
export function generateCompatibilityReport(): string {
  const results = runFullCompatibilityCheck();
  const lines: string[] = [];

  lines.push('# Backward Compatibility Verification Report');
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Total paths verified: ${results.summary.totalPaths}`);
  lines.push(`- Compatible paths: ${results.summary.compatiblePaths}`);
  lines.push(`- Incompatible paths: ${results.summary.incompatiblePaths}`);
  lines.push(`- Rollback config valid: ${results.rollback.isConfigValid}`);
  lines.push(
    `- **Overall status: ${results.summary.allCompatible ? 'PASS ✅' : 'FAIL ❌'}**`
  );
  lines.push('');

  // Report any incompatible paths
  const incompatible = [
    ...results.admin,
    ...results.api,
    ...results.auth,
    ...results.images,
    ...results.urlStructure,
  ].filter((r) => !r.isCompatible);

  if (incompatible.length > 0) {
    lines.push('## Incompatible Paths');
    for (const result of incompatible) {
      lines.push(
        `- ${result.path} (${result.system}): expected ${result.expectedBehavior}, got ${result.actualBehavior}`
      );
    }
    lines.push('');
  }

  // Report rollback issues
  if (results.rollback.issues.length > 0) {
    lines.push('## Rollback Configuration Issues');
    for (const issue of results.rollback.issues) {
      lines.push(`- ${issue}`);
    }
    lines.push('');
  }

  // Detailed results
  lines.push('## Detailed Results');
  lines.push('');

  const sections = [
    { name: 'Admin Site (Requirement 12.1)', results: results.admin },
    { name: 'REST API (Requirement 12.2)', results: results.api },
    { name: 'Cognito Auth (Requirement 12.3)', results: results.auth },
    { name: 'Image Delivery (Requirement 12.4)', results: results.images },
    { name: 'URL Structure (Requirement 12.5)', results: results.urlStructure },
  ];

  for (const section of sections) {
    const compatible = section.results.filter((r) => r.isCompatible).length;
    lines.push(`### ${section.name}`);
    lines.push(
      `Status: ${compatible}/${section.results.length} paths compatible`
    );
    lines.push('');
  }

  lines.push('### Rollback Capability (Requirement 12.6)');
  lines.push(`- Versioning enabled: ${ROLLBACK_CONFIG.versioningEnabled}`);
  lines.push(
    `- Max rollback time: ${ROLLBACK_CONFIG.maxRollbackTimeMinutes} minutes`
  );
  lines.push(`- Versions retained: ${ROLLBACK_CONFIG.versionsToRetain}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Validate that a path follows the expected rewrite pattern for SSG
 * Used to verify public site paths are correctly rewritten
 */
export function validateSsgRewrite(inputPath: string): {
  isValid: boolean;
  outputPath: string;
  expectedPattern: string;
} {
  const outputPath = rewriteUri(inputPath);

  // For non-excluded paths without extensions, should end with /index.html
  const isExcluded = isExcludedPath(inputPath);
  const hasExtension =
    inputPath.includes('.') && !/\/\d+\.\d+(\.\d+)?$/.test(inputPath); // Exclude date-like patterns

  let expectedPattern: string;
  let isValid: boolean;

  if (isExcluded || hasExtension) {
    expectedPattern = inputPath; // Should pass through unchanged
    isValid = outputPath === inputPath;
  } else {
    // Should be rewritten to {path}/index.html
    const normalizedInput = inputPath.endsWith('/')
      ? inputPath
      : inputPath + '/';
    expectedPattern = normalizedInput + 'index.html';
    isValid = outputPath === expectedPattern;
  }

  return { isValid, outputPath, expectedPattern };
}
