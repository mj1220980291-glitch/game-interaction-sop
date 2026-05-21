import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'e2e'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      all: true,
      include: [
        'src/dsl/**/*.ts',
        'src/parser/**/*.ts',
        'src/planner/**/*.ts'
      ],
      exclude: [
        'src/**/index.ts',
        'src/**/*.d.ts'
      ],
      thresholds: {
        // Lines / functions / statements track production value tightly; branches
        // include defensive `??` / fallback arms whose extra tests add noise
        // rather than safety. We hold lines/funcs at 90 and branches at 80.
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 80
      }
    }
  }
});
