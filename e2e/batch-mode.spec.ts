/**
 * Multi-capture JSON-stdin batch mode.
 *
 * `sweetlink --json` reads {action,captures:[...]} from stdin, runs each
 * capture, and emits an aggregate JSON envelope on stdout. Mirrors the
 * shape proof's batch invocation supports.
 */

import { expect, test } from '@playwright/test';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CLI_PATH } from './_harness.js';

interface BatchResult {
  ok: boolean;
  duration?: number;
  captures?: Array<{
    ok: boolean;
    mode?: string;
    label?: string;
    data?: Record<string, unknown>;
    error?: string;
    duration?: number;
  }>;
  error?: string;
}

/** Pipe a JSON document into `sweetlink --json` and capture the result. */
function runBatch(
  cwd: string,
  json: string
): Promise<{ exitCode: number; result: BatchResult; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, '--json'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.stdin?.end(json);
    child.on('close', (code) => {
      let parsed: BatchResult = { ok: false };
      try {
        parsed = JSON.parse(stdout);
      } catch {
        /* malformed */
      }
      resolve({ exitCode: code ?? 0, result: parsed, stderr });
    });
  });
}

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test('batch: runs multiple term captures and aggregates JSON results', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-batch-'));
  try {
    const { exitCode, result } = await runBatch(
      cwd,
      JSON.stringify({
        action: 'capture',
        captures: [
          { mode: 'term', label: 'first', command: "printf 'first\\n'" },
          { mode: 'term', label: 'second', command: "printf 'second\\n'" },
        ],
      })
    );
    expect(exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.captures).toHaveLength(2);
    expect(result.captures![0]!.ok).toBe(true);
    expect(result.captures![0]!.mode).toBe('term');
    expect(result.captures![0]!.label).toBe('first');
    expect(result.captures![1]!.label).toBe('second');
    // Each capture produced a .cast and a .html
    const data1 = result.captures![0]!.data as { castPath: string; playerPath: string };
    expect(fs.existsSync(data1.castPath)).toBe(true);
    expect(fs.existsSync(data1.playerPath)).toBe(true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('batch: per-capture error propagates to ok=false on the envelope', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-batch-'));
  try {
    const { exitCode, result } = await runBatch(
      cwd,
      JSON.stringify({
        action: 'capture',
        captures: [
          { mode: 'term', label: 'good', command: "printf 'ok\\n'" },
          { mode: 'unknown-mode', label: 'bad' }, // intentionally invalid
        ],
      })
    );
    expect(exitCode).toBe(1); // overall failure
    expect(result.ok).toBe(false);
    expect(result.captures).toHaveLength(2);
    expect(result.captures![0]!.ok).toBe(true);
    expect(result.captures![1]!.ok).toBe(false);
    expect(result.captures![1]!.error).toMatch(/Unknown capture mode/i);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('batch: malformed JSON on stdin returns a clear error envelope', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-batch-'));
  try {
    const { exitCode, result } = await runBatch(cwd, '{ this is not json');
    expect(exitCode).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/parse stdin as JSON/i);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('batch: missing captures array returns a clear error envelope', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-batch-'));
  try {
    const { exitCode, result } = await runBatch(cwd, JSON.stringify({ action: 'capture' }));
    expect(exitCode).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/captures/i);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('batch: empty captures array returns ok=true with no entries', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-batch-'));
  try {
    const { exitCode, result } = await runBatch(
      cwd,
      JSON.stringify({
        action: 'capture',
        captures: [],
      })
    );
    expect(exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.captures).toEqual([]);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
