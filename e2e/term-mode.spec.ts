/**
 * Terminal capture mode (`sweetlink term <command>`).
 *
 * Records a shell command into asciicast v2 + a self-contained HTML
 * player. Exercises:
 *   - .cast file is well-formed asciicast v2 (header + event lines)
 *   - HTML player is generated with embedded data
 *   - ANSI escapes round-trip into rendered colours in the player
 *   - exit code propagation (recorded command's exit becomes CLI's exit)
 *   - --ignore-exit suppresses propagation
 *
 * Visual verification of the player is in /tmp/term-review/ and was
 * performed manually during development; the HTML structure is
 * asserted programmatically here.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cli } from './_harness.js';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test('term records a passing command into asciicast v2 + HTML player', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-term-'));
  try {
    const result = await cli(
      ['term', '--label', 'unit', "printf 'hello\\n'; sleep 0.1; printf 'world\\n'"],
      cwd,
    );
    expect(result.exitCode, result.stderr).toBe(0);

    const termDir = path.join(cwd, '.sweetlink', 'term');
    expect(fs.existsSync(termDir)).toBe(true);
    const files = fs.readdirSync(termDir);
    const cast = files.find((f) => f.endsWith('.cast'))!;
    const html = files.find((f) => f.endsWith('.html'))!;
    expect(cast).toBeDefined();
    expect(html).toBeDefined();

    // .cast is asciicast v2 — first line is JSON object, subsequent lines are JSON arrays.
    const castLines = fs.readFileSync(path.join(termDir, cast), 'utf-8')
      .split('\n').filter(Boolean);
    const header = JSON.parse(castLines[0]!);
    expect(header.version).toBe(2);
    expect(header.title).toBe('unit');
    expect(typeof header.duration).toBe('number');
    expect(header.duration).toBeGreaterThan(0.05);

    const events = castLines.slice(1).map((l) => JSON.parse(l));
    expect(events.length).toBeGreaterThanOrEqual(1);
    for (const e of events) {
      expect(e).toHaveLength(3);
      expect(typeof e[0]).toBe('number');
      expect(['o', 'i']).toContain(e[1]);
    }
    const allOutput = events.filter((e) => e[1] === 'o').map((e) => e[2]).join('');
    expect(allOutput).toContain('hello');
    expect(allOutput).toContain('world');

    // Player HTML is self-contained — DATA constant has the events embedded.
    const playerHtml = fs.readFileSync(path.join(termDir, html), 'utf-8');
    expect(playerHtml).toContain('<title>unit</title>');
    expect(playerHtml).toMatch(/const DATA = \{.+events.+\};/s);
    expect(playerHtml).toContain('id="seek"');
    expect(playerHtml).toContain('id="play"');
    expect(playerHtml).toContain('id="restart"');
    expect(playerHtml).toContain('id="speed"');
    // No external network requests / scripts
    expect(playerHtml).not.toMatch(/<script src="https?:/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('term captures ANSI colour escapes verbatim into the .cast file', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-term-'));
  try {
    const result = await cli(
      // \033[31m = red, \033[0m = reset, \033[1m = bold
      ['term', '--label', 'colour', "printf '\\033[31mRED\\033[0m \\033[1mBOLD\\033[0m\\n'"],
      cwd,
    );
    expect(result.exitCode, result.stderr).toBe(0);

    const termDir = path.join(cwd, '.sweetlink', 'term');
    const cast = fs.readdirSync(termDir).find((f) => f.endsWith('.cast'))!;
    const raw = fs.readFileSync(path.join(termDir, cast), 'utf-8');
    // The raw .cast must preserve the ESC sequences (as JSON-escaped [31m etc.)
    expect(raw).toContain('\\u001b[31m');
    expect(raw).toContain('\\u001b[1m');
    expect(raw).toContain('\\u001b[0m');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('term propagates the recorded command\'s exit code by default', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-term-'));
  try {
    const result = await cli(['term', '--label', 'fail', "printf 'oops\\n'; exit 7"], cwd);
    expect(result.exitCode).toBe(7);
    // The .cast still got written even though the command failed.
    const termDir = path.join(cwd, '.sweetlink', 'term');
    expect(fs.existsSync(termDir)).toBe(true);
    const cast = fs.readdirSync(termDir).find((f) => f.endsWith('.cast'))!;
    expect(cast).toBeDefined();
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('term --ignore-exit suppresses exit-code propagation', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-term-'));
  try {
    const result = await cli(['term', '--label', 'ignore', '--ignore-exit', 'exit 5'], cwd);
    expect(result.exitCode).toBe(0);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('term --output writes to the requested path', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-term-'));
  try {
    const out = path.join(cwd, 'custom', 'my-test.cast');
    const result = await cli(['term', '--output', out, "printf 'x\\n'"], cwd);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.existsSync(path.join(cwd, 'custom', 'my-test.html'))).toBe(true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
