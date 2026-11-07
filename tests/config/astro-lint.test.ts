import { describe, expect, test } from 'bun:test';
import { ESLint } from 'eslint';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../..');
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: resolve(root, 'frontend/public-astro/eslint.config.js'),
});

describe('public Astro lint coverage', () => {
  test('checks TypeScript and shared Astro component frontmatter and browser scripts', async () => {
    for (const [file, source] of [
      ['src/lib/fixture.ts', 'const unused = 1;'],
      [
        'src/components/Fixture.astro',
        '---\nconst unused: number = 1;\n---\n<p>Fixture</p>',
      ],
      ['src/components/Fixture.astro', '<script>const unused = 1;</script>'],
    ]) {
      const results = await eslint.lintText(source, {
        filePath: `frontend/public-astro/${file}`,
      });
      expect(
        results.some((result) =>
          result.messages.some((message) =>
            /no-unused-vars/.test(message.ruleId ?? '')
          )
        )
      ).toBe(true);
      expect(results.some((result) => result.fatalErrorCount > 0)).toBe(false);
    }
  });

  test('rejects conflicting template directives and ignores generated output', async () => {
    const results = await eslint.lintText(
      '<p set:text={"first"} set:html={"second"} />',
      { filePath: 'frontend/public-astro/src/components/Fixture.astro' }
    );
    expect(
      results.some((result) =>
        result.messages.some(
          (message) => message.ruleId === 'astro/no-conflict-set-directives'
        )
      )
    ).toBe(true);
    for (const file of [
      'dist/page.astro',
      '.astro/content.d.ts',
      'node_modules/package/source.ts',
    ]) {
      expect(await eslint.isPathIgnored(`frontend/public-astro/${file}`)).toBe(
        true
      );
    }
  });
});
