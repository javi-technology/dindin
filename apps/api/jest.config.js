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
  coverageReporters: ['text-summary', 'json-summary', 'lcov'],
  // Fixados a partir da medição da issue #323 (96,42% linhas / 89,29%
  // branches), com folga de um a dois pontos: o limite existe para acusar
  // queda real, não variação normal de um PR.
  coverageThreshold: {
    global: { lines: 95, statements: 94, functions: 95, branches: 88 },
  },
};
