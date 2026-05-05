// @vitest-environment node

/**
 * Evidence Module Tests
 *
 * `uploadEvidence` shells out to `gh pr comment`; we don't run that in
 * unit tests. Instead we test the *body* the function would build — by
 * mocking execFileSync and capturing the body argument. That gives us:
 *
 *   1. The comment includes the session id, duration, action count, and
 *     error counts (the four things a reviewer scans first).
 *   2. The action timeline table renders correctly when commands exist
 *     and is omitted when empty.
 *   3. A `gh` CLI failure is rewrapped with an actionable error message
 *     ("Ensure `gh` CLI is installed and authenticated").
 *
 * `captureTerminal` is platform-dependent (subprocess + pty) — we run
 * a minimal happy path against `node -e` so we don't depend on bash.
 */

import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    execFileSync: vi.fn(),
  };
});

import { execFileSync } from 'child_process';
import { captureTerminal, uploadEvidence } from './evidence.js';
import type { SessionManifest } from './session.js';

const execMock = vi.mocked(execFileSync);

let tmp: string;

beforeEach(async () => {
  tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'evidence-test-'));
  execMock.mockReset();
});

afterEach(async () => {
  await fsp.rm(tmp, { recursive: true, force: true });
});

function makeManifest(overrides: Partial<SessionManifest> = {}): SessionManifest {
  return {
    sessionId: 'session-2026-01-01T00-00-00',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:30.000Z',
    duration: 30,
    commands: [],
    screenshots: ['action-0.png', 'action-1.png'],
    errors: { console: 1, network: 2, server: 0 },
    ...overrides,
  };
}

describe('uploadEvidence', () => {
  it('builds a comment body with session id, duration, counts, and errors', async () => {
    execMock.mockReturnValueOnce('https://github.com/x/y/issues/1#comment-42');

    const url = await uploadEvidence(makeManifest(), tmp, 1);
    expect(url.commentUrl).toMatch(/comment-42/);

    expect(execMock).toHaveBeenCalledTimes(1);
    const callArgs = execMock.mock.calls[0]!;
    const ghArgs = callArgs[1] as string[];
    const bodyIdx = ghArgs.indexOf('--body');
    const body = ghArgs[bodyIdx + 1]!;

    expect(body).toContain('Sweetlink QA Evidence');
    expect(body).toContain('session-2026-01-01T00-00-00');
    expect(body).toContain('30.0s');
    expect(body).toContain('Screenshots:** 2');
    expect(body).toContain('Console: 1');
    expect(body).toContain('Network: 2');
  });

  it('renders an action timeline table when commands exist', async () => {
    execMock.mockReturnValueOnce('https://example.com/comment');
    const manifest = makeManifest({
      commands: [
        { timestamp: 0.5, action: 'click', args: ['@e2'], duration: 5 },
        { timestamp: 1.2, action: 'fill', args: ['@e3', 'hello'], duration: 8 },
      ],
    });

    await uploadEvidence(manifest, tmp, 7);
    const body = (execMock.mock.calls[0]![1] as string[])[
      (execMock.mock.calls[0]![1] as string[]).indexOf('--body') + 1
    ]!;

    expect(body).toContain('### Action Timeline');
    expect(body).toContain('| Time | Action |');
    expect(body).toContain('`click @e2`');
    expect(body).toContain('`fill @e3 hello`');
  });

  it('omits the timeline section when there are no commands', async () => {
    execMock.mockReturnValueOnce('https://example.com/comment');
    await uploadEvidence(makeManifest({ commands: [] }), tmp, 1);
    const body = (execMock.mock.calls[0]![1] as string[])[
      (execMock.mock.calls[0]![1] as string[]).indexOf('--body') + 1
    ]!;
    expect(body).not.toContain('### Action Timeline');
  });

  it('forwards --repo when provided so cross-repo upload works', async () => {
    execMock.mockReturnValueOnce('https://example.com/comment');
    await uploadEvidence(makeManifest(), tmp, 1, { repo: 'my-org/my-repo' });
    const ghArgs = execMock.mock.calls[0]![1] as string[];
    expect(ghArgs).toEqual(expect.arrayContaining(['--repo', 'my-org/my-repo']));
  });

  it('rewraps gh failures with an actionable hint about install/auth', async () => {
    execMock.mockImplementationOnce(() => {
      throw new Error('gh: command not found');
    });
    await expect(uploadEvidence(makeManifest(), tmp, 1)).rejects.toThrow(
      /gh.*installed and authenticated/i
    );
  });
});

describe('captureTerminal', () => {
  it('writes a .cast and .html file with the command output', async () => {
    // Use the real node binary so we don't depend on a particular shell.
    execMock.mockImplementationOnce(() => 'hello\nworld\n');

    const result = await captureTerminal('node', ['-e', "console.log('hi')"], tmp);

    expect(result.lines).toBeGreaterThan(0);
    expect(await fsp.readFile(result.castPath, 'utf-8')).toContain('"version":2');
    const html = await fsp.readFile(result.htmlPath, 'utf-8');
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('hello');
  });

  it('escapes HTML-significant characters in the captured output', async () => {
    // A program's stdout that contains `<script>` must not break out of
    // the player's <pre> block.
    execMock.mockImplementationOnce(() => 'before <script>alert(1)</script> after');

    const result = await captureTerminal('node', ['-e', '/* doesn\'t matter */'], tmp);
    const html = await fsp.readFile(result.htmlPath, 'utf-8');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('still produces output even when the command exits non-zero', async () => {
    // Simulate ENOENT-style execFileSync failure that exposes stdout/stderr.
    const fakeErr: { stdout: string; stderr: string } = {
      stdout: 'partial output',
      stderr: 'whoops',
    };
    execMock.mockImplementationOnce(() => {
      throw fakeErr;
    });

    const result = await captureTerminal('node', ['-e', 'process.exit(1)'], tmp);
    const html = await fsp.readFile(result.htmlPath, 'utf-8');
    // Both streams are concatenated into the captured output.
    expect(html).toContain('partial output');
    expect(html).toContain('whoops');
  });
});
