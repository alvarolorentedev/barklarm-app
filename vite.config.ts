import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const stripCrossorigin = () => ({
  name: 'strip-crossorigin',
  transformIndexHtml(html: string) {
    return html.replace(/ crossorigin/g, '');
  },
});

export default defineConfig({
  root: 'src/mainview',
  base: './',
  plugins: [react(), stripCrossorigin()],
  build: {
    outDir: resolve(__dirname, 'dist/mainview'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/mainview/index.html'),
      output: {
        assetFileNames: 'assets/[name][extname]',
        chunkFileNames: 'assets/[name].js',
        entryFileNames: 'index.js',
      },
    },
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      electrobun: resolve(__dirname, '.hutch/devkit/api/browser/index.ts'),
    },
  },
});
