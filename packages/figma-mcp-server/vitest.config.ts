import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'e2e'],
    environment: 'node',
    globals: false,
    env: {
      // Tests must not inherit a developer's ~/.game-interaction-sop/template.json.
      GISOP_TEMPLATE_CONFIG: 'off',
      // Same for the pack lookup: `~/.game-interaction-sop/templates/default.json`
      // exists on a configured machine and would silently turn every legacy
      // render test into a parts render. Pack tests set the variable themselves.
      GISOP_TEMPLATE_PACK: 'off'
    },
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      all: true,
      include: [
        'src/v2/**/*.ts'
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
