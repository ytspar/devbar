/**
 * --app namespace + run-hierarchy directory layout.
 *
 * `sweetlink term/sim --app <name>` writes artifacts to
 *   .sweetlink/<app>/<YYYYMMDD>/<run>/<kind>/...
 * Without `--app`, falls back to the historical flat layout
 *   .sweetlink/<kind>/...
 *
 * `--run <id>` overrides the auto-generated HHMM-SS run id.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cli } from './_harness.js';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

function ymd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

test('term --app groups artifacts under <app>/<date>/<run>/term', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-app-'));
  try {
    const result = await cli(
      ['term', '--app', 'demo-app', '--run', 'pinned', '--label', 'first', "printf 'x\\n'"],
      cwd
    );
    expect(result.exitCode, result.stderr).toBe(0);

    const expectedDir = path.join(cwd, '.sweetlink', 'demo-app', ymd(), 'pinned', 'term');
    expect(fs.existsSync(expectedDir)).toBe(true);
    const files = fs.readdirSync(expectedDir);
    expect(files.some((f) => f.endsWith('.cast'))).toBe(true);
    expect(files.some((f) => f.endsWith('.html'))).toBe(true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('term without --app falls back to flat .sweetlink/term layout', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-flat-'));
  try {
    const result = await cli(['term', '--label', 'first', "printf 'x\\n'"], cwd);
    expect(result.exitCode, result.stderr).toBe(0);

    const flatDir = path.join(cwd, '.sweetlink', 'term');
    expect(fs.existsSync(flatDir)).toBe(true);
    expect(fs.readdirSync(flatDir).length).toBeGreaterThan(0);

    // No app/date hierarchy was created
    const sweetlinkContents = fs.readdirSync(path.join(cwd, '.sweetlink'));
    expect(sweetlinkContents).not.toContain(ymd());
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('SWEETLINK_RUN env overrides the auto-generated run id', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-runenv-'));
  try {
    // Use a temp Node process where we set SWEETLINK_RUN before invoking the CLI.
    // The cli() helper inherits process.env, so we wrap by setting env via
    // a bash one-liner — easier than monkey-patching.
    const { spawn } = await import('child_process');
    const { CLI_PATH } = await import('./_harness.js');
    const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>(
      (resolve) => {
        const child = spawn(
          'node',
          [CLI_PATH, 'term', '--app', 'env-test', '--label', 'first', "printf 'x\\n'"],
          {
            cwd,
            env: { ...process.env, SWEETLINK_RUN: 'fixed-run-id' },
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (d) => {
          stdout += d.toString();
        });
        child.stderr?.on('data', (d) => {
          stderr += d.toString();
        });
        child.on('close', (code) => resolve({ exitCode: code ?? 0, stdout, stderr }));
      }
    );
    expect(result.exitCode, result.stderr).toBe(0);

    const expectedDir = path.join(cwd, '.sweetlink', 'env-test', ymd(), 'fixed-run-id', 'term');
    expect(fs.existsSync(expectedDir)).toBe(true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('--app does NOT trigger discoverServer for term (no WS dep)', async () => {
  // Regression guard: a previous version threw "No server matching <app>"
  // because the top-level --app handler tried to discover a running WS server.
  // term/sim are artifact-producing commands and shouldn't require a server.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-noserver-'));
  try {
    const result = await cli(
      ['term', '--app', 'no-such-server-anywhere', '--run', 'r1', "printf 'x\\n'"],
      cwd
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout + result.stderr).not.toMatch(/No server matching/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
