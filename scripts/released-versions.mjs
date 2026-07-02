#!/usr/bin/env node

/**
 * Prints the packages a release-please Release PR is releasing, as
 * space-separated `<short-name>=<version>` tokens ready to feed into
 * `check-release-notes.mjs --check` (DEV-5362, Option 1: Release-PR gate).
 *
 * A Release PR bumps only the released package(s) in
 * .release-please-manifest.json, so the released set is exactly the keys
 * whose version differs from the base (main) manifest.
 *
 * Usage:
 *   node scripts/released-versions.mjs <base-manifest-path>
 *
 * where <base-manifest-path> is main's copy of the manifest, e.g.
 *   git show "origin/main:.release-please-manifest.json" > base-manifest.json
 *
 * With no base path, every entry in the head manifest is emitted (treats the
 * whole manifest as changed) — a conservative fallback.
 *
 * Manifest keys are package paths (packages/sweetlink); the release-notes
 * map and check-release-notes.mjs key on the short name (sweetlink), which is
 * the path basename.
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const headManifest = JSON.parse(
  readFileSync(resolve(repoRoot, '.release-please-manifest.json'), 'utf-8')
);

const baseArg = process.argv[2];
const baseManifest = baseArg ? JSON.parse(readFileSync(resolve(baseArg), 'utf-8')) : {};

const pairs = [];
for (const [pkgPath, version] of Object.entries(headManifest)) {
  if (baseManifest[pkgPath] !== version) {
    pairs.push(`${basename(pkgPath)}=${version}`);
  }
}

process.stdout.write(pairs.join(' '));
