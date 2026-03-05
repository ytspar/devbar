#!/usr/bin/env node
/**
 * Setup script to symlink shared Claude context and skills to the consuming project.
 *
 * Can be run directly (`node scripts/setup-claude-context.mjs`) or via CLI (`pnpm sweetlink setup`).
 *
 * Creates relative symlinks so they work across different environments.
 *
 * What gets linked:
 *   - .claude/context/  ← context files from this package's claude-context/
 *   - .claude/skills/   ← skill directories from this package's claude-skills/
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Find the consuming project's root (where node_modules is)
// We're at: node_modules/@ytspar/sweetlink/scripts/
const packageRoot = join(__dirname, '..');
const nodeModules = join(packageRoot, '..', '..', '..');
const projectRoot = join(nodeModules, '..');

/**
 * Create a relative symlink, skipping if already correct.
 * Won't overwrite non-symlink files.
 */
function linkOne(sourcePath, targetPath, label) {
  const targetDir = dirname(targetPath);
  const relativePath = relative(targetDir, sourcePath);

  if (existsSync(targetPath) || lstatSync(targetPath, { throwIfNoEntry: false })) {
    try {
      const currentLink = readlinkSync(targetPath);
      if (currentLink === relativePath) {
        return; // Already correct
      }
      // Remove incorrect symlink
      unlinkSync(targetPath);
    } catch {
      // Not a symlink — don't overwrite user's files
      console.log(`  [skip] ${label} — file exists (not a symlink)`);
      return;
    }
  }

  try {
    symlinkSync(relativePath, targetPath);
    console.log(`  [link] ${label}`);
  } catch (err) {
    console.error(`  [error] ${label} — ${err.message}`);
  }
}

function setupContext(claudeDir) {
  const sourceDir = join(packageRoot, 'claude-context');
  if (!existsSync(sourceDir)) return;

  const targetDir = join(claudeDir, 'context');
  mkdirSync(targetDir, { recursive: true });

  const files = readdirSync(sourceDir).filter((f) => f.endsWith('.md'));
  if (files.length === 0) return;

  console.log('[@ytspar/sweetlink] Setting up Claude context symlinks...');
  for (const file of files) {
    linkOne(join(sourceDir, file), join(targetDir, file), file);
  }
}

function setupSkills(claudeDir) {
  const sourceDir = join(packageRoot, 'claude-skills');
  if (!existsSync(sourceDir)) return;

  const targetDir = join(claudeDir, 'skills');
  mkdirSync(targetDir, { recursive: true });

  // Each subdirectory in claude-skills/ is a skill
  const skills = readdirSync(sourceDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (skills.length === 0) return;

  console.log('[@ytspar/sweetlink] Setting up Claude skill symlinks...');

  // If .claude/skills is itself a symlink (e.g. to a shared tools repo),
  // we can't add entries inside it. Warn and provide instructions.
  try {
    const stat = lstatSync(targetDir);
    if (stat.isSymbolicLink()) {
      const linkTarget = readlinkSync(targetDir);
      console.log(`  [info] .claude/skills is a symlink → ${linkTarget}`);
      console.log(
        `  [info] Skills from @ytspar/sweetlink should be symlinked inside that directory.`
      );
      console.log(
        `  [info] Run: cd ${linkTarget} && ln -sf ${relative(linkTarget, sourceDir)}/<skill> .`
      );
      return;
    }
  } catch {
    // Doesn't exist yet, will be created above
  }

  for (const skill of skills) {
    linkOne(join(sourceDir, skill), join(targetDir, skill), `skills/${skill}`);
  }
}

function setup() {
  // Skip if running inside the devbar repo itself (development)
  if (projectRoot.includes('ytspar/devbar')) {
    console.log('[@ytspar/sweetlink] Skipping setup (running inside devbar repo)');
    return;
  }

  const claudeDir = join(projectRoot, '.claude');
  if (!existsSync(claudeDir)) {
    // Not a Claude Code project, skip silently
    return;
  }

  setupContext(claudeDir);
  setupSkills(claudeDir);
}

setup();
