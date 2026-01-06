/**
 * Feature Flags Unit Tests
 *
 * Tests for Lambda implementation selection feature flags.
 * Requirements: 9.3 - CDK configuration allows feature flags for switching
 * between Node.js/Rust and Go implementations per function.
 */

import {
  getImplementation,
  isGoEnabled,
  isRustEnabled,
  isNodejsEnabled,
  getFunctionsForImplementation,
  getDomain,
  validateConfig,
  createGoOnlyConfig,
  createNodejsOnlyConfig,
  createRustOnlyConfig,
  createGradualMigrationConfig,
  FeatureFlagsConfig,
  LambdaFunctionName,
  LambdaImplementation,
} from '../lib/feature-flags';

describe('Feature Flags', () => {
  describe('getImplementation', () => {
    test('should return default "nodejs" when no config is provided', () => {
      const config: FeatureFlagsConfig = {};
      expect(getImplementation('createPost', config)).toBe('nodejs');
    });

    test('should return config default when set', () => {
      const config: FeatureFlagsConfig = { default: 'go' };
      expect(getImplementation('createPost', config)).toBe('go');
    });

    test('should return domain-level override over default', () => {
      const config: FeatureFlagsConfig = {
        default: 'nodejs',
        domain: { posts: 'rust' },
      };
      expect(getImplementation('createPost', config)).toBe('rust');
      expect(getImplementation('getPost', config)).toBe('rust');
      expect(getImplementation('login', config)).toBe('nodejs'); // auth domain uses default
    });

    test('should return function-level override over domain', () => {
      const config: FeatureFlagsConfig = {
        default: 'nodejs',
        domain: { posts: 'rust' },
        function: { createPost: 'go' },
      };
      expect(getImplementation('createPost', config)).toBe('go'); // function override
      expect(getImplementation('getPost', config)).toBe('rust'); // domain override
      expect(getImplementation('login', config)).toBe('nodejs'); // default
    });

    test('should handle all function names correctly', () => {
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

      const config: FeatureFlagsConfig = { default: 'go' };

      allFunctions.forEach((fn) => {
        expect(getImplementation(fn, config)).toBe('go');
      });
    });
  });

  describe('isGoEnabled', () => {
    test('should return true when function uses Go', () => {
      const config: FeatureFlagsConfig = { default: 'go' };
      expect(isGoEnabled('createPost', config)).toBe(true);
    });

    test('should return false when function uses Node.js', () => {
      const config: FeatureFlagsConfig = { default: 'nodejs' };
      expect(isGoEnabled('createPost', config)).toBe(false);
    });

    test('should return false when function uses Rust', () => {
      const config: FeatureFlagsConfig = { default: 'rust' };
      expect(isGoEnabled('createPost', config)).toBe(false);
    });

    test('should respect function-level overrides', () => {
      const config: FeatureFlagsConfig = {
        default: 'nodejs',
        function: { createPost: 'go' },
      };
      expect(isGoEnabled('createPost', config)).toBe(true);
      expect(isGoEnabled('getPost', config)).toBe(false);
    });
  });

  describe('isRustEnabled', () => {
    test('should return true when function uses Rust', () => {
      const config: FeatureFlagsConfig = { default: 'rust' };
      expect(isRustEnabled('createPost', config)).toBe(true);
    });

    test('should return false when function uses Go', () => {
      const config: FeatureFlagsConfig = { default: 'go' };
      expect(isRustEnabled('createPost', config)).toBe(false);
    });
  });

  describe('isNodejsEnabled', () => {
    test('should return true when function uses Node.js', () => {
      const config: FeatureFlagsConfig = { default: 'nodejs' };
      expect(isNodejsEnabled('createPost', config)).toBe(true);
    });

    test('should return true with empty config (default fallback)', () => {
      const config: FeatureFlagsConfig = {};
      expect(isNodejsEnabled('createPost', config)).toBe(true);
    });

    test('should return false when function uses Go', () => {
      const config: FeatureFlagsConfig = { default: 'go' };
      expect(isNodejsEnabled('createPost', config)).toBe(false);
    });
  });

  describe('getFunctionsForImplementation', () => {
    test('should return all functions when all use Go', () => {
      const config: FeatureFlagsConfig = { default: 'go' };
      const goFunctions = getFunctionsForImplementation('go', config);
      expect(goFunctions).toHaveLength(11);
      expect(goFunctions).toContain('createPost');
      expect(goFunctions).toContain('login');
      expect(goFunctions).toContain('deleteImage');
    });

    test('should return empty array when no functions use Rust', () => {
      const config: FeatureFlagsConfig = { default: 'nodejs' };
      const rustFunctions = getFunctionsForImplementation('rust', config);
      expect(rustFunctions).toHaveLength(0);
    });

    test('should correctly split functions between implementations', () => {
      const config: FeatureFlagsConfig = {
        default: 'nodejs',
        domain: { posts: 'go' },
        function: { login: 'rust' },
      };

      const goFunctions = getFunctionsForImplementation('go', config);
      const rustFunctions = getFunctionsForImplementation('rust', config);
      const nodejsFunctions = getFunctionsForImplementation('nodejs', config);

      // Posts domain (6) should be Go
      expect(goFunctions).toHaveLength(6);
      expect(goFunctions).toContain('createPost');
      expect(goFunctions).toContain('getPost');
      expect(goFunctions).toContain('getPublicPost');
      expect(goFunctions).toContain('listPosts');
      expect(goFunctions).toContain('updatePost');
      expect(goFunctions).toContain('deletePost');

      // Login should be Rust
      expect(rustFunctions).toHaveLength(1);
      expect(rustFunctions).toContain('login');

      // Remaining auth (2) + images (2) should be Node.js
      expect(nodejsFunctions).toHaveLength(4);
      expect(nodejsFunctions).toContain('logout');
      expect(nodejsFunctions).toContain('refresh');
      expect(nodejsFunctions).toContain('getUploadUrl');
      expect(nodejsFunctions).toContain('deleteImage');
    });
  });

  describe('getDomain', () => {
    test('should return "posts" for posts domain functions', () => {
      expect(getDomain('createPost')).toBe('posts');
      expect(getDomain('getPost')).toBe('posts');
      expect(getDomain('getPublicPost')).toBe('posts');
      expect(getDomain('listPosts')).toBe('posts');
      expect(getDomain('updatePost')).toBe('posts');
      expect(getDomain('deletePost')).toBe('posts');
    });

    test('should return "auth" for auth domain functions', () => {
      expect(getDomain('login')).toBe('auth');
      expect(getDomain('logout')).toBe('auth');
      expect(getDomain('refresh')).toBe('auth');
    });

    test('should return "images" for images domain functions', () => {
      expect(getDomain('getUploadUrl')).toBe('images');
      expect(getDomain('deleteImage')).toBe('images');
    });
  });

  describe('validateConfig', () => {
    test('should return true for valid empty config', () => {
      expect(validateConfig({})).toBe(true);
    });

    test('should return true for valid config with all levels', () => {
      const config: FeatureFlagsConfig = {
        default: 'nodejs',
        domain: { posts: 'go', auth: 'rust' },
        function: { createPost: 'go', login: 'rust' },
      };
      expect(validateConfig(config)).toBe(true);
    });

    test('should throw for invalid default implementation', () => {
      const config = { default: 'invalid' as LambdaImplementation };
      expect(() => validateConfig(config)).toThrow(
        'Invalid default implementation: invalid'
      );
    });

    test('should throw for invalid domain implementation', () => {
      const config: FeatureFlagsConfig = {
        domain: { posts: 'invalid' as LambdaImplementation },
      };
      expect(() => validateConfig(config)).toThrow(
        'Invalid implementation for domain posts: invalid'
      );
    });

    test('should throw for invalid function implementation', () => {
      const config: FeatureFlagsConfig = {
        function: { createPost: 'invalid' as LambdaImplementation },
      };
      expect(() => validateConfig(config)).toThrow(
        'Invalid implementation for function createPost: invalid'
      );
    });
  });

  describe('Config Factory Functions', () => {
    describe('createGoOnlyConfig', () => {
      test('should return config with Go as default', () => {
        const config = createGoOnlyConfig();
        expect(config.default).toBe('go');
        expect(isGoEnabled('createPost', config)).toBe(true);
        expect(isGoEnabled('login', config)).toBe(true);
        expect(isGoEnabled('deleteImage', config)).toBe(true);
      });
    });

    describe('createNodejsOnlyConfig', () => {
      test('should return config with Node.js as default', () => {
        const config = createNodejsOnlyConfig();
        expect(config.default).toBe('nodejs');
        expect(isNodejsEnabled('createPost', config)).toBe(true);
      });
    });

    describe('createRustOnlyConfig', () => {
      test('should return config with Rust as default', () => {
        const config = createRustOnlyConfig();
        expect(config.default).toBe('rust');
        expect(isRustEnabled('createPost', config)).toBe(true);
      });
    });

    describe('createGradualMigrationConfig', () => {
      test('should enable Go for specified functions only', () => {
        const config = createGradualMigrationConfig(['createPost', 'getPost']);
        expect(isGoEnabled('createPost', config)).toBe(true);
        expect(isGoEnabled('getPost', config)).toBe(true);
        expect(isNodejsEnabled('listPosts', config)).toBe(true);
        expect(isNodejsEnabled('login', config)).toBe(true);
      });

      test('should use specified fallback implementation', () => {
        const config = createGradualMigrationConfig(['createPost'], 'rust');
        expect(isGoEnabled('createPost', config)).toBe(true);
        expect(isRustEnabled('getPost', config)).toBe(true);
        expect(isRustEnabled('login', config)).toBe(true);
      });

      test('should enable Go for entire domain when all domain functions specified', () => {
        const config = createGradualMigrationConfig([
          'createPost',
          'getPost',
          'getPublicPost',
          'listPosts',
          'updatePost',
          'deletePost',
        ]);

        const goFunctions = getFunctionsForImplementation('go', config);
        expect(goFunctions).toHaveLength(6); // All posts domain
      });
    });
  });

  describe('Integration Scenarios', () => {
    test('Phase 1: Migrate read-only functions first', () => {
      // Phase 1: GetPublicPost and ListPosts go to Go
      const config = createGradualMigrationConfig([
        'getPublicPost',
        'listPosts',
      ]);

      expect(isGoEnabled('getPublicPost', config)).toBe(true);
      expect(isGoEnabled('listPosts', config)).toBe(true);
      expect(isNodejsEnabled('createPost', config)).toBe(true);
      expect(isNodejsEnabled('updatePost', config)).toBe(true);
      expect(isNodejsEnabled('login', config)).toBe(true);
    });

    test('Phase 2: Add auth functions', () => {
      // Phase 2: Add auth domain to Go
      const config: FeatureFlagsConfig = {
        default: 'nodejs',
        domain: { auth: 'go' },
        function: {
          getPublicPost: 'go',
          listPosts: 'go',
        },
      };

      expect(isGoEnabled('getPublicPost', config)).toBe(true);
      expect(isGoEnabled('listPosts', config)).toBe(true);
      expect(isGoEnabled('login', config)).toBe(true);
      expect(isGoEnabled('logout', config)).toBe(true);
      expect(isGoEnabled('refresh', config)).toBe(true);
      expect(isNodejsEnabled('createPost', config)).toBe(true);
    });

    test('Phase 3: Full Go migration', () => {
      const config = createGoOnlyConfig();

      const goFunctions = getFunctionsForImplementation('go', config);
      expect(goFunctions).toHaveLength(11);

      const nodejsFunctions = getFunctionsForImplementation('nodejs', config);
      expect(nodejsFunctions).toHaveLength(0);
    });

    test('Rollback scenario: Move single function back to Node.js', () => {
      const config: FeatureFlagsConfig = {
        default: 'go',
        function: {
          createPost: 'nodejs', // Rollback createPost due to issue
        },
      };

      expect(isNodejsEnabled('createPost', config)).toBe(true);
      expect(isGoEnabled('getPost', config)).toBe(true);
      expect(isGoEnabled('login', config)).toBe(true);
    });

    test('Mixed implementation for A/B testing', () => {
      // Use Rust for auth, Go for posts, Node.js for images
      const config: FeatureFlagsConfig = {
        domain: {
          posts: 'go',
          auth: 'rust',
          images: 'nodejs',
        },
      };

      // Posts domain
      expect(isGoEnabled('createPost', config)).toBe(true);
      expect(isGoEnabled('getPost', config)).toBe(true);

      // Auth domain
      expect(isRustEnabled('login', config)).toBe(true);
      expect(isRustEnabled('logout', config)).toBe(true);

      // Images domain
      expect(isNodejsEnabled('getUploadUrl', config)).toBe(true);
      expect(isNodejsEnabled('deleteImage', config)).toBe(true);
    });
  });
});
