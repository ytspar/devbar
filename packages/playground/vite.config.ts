import { sweetlink } from '@ytspar/sweetlink/vite';
import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sweetlink()],

  // Use workspace packages directly via node_modules (symlinked by pnpm)
  resolve: {
    alias: {
      '@ytspar/devbar': resolve(__dirname, '../devbar/src'),
      // Map sweetlink browser subpaths to source (avoid pulling in Node.js code)
      '@ytspar/sweetlink/browser/consoleCapture': resolve(
        __dirname,
        '../sweetlink/src/browser/consoleCapture.ts'
      ),
      '@ytspar/sweetlink/browser/screenshotUtils': resolve(
        __dirname,
        '../sweetlink/src/browser/screenshotUtils.ts'
      ),
      '@ytspar/sweetlink/types': resolve(__dirname, '../sweetlink/src/types.ts'),
    },
  },

  // Optimize deps configuration
  optimizeDeps: {
    exclude: ['@ytspar/sweetlink'],
  },

  // Build configuration for GitHub Pages
  // Base URL is set via CLI: --base=/devbar/ for GitHub Pages
  build: {
    outDir: 'dist',
    sourcemap: true,
  },

  // Base path - can be overridden via CLI with --base
  base: process.env.VITE_BASE_URL || '/',

  // Dev server configuration
  server: {
    port: 5173,
    open: true,
  },
});
