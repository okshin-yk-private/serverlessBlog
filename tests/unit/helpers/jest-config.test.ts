/**
 * Jest Configuration Test
 *
 * Requirement R40: Lambda関数のテストカバレッジを100%にする
 * Requirement R41: フロントエンドのテストカバレッジを100%にする
 * Requirement R45: CI/CDパイプラインでテストを自動実行する
 */

import * as path from 'path';
import * as fs from 'fs';

describe('Jest Configuration', () => {
  describe('Unit Test Configuration', () => {
    let config: any;

    beforeAll(() => {
      const configPath = path.join(__dirname, '../jest.config.js');
      delete require.cache[require.resolve(configPath)];
      config = require(configPath);
    });

    test('should enforce 100% coverage threshold for branches', () => {
      expect(config.coverageThreshold).toBeDefined();
      expect(config.coverageThreshold.global).toBeDefined();
      expect(config.coverageThreshold.global.branches).toBe(100);
    });

    test('should enforce 100% coverage threshold for functions', () => {
      expect(config.coverageThreshold.global.functions).toBe(100);
    });

    test('should enforce 100% coverage threshold for lines', () => {
      expect(config.coverageThreshold.global.lines).toBe(100);
    });

    test('should enforce 100% coverage threshold for statements', () => {
      expect(config.coverageThreshold.global.statements).toBe(100);
    });

    test('should generate HTML coverage report', () => {
      expect(config.coverageReporters).toBeDefined();
      expect(config.coverageReporters).toContain('html');
    });

    test('should generate JSON coverage report', () => {
      expect(config.coverageReporters).toContain('json');
    });

    test('should generate LCOV coverage report', () => {
      expect(config.coverageReporters).toContain('lcov');
    });

    test('should generate text summary coverage report', () => {
      expect(config.coverageReporters).toContain('text');
    });

    test('should collect coverage from Lambda functions', () => {
      expect(config.collectCoverageFrom).toBeDefined();
      expect(config.collectCoverageFrom).toContain('functions/**/*.ts');
    });

    test('should collect coverage from Layer utilities', () => {
      expect(config.collectCoverageFrom).toContain(
        'layers/common/nodejs/**/*.ts'
      );
    });

    test('should exclude index.ts files from coverage', () => {
      expect(config.collectCoverageFrom).toContain('!functions/**/index.ts');
    });

    test('should exclude TypeScript declaration files from coverage', () => {
      expect(config.collectCoverageFrom).toContain('!**/*.d.ts');
    });

    test('should exclude node_modules from coverage', () => {
      expect(config.collectCoverageFrom).toContain('!**/node_modules/**');
    });

    test('should specify coverage directory', () => {
      expect(config.coverageDirectory).toBeDefined();
      expect(config.coverageDirectory).toContain('coverage');
    });
  });

  describe('Infrastructure Test Configuration', () => {
    let config: any;

    beforeAll(() => {
      const configPath = path.join(
        __dirname,
        '../../../infrastructure/jest.config.js'
      );
      delete require.cache[require.resolve(configPath)];
      config = require(configPath);
    });

    test('should enforce 100% coverage threshold for CDK stacks - branches', () => {
      expect(config.coverageThreshold).toBeDefined();
      expect(config.coverageThreshold.global).toBeDefined();
      expect(config.coverageThreshold.global.branches).toBe(100);
    });

    test('should enforce 100% coverage threshold for CDK stacks - functions', () => {
      expect(config.coverageThreshold.global.functions).toBe(100);
    });

    test('should enforce 100% coverage threshold for CDK stacks - lines', () => {
      expect(config.coverageThreshold.global.lines).toBe(100);
    });

    test('should enforce 100% coverage threshold for CDK stacks - statements', () => {
      expect(config.coverageThreshold.global.statements).toBe(100);
    });

    test('should generate HTML coverage report', () => {
      expect(config.coverageReporters).toBeDefined();
      expect(config.coverageReporters).toContain('html');
    });

    test('should generate JSON coverage report', () => {
      expect(config.coverageReporters).toContain('json');
    });

    test('should generate LCOV coverage report', () => {
      expect(config.coverageReporters).toContain('lcov');
    });

    test('should collect coverage from infrastructure lib directory', () => {
      expect(config.collectCoverageFrom).toBeDefined();
      expect(config.collectCoverageFrom).toContain('<rootDir>/lib/**/*.ts');
    });

    test('should exclude test files from coverage', () => {
      expect(config.collectCoverageFrom).toContain('!<rootDir>/test/**');
    });

    test('should exclude TypeScript declaration files from coverage', () => {
      expect(config.collectCoverageFrom).toContain('!**/*.d.ts');
    });

    test('should specify coverage directory', () => {
      expect(config.coverageDirectory).toBeDefined();
      expect(config.coverageDirectory).toContain('coverage');
    });
  });

  describe('Package.json scripts', () => {
    test('unit tests package.json should have coverage script', () => {
      const pkgPath = path.join(__dirname, '../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      expect(pkg.scripts).toBeDefined();
      expect(pkg.scripts['test:coverage']).toBeDefined();
      expect(pkg.scripts['test:coverage']).toContain('jest --coverage');
    });

    test('infrastructure package.json should have coverage script', () => {
      const pkgPath = path.join(
        __dirname,
        '../../../infrastructure/package.json'
      );
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      expect(pkg.scripts).toBeDefined();
      expect(pkg.scripts['test:coverage']).toBeDefined();
      expect(pkg.scripts['test:coverage']).toContain('jest --coverage');
    });
  });

  describe('Istanbul Integration', () => {
    test('unit tests should use Istanbul for detailed metrics', () => {
      const configPath = path.join(__dirname, '../jest.config.js');
      delete require.cache[require.resolve(configPath)];
      const config = require(configPath);

      // Istanbul is integrated through Jest coverage
      expect(config.collectCoverageFrom).toBeDefined();
      expect(config.coverageReporters).toBeDefined();
      expect(config.coverageThreshold).toBeDefined();
    });

    test('infrastructure tests should use Istanbul for detailed metrics', () => {
      const configPath = path.join(
        __dirname,
        '../../../infrastructure/jest.config.js'
      );
      delete require.cache[require.resolve(configPath)];
      const config = require(configPath);

      // Istanbul is integrated through Jest coverage
      expect(config.collectCoverageFrom).toBeDefined();
      expect(config.coverageReporters).toBeDefined();
      expect(config.coverageThreshold).toBeDefined();
    });
  });
});
