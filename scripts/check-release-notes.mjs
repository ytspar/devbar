#!/usr/bin/env node

/**
 * Validates that every published version has a corresponding entry in release-notes.json.
 *
 * Usage:
 *   From a package directory (prepublishOnly hook):
 *     node ../../scripts/check-release-notes.mjs
 *
 *   From repo root with explicit versions (CI mode):
 *     node scripts/check-release-notes.mjs --check devbar=1.8.0 sweetlink=1.11.0
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const notesPath = resolve(repoRoot, 'packages/playground/src/release-notes.json');

const releaseNotes = JSON.parse(readFileSync(notesPath, 'utf-8'));

/** Map @ytspar/devbar → devbar, @ytspar/sweetlink → sweetlink */
function shortName(npmName) {
  return npmName.replace('@ytspar/', '');
}

const args = process.argv.slice(2);

if (args.includes('--check')) {
  // CI mode: --check devbar=1.8.0 sweetlink=1.11.0
  const pairs = args.filter((a) => a !== '--check');
  if (pairs.length === 0) {
    console.log('No packages to check.');
    process.exit(0);
  }

  let failed = false;
  for (const pair of pairs) {
    const [pkg, version] = pair.split('=');
    if (!pkg || !version) continue; // skip blank inputs
    const notes = releaseNotes[pkg];
    if (!notes || !notes[version]) {
      console.error(
        `\n  ✘ Missing release note for ${pkg} v${version}` +
          `\n    Add an entry to packages/playground/src/release-notes.json\n`
      );
      failed = true;
    } else {
      console.log(`  ✔ ${pkg} v${version}: ${notes[version]}`);
    }
  }

  if (failed) process.exit(1);
} else {
  // prepublishOnly mode: read package.json from cwd
  const pkgPath = resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const name = shortName(pkg.name);
  const version = pkg.version;

  const notes = releaseNotes[name];
  if (!notes || !notes[version]) {
    console.error(
      `\n  ✘ Missing release note for ${name} v${version}` +
        `\n    Add an entry to packages/playground/src/release-notes.json` +
        `\n    then retry publishing.\n`
    );
    process.exit(1);
  }

  console.log(`  ✔ Release note found for ${name} v${version}: ${notes[version]}`);
}
