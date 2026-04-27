/**
 * Ruler / measure — TDD Suite
 *
 * `sweetlink ruler` measures elements via Playwright and (optionally) writes
 * an annotated screenshot. Pure daemon-less path through ruler.ts.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { cli, freePort, pngDimensions } from './_harness.js';

const ARTIFACT_DIR = '/tmp/sweetlink-e2e-artifacts/ruler';

test.describe.configure({ mode: 'serial', timeout: 60_000 });

function rulerPage(): string {
  return `<!DOCTYPE html><html><body style="margin:0">
<header id="hdr" style="height:60px;background:#333"></header>
<div class="card" style="margin:20px;padding:20px;border:1px solid #ddd;height:80px"></div>
</body></html>`;
}

async function withFixture(fn: (url: string, cwd: string) => Promise<void>): Promise<void> {
  const port = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ruler-'));
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(rulerPage());
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  try {
    await fn(`http://127.0.0.1:${port}/`, tmp);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test('ruler --selector measures element bounds + writes overlay PNG', async () => {
  await withFixture(async (url, cwd) => {
    const out = path.join(cwd, 'ruler.png');
    const result = await cli(
      ['ruler', '--url', url, '--selector', '#hdr', '--selector', '.card', '--output', out],
      cwd
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('#hdr');
    expect(result.stdout).toContain('.card');
    expect(result.stdout).toMatch(/\d+×\d+/); // dim summary
    expect(fs.existsSync(out)).toBe(true);
    const png = fs.readFileSync(out);
    expect(png.subarray(0, 4).toString('hex')).toBe('89504e47');
    const dims = pngDimensions(png);
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.copyFileSync(out, path.join(ARTIFACT_DIR, 'ruler-overlay.png'));
  });
});

test('ruler --format json emits parseable JSON with element coords', async () => {
  await withFixture(async (url, cwd) => {
    const result = await cli(
      ['ruler', '--url', url, '--selector', '#hdr', '--format', 'json'],
      cwd
    );
    expect(result.exitCode, result.stderr).toBe(0);
    // JSON starts after the leading [Sweetlink] log lines.
    const jsonStart = result.stdout.indexOf('{');
    expect(jsonStart).toBeGreaterThan(-1);
    const parsed = JSON.parse(result.stdout.slice(jsonStart));
    expect(parsed.results).toBeDefined();
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results[0].elements[0].centerY).toBe(30); // 60px header → center @ 30
  });
});

test('ruler reports alignment delta between two selectors', async () => {
  await withFixture(async (url, cwd) => {
    const result = await cli(
      ['ruler', '--url', url, '--selector', '#hdr', '--selector', '.card'],
      cwd
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/Alignment.*Δ[xy]=/);
  });
});
