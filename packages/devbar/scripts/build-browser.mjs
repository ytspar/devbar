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

const shared = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  logLevel: "warning",
  metafile: true,
  conditions: ["browser", "import", "default"],
};

const apiResult = await build({
  ...shared,
  entryPoints: [join(pkgRoot, "dist/index.js")],
  outfile: join(browserDir, "devbar.js"),
});

const autoResult = await build({
  ...shared,
  entryPoints: [autoEntry],
  outfile: join(browserDir, "devbar.auto.js"),
});

rmSync(autoEntry, { force: true });

function size(result) {
  const out = result.metafile?.outputs ?? {};
  const first = Object.keys(out)[0];
  return first ? (out[first].bytes / 1024).toFixed(1) : "?";
}

console.log(`[build-browser] dist/browser/devbar.js (${size(apiResult)} KB)`);
console.log(`[build-browser] dist/browser/devbar.auto.js (${size(autoResult)} KB)`);
