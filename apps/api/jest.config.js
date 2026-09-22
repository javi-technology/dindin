/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup-supertest.js'],
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
    // jose@6 (via firebase-admin → jwks-rsa) é ESM-only; o Jest só suporta
    // require(esm) no Node 24.9+, então transpila para CommonJS nos testes.
    '/node_modules/jose/.+\\.js$': [
      'ts-jest',
      {
        tsconfig: { allowJs: true, module: 'commonjs', isolatedModules: true },
      },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!jose/)'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
};
