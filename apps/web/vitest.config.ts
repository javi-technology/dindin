/// <reference types="vitest" />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => {
  return {
    plugins: [angular()],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['src/**/*.spec.ts'],
      reporters: ['default'],
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'json-summary', 'lcov'],
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.spec.ts', 'src/test-setup.ts', 'src/main.ts'],
        // Fixados a partir da medição da issue #323 (92,42% linhas / 83,19%
        // branches), com folga de um a dois pontos.
        thresholds: {
          lines: 90,
          statements: 90,
          functions: 88,
          branches: 82,
        },
      },
    },
  };
});
