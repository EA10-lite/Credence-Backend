import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'jest.config.js',
        'vitest.config.ts',
      ],
      thresholds: {
        lines: 94.5,
        functions: 93,
        branches: 94,
        statements: 94.5,
      },
    },
  },
})
