module.exports = {
  root: false, // Use root config as base
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    'no-console': 'off', // CDK deployment logs
    '@typescript-eslint/no-require-imports': 'off',
  },
  ignorePatterns: ['node_modules/', 'cdk.out/', '*.d.ts', '*.js', 'bin/'],
};
