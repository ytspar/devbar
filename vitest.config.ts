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

export default defineConfig({
  plugins: [nodeBuiltinsPlugin()],
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
