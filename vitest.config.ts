import { builtinModules } from 'module';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Vite plugin that resolves bare Node.js built-in imports (e.g. 'fs', 'path')
 * to their 'node:' prefixed form so Vite doesn't try to resolve them as packages.
 */
function nodeBuiltinsPlugin(): Plugin {
  const builtins = new Set(builtinModules);
  return {
    name: 'resolve-node-builtins',
    enforce: 'pre',
    resolveId(source) {
      if (builtins.has(source)) {
        return { id: `node:${source}`, external: true };
      }
    },
  };
}

/**
 * Stub for the virtual:npm-timeline module used by the playground.
 * At build time, a Vite plugin fetches npm registry data; in tests, we provide empty data.
 */
function npmTimelineStub(): Plugin {
  return {
    name: 'npm-timeline-stub',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'virtual:npm-timeline') return '\0virtual:npm-timeline';
    },
    load(id) {
      if (id === '\0virtual:npm-timeline') return 'export default {};';
    },
  };
}

export default defineConfig({
  plugins: [nodeBuiltinsPlugin(), npmTimelineStub()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/index.ts', '**/node_modules/**'],
    },
  },
});
