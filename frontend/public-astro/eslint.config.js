import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import astro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';

// Public pages, shared Astro components, and their browser scripts are one scope.
// Keep the admin React configuration independent.
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.astro/**',
      '**/test-results/**',
    ],
  },
  { ...js.configs.recommended, files: ['**/*.{ts,astro}', '**/*.astro/*.js'] },
  ...astro.configs.recommended,
  {
    files: ['**/*.ts', '**/*.astro'],
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off', // Astro check / TypeScript owns global/type resolution.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  { files: ['**/*.ts'], languageOptions: { parser: tsParser } },
  {
    files: ['**/*.astro'],
    languageOptions: { parserOptions: { parser: tsParser } },
  },
  {
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  prettier,
];
