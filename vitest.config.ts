import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: './tests-setup.ts',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/*.test.{ts,tsx}'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 78,
        statements: 78,
        functions: 78,
        branches: 86,
        'src/core/**/*.ts': {
          lines: 90,
          statements: 90,
          functions: 90,
          branches: 85,
        },
      },
    },
    environment: 'jsdom',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/src-tauri/**',
      '**/e2e/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
});
