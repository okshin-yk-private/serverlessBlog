import { describe, expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '../..');

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)])
    );
  }
  return value;
}

for (const directory of ['.', 'frontend/admin']) {
  describe(`ESLint compatibility: ${directory}`, () => {
    const cwd = resolve(root, directory);
    const require = createRequire(join(cwd, 'package.json'));
    const { ESLint } = require('eslint');
    const parser = require('@typescript-eslint/parser');
    const estreeRequire = createRequire(
      require.resolve('@typescript-eslint/typescript-estree')
    );
    const minimatch = estreeRequire('minimatch');

    test('uses the repaired minimatch through the actual parser dependency', () => {
      expect(estreeRequire('minimatch/package.json').version).toBe('11.0.3');
    });

    test('preserves file selection and established rule severities', async () => {
      const eslint = new ESLint({
        cwd,
        overrideConfigFile: join(cwd, 'eslint.config.js'),
      });
      const admin = directory !== '.';
      const source = admin ? 'src/Example.tsx' : 'scripts/example.ts';
      expect(await eslint.isPathIgnored(source)).toBe(false);
      for (const file of ['node_modules/example.ts', 'dist/example.ts']) {
        expect(await eslint.isPathIgnored(file)).toBe(true);
      }
      for (const file of admin
        ? ['public/mockServiceWorker.js', 'vite.config.ts']
        : ['frontend/admin/src/App.tsx', '.claude/worktrees/a/example.ts']) {
        expect(await eslint.isPathIgnored(file)).toBe(true);
      }
      const config = await eslint.calculateConfigForFile(source);
      expect(config.rules['prettier/prettier'][0]).toBe(2);
      expect(config.rules['@typescript-eslint/no-unused-vars'][0]).toBe(
        admin ? 1 : 2
      );
      if (admin) {
        expect(config.rules['react-hooks/rules-of-hooks'][0]).toBe(2);
        expect(config.rules['react-hooks/exhaustive-deps'][0]).toBe(1);
      }
      const result = await eslint.lintText('const unused = 1;\n', {
        filePath: source,
      });
      expect(
        result[0].messages.some(
          (message: { ruleId: string }) =>
            message.ruleId === '@typescript-eslint/no-unused-vars'
        )
      ).toBe(true);
    });

    test('retains every enabled rule and option from the ESLint 9 baseline', async () => {
      const eslint = new ESLint({
        cwd,
        overrideConfigFile: join(cwd, 'eslint.config.js'),
      });
      // Captured before migration at 76ece155. Hash the complete enabled rule
      // configuration, so a preset update cannot silently remove/add rules.
      const expected =
        directory === '.'
          ? [
              '8475cf3212dab92a0fc80c53a131080a111cae1352b0e341d50b2198040ef65f',
              '8475cf3212dab92a0fc80c53a131080a111cae1352b0e341d50b2198040ef65f',
            ]
          : [
              '1bc3258f0a1ba92aaf8db4f874884def25c2a75ca1ccb649e870c96fa276ad8e',
              '5c878870d83249d7b030e12c128672ada65caf1eeae16e7ec91d6d08b6070961',
            ];
      for (const [index, file] of [
        'src/App.tsx',
        'src/example.test.tsx',
      ].entries()) {
        const config = await eslint.calculateConfigForFile(file);
        const rules = Object.fromEntries(
          Object.entries(config.rules as Record<string, unknown[]>).filter(
            ([, value]) => value[0] !== 0
          )
        );
        // v10 materializes this new false default; v9 had the same behavior.
        if (
          JSON.stringify(rules['no-constant-binary-expression']) ===
          '[2,{"checkRelationalComparisons":false}]'
        ) {
          rules['no-constant-binary-expression'] = [2];
        }
        expect(
          createHash('sha256')
            .update(JSON.stringify(canonical(rules)))
            .digest('hex')
        ).toBe(expected[index]);
      }
    });

    test('preserves glob, dotfile and ignore matching', () => {
      const cases = [
        ['src/app.tsx', '**/*.{ts,tsx}', true],
        ['src/app.css', '**/*.{ts,tsx}', false],
        ['.fixture.js', '*.js', true],
        ['src/nested/app.ts', 'src/*.ts', false],
        ['node_modules/a.ts', '**/node_modules/**', true],
      ] as const;
      for (const [file, pattern, expected] of cases) {
        expect(minimatch.minimatch(file, pattern, { dot: true })).toBe(
          expected
        );
      }
    });

    test('keeps typed project-service allowDefaultProject matching', () => {
      const fixture = mkdtempSync(join(tmpdir(), 'eslint-841-'));
      try {
        mkdirSync(join(fixture, 'src'));
        writeFileSync(join(fixture, 'src/index.ts'), 'export const value = 1;');
        writeFileSync(
          join(fixture, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: { allowJs: true },
            include: ['src/**/*'],
          })
        );
        const parse = (pattern: string) =>
          parser.parseForESLint('const value = 1;', {
            filePath: join(fixture, '.fixture.js'),
            tsconfigRootDir: fixture,
            projectService: { allowDefaultProject: [pattern] },
          });
        parser.clearCaches();
        expect(parse('*.js').services.program).toBeDefined();
        parser.clearCaches();
        expect(() => parse('other.js')).toThrow('does not match');
      } finally {
        parser.clearCaches();
        rmSync(fixture, { recursive: true, force: true });
      }
    });
  });
}
