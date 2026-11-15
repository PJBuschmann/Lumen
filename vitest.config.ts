import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'sim/**/*.test.ts'],
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts'],
      exclude: ['src/engine/**/*.test.ts', 'src/engine/types.ts'],
      reporter: ['text-summary', 'text', 'html'],
      reportsDirectory: 'coverage',
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
