#!/usr/bin/env node
/**
 * Browser-bundle build for @ytspar/devbar.
 *
 * Produces self-contained ESM files in dist/browser/ so consumers without a
 * frontend bundler (vanilla Node servers, static hosts, etc.) can serve devbar
 * directly from node_modules. Resolves bare imports (@ytspar/sweetlink/...,
 * axe-core, html2canvas-pro) into a single file.
 *
 * Outputs:
 *   - dist/browser/devbar.js       — re-exports `initGlobalDevBar` and the
 *                                    public API. Use:
 *                                      <script type="module">
 *                                        import { initGlobalDevBar } from
 *                                          "/path/to/devbar.js";
 *                                        initGlobalDevBar();
 *                                      </script>
 *   - dist/browser/devbar.auto.js  — auto-initializes on DOMContentLoaded.
 *                                    Use:
 *                                      <script type="module"
 *                                        src="/path/to/devbar.auto.js"></script>
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const browserDir = join(pkgRoot, "dist", "browser");
mkdirSync(browserDir, { recursive: true });

const autoEntry = join(browserDir, ".auto-entry.mjs");
writeFileSync(
  autoEntry,
  `import { initGlobalDevBar } from "${join(pkgRoot, "dist/index.js")}";
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initGlobalDevBar());
  } else {
    initGlobalDevBar();
  }
}
export { initGlobalDevBar };
`,
  "utf8",
);

// Single build with code-splitting so the two entries SHARE chunks and, more
// importantly, the dynamic import()s of the heavy deps (axe-core ~570KB,
// html2canvas-pro ~200KB — both already `import()`ed lazily in source) are
// emitted as on-demand chunks instead of being inlined into the eager entry.
// Without `splitting`, esbuild inlined them, defeating the lazy-load and leaving
// a ~992KB eager bundle. With it, the entry drops to ~220KB and the heavy chunks
// load only when the a11y-audit / screenshot features are invoked.
//
// Trade-off: dist/browser/ now ships the entry files PLUS chunks/*. No-bundler
// consumers serving from node_modules must serve the whole dist/browser/ dir
// (the entry fetches its chunks by relative URL), not a single copied file.
const result = await build({
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  logLevel: "warning",
  metafile: true,
  conditions: ["browser", "import", "default"],
  splitting: true,
  entryPoints: {
    devbar: join(pkgRoot, "dist/index.js"),
    "devbar.auto": autoEntry,
  },
  outdir: browserDir,
  entryNames: "[name]",
  chunkNames: "chunks/[name]-[hash]",
});

rmSync(autoEntry, { force: true });

function sizeOf(outputs, suffix) {
  const key = Object.keys(outputs).find((k) => k.endsWith(suffix));
  return key ? (outputs[key].bytes / 1024).toFixed(1) : "?";
}

const outputs = result.metafile?.outputs ?? {};
const chunkBytes = Object.entries(outputs)
  .filter(([k]) => k.includes("/chunks/"))
  .reduce((sum, [, v]) => sum + v.bytes, 0);

console.log(`[build-browser] dist/browser/devbar.js (${sizeOf(outputs, "browser/devbar.js")} KB eager entry)`);
console.log(`[build-browser] dist/browser/devbar.auto.js (${sizeOf(outputs, "browser/devbar.auto.js")} KB eager entry)`);
console.log(`[build-browser] on-demand chunks: ${(chunkBytes / 1024).toFixed(1)} KB (loaded only when their feature runs)`);
