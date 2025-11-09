module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.integration.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    '../../functions/**/*.ts',
    '!../../functions/**/index.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  moduleNameMapper: {
    '^/opt/nodejs/(.*)$': '<rootDir>/../../layers/common/nodejs/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        isolatedModules: false,
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(isomorphic-dompurify|dompurify)/)',
  ],
  testTimeout: 120000, // DynamoDB Local起動とテーブル作成を待つため120秒に延長
  maxWorkers: 1, // テーブル作成の競合を避けるため順次実行
};
