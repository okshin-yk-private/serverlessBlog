/**
 * Feature Flags for Lambda Implementation Selection
 *
 * This module provides feature flags for gradual migration from Node.js/Rust
 * to Go Lambda implementations. Flags can be set per-function or per-domain.
 *
 * Requirements: 9.3 - CDK configuration allows feature flags for switching
 * between Node.js/Rust and Go implementations per function.
 */

/**
 * Lambda implementation type
 */
export type LambdaImplementation = 'nodejs' | 'rust' | 'go';

/**
 * Feature flags for individual Lambda functions
 * Each function can be independently switched between implementations
 */
export interface LambdaFeatureFlags {
  // Posts domain
  createPost?: LambdaImplementation;
  getPost?: LambdaImplementation;
  getPublicPost?: LambdaImplementation;
  listPosts?: LambdaImplementation;
  updatePost?: LambdaImplementation;
  deletePost?: LambdaImplementation;
  // Auth domain
  login?: LambdaImplementation;
  logout?: LambdaImplementation;
  refresh?: LambdaImplementation;
  // Images domain
  getUploadUrl?: LambdaImplementation;
  deleteImage?: LambdaImplementation;
}

/**
 * Domain-level feature flags for bulk configuration
 */
export interface DomainFeatureFlags {
  posts?: LambdaImplementation;
  auth?: LambdaImplementation;
  images?: LambdaImplementation;
}

/**
 * Combined feature flags configuration
 * Function-level flags take precedence over domain-level flags
 */
export interface FeatureFlagsConfig {
  /**
   * Default implementation for all functions
   * @default 'nodejs'
   */
  default?: LambdaImplementation;

  /**
   * Domain-level overrides (applies to all functions in domain)
   */
  domain?: DomainFeatureFlags;

  /**
   * Function-level overrides (highest priority)
   */
  function?: LambdaFeatureFlags;
}

/**
 * All Lambda function names
 */
export type LambdaFunctionName =
  | 'createPost'
  | 'getPost'
  | 'getPublicPost'
  | 'listPosts'
  | 'updatePost'
  | 'deletePost'
  | 'login'
  | 'logout'
  | 'refresh'
  | 'getUploadUrl'
  | 'deleteImage';

/**
 * Domain name type
 */
export type DomainName = 'posts' | 'auth' | 'images';

/**
 * Maps function names to their domain
 */
const FUNCTION_TO_DOMAIN: Record<LambdaFunctionName, DomainName> = {
  createPost: 'posts',
  getPost: 'posts',
  getPublicPost: 'posts',
  listPosts: 'posts',
  updatePost: 'posts',
  deletePost: 'posts',
  login: 'auth',
  logout: 'auth',
  refresh: 'auth',
  getUploadUrl: 'images',
  deleteImage: 'images',
};

/**
 * Get the implementation type for a specific function
 *
 * Resolution order (highest to lowest priority):
 * 1. Function-level flag
 * 2. Domain-level flag
 * 3. Default flag
 * 4. 'nodejs' (fallback)
 *
 * @param functionName - The Lambda function name
 * @param config - Feature flags configuration
 * @returns The implementation type to use
 */
export function getImplementation(
  functionName: LambdaFunctionName,
  config: FeatureFlagsConfig
): LambdaImplementation {
  // Priority 1: Function-level override
  if (config.function?.[functionName]) {
    return config.function[functionName]!;
  }

  // Priority 2: Domain-level override
  const domain = FUNCTION_TO_DOMAIN[functionName];
  if (config.domain?.[domain]) {
    return config.domain[domain]!;
  }

  // Priority 3: Default
  if (config.default) {
    return config.default;
  }

  // Priority 4: Fallback
  return 'nodejs';
}

/**
 * Check if a function should use Go implementation
 *
 * @param functionName - The Lambda function name
 * @param config - Feature flags configuration
 * @returns true if Go implementation should be used
 */
export function isGoEnabled(
  functionName: LambdaFunctionName,
  config: FeatureFlagsConfig
): boolean {
  return getImplementation(functionName, config) === 'go';
}

/**
 * Check if a function should use Rust implementation
 *
 * @param functionName - The Lambda function name
 * @param config - Feature flags configuration
 * @returns true if Rust implementation should be used
 */
export function isRustEnabled(
  functionName: LambdaFunctionName,
  config: FeatureFlagsConfig
): boolean {
  return getImplementation(functionName, config) === 'rust';
}

/**
 * Check if a function should use Node.js implementation
 *
 * @param functionName - The Lambda function name
 * @param config - Feature flags configuration
 * @returns true if Node.js implementation should be used
 */
export function isNodejsEnabled(
  functionName: LambdaFunctionName,
  config: FeatureFlagsConfig
): boolean {
  return getImplementation(functionName, config) === 'nodejs';
}

/**
 * Get all functions that use a specific implementation
 *
 * @param implementation - The implementation type
 * @param config - Feature flags configuration
 * @returns Array of function names using the specified implementation
 */
export function getFunctionsForImplementation(
  implementation: LambdaImplementation,
  config: FeatureFlagsConfig
): LambdaFunctionName[] {
  const allFunctions: LambdaFunctionName[] = [
    'createPost',
    'getPost',
    'getPublicPost',
    'listPosts',
    'updatePost',
    'deletePost',
    'login',
    'logout',
    'refresh',
    'getUploadUrl',
    'deleteImage',
  ];

  return allFunctions.filter(
    (fn) => getImplementation(fn, config) === implementation
  );
}

/**
 * Get the domain for a function
 *
 * @param functionName - The Lambda function name
 * @returns The domain name
 */
export function getDomain(functionName: LambdaFunctionName): DomainName {
  return FUNCTION_TO_DOMAIN[functionName];
}

/**
 * Validate feature flags configuration
 *
 * @param config - Feature flags configuration
 * @returns true if configuration is valid
 * @throws Error if configuration is invalid
 */
export function validateConfig(config: FeatureFlagsConfig): boolean {
  const validImplementations: LambdaImplementation[] = ['nodejs', 'rust', 'go'];

  // Validate default
  if (config.default && !validImplementations.includes(config.default)) {
    throw new Error(`Invalid default implementation: ${config.default}`);
  }

  // Validate domain flags
  if (config.domain) {
    for (const [domain, impl] of Object.entries(config.domain)) {
      if (impl && !validImplementations.includes(impl)) {
        throw new Error(`Invalid implementation for domain ${domain}: ${impl}`);
      }
    }
  }

  // Validate function flags
  if (config.function) {
    for (const [fn, impl] of Object.entries(config.function)) {
      if (impl && !validImplementations.includes(impl)) {
        throw new Error(`Invalid implementation for function ${fn}: ${impl}`);
      }
    }
  }

  return true;
}

/**
 * Create a configuration that uses Go for all functions
 *
 * @returns Feature flags configuration with Go as default
 */
export function createGoOnlyConfig(): FeatureFlagsConfig {
  return { default: 'go' };
}

/**
 * Create a configuration that uses Node.js for all functions
 *
 * @returns Feature flags configuration with Node.js as default
 */
export function createNodejsOnlyConfig(): FeatureFlagsConfig {
  return { default: 'nodejs' };
}

/**
 * Create a configuration that uses Rust for all functions
 *
 * @returns Feature flags configuration with Rust as default
 */
export function createRustOnlyConfig(): FeatureFlagsConfig {
  return { default: 'rust' };
}

/**
 * Create a configuration for gradual migration to Go
 *
 * @param goFunctions - Functions to run on Go implementation
 * @param baseFallback - Default implementation for functions not in goFunctions
 * @returns Feature flags configuration for gradual migration
 */
export function createGradualMigrationConfig(
  goFunctions: LambdaFunctionName[],
  baseFallback: LambdaImplementation = 'nodejs'
): FeatureFlagsConfig {
  const functionFlags: LambdaFeatureFlags = {};

  for (const fn of goFunctions) {
    functionFlags[fn] = 'go';
  }

  return {
    default: baseFallback,
    function: functionFlags,
  };
}
