import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: './tests-setup.ts',
    coverage: {
      reporter: ['text', 'lcov'],
    },
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/.hutch/**', '**/dist/**'],
  },
});
