import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: [
      'node_modules',
      'dist',
      'src/index.test.ts',
      'src/lib/pagination.test.ts',
      'src/__tests__/attestations.test.ts',
      'src/__tests__/migrations.test.ts',
      'src/__tests__/slashEvents.test.ts',
      'src/__tests__/horizonBondEvents.test.ts',
      'src/config/__tests__/config.test.ts',
      'src/clients/soroban.test.ts',
      'src/middleware/requestId.spec.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/__tests__/**',
        'src/index.ts',
        'src/index.test.ts',
        'src/lib/pagination.test.ts',
        'src/__tests__/attestations.test.ts',
        'src/__tests__/migrations.test.ts',
        'src/__tests__/slashEvents.test.ts',
        'src/__tests__/horizonBondEvents.test.ts',
        'src/config/__tests__/config.test.ts',
        'src/clients/soroban.test.ts',
        'src/middleware/requestId.spec.ts',
      ],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
})
