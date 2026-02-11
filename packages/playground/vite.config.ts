import { sweetlink } from '@ytspar/sweetlink/vite';
import { resolve } from 'path';
import { defineConfig } from 'vite';

const PROD_ORIGIN = 'https://devbar.dev';

/**
 * Rewrite relative og:image / twitter:image URLs to absolute during production
 * builds. In dev, relative paths resolve against localhost so images load locally.
 * Social media crawlers require absolute URLs for unfurl previews.
 */
function ogAbsoluteUrls() {
  let base = '/';
  return {
    name: 'og-absolute-urls',
    configResolved(config: { base: string }) {
      base = config.base;
    },
    transformIndexHtml(html: string) {
      if (process.env.NODE_ENV !== 'production') return html;
      return html.replace(
        /(<meta\s+(?:property|name)="(?:og|twitter):image"\s+content=")([^"]+)(")/g,
        (_: string, before: string, url: string, after: string) => {
          if (url.startsWith('http')) return before + url + after;
          return before + PROD_ORIGIN + base + url + after;
        }
      );
    },
  };
}

export default defineConfig({
  plugins: [sweetlink(), ogAbsoluteUrls()],

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
