import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/__mocks__/**', '**/*.d.ts', 'src/assets.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
    pool: 'threads',
    projects: [
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['tests/main/**/*.test.ts'],
          setupFiles: ['./tests/setup.main.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/main/**/*.ts'],
            exclude: ['src/main/**/*.d.ts'],
          },
        },
      },
      {
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/renderer/**/*.ts'],
            exclude: ['src/renderer/**/*.d.ts'],
          },
        },
      },
    ],
  },
});
