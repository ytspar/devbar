// @vitest-environment node

/**
 * Demo Document Builder Tests
 *
 * Tests the incremental Markdown document builder used by the daemon.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

import { execFileSync, execSync } from 'child_process';
import { promises as fs } from 'fs';
import {
  addExec,
  addNote,
  addScreenshot,
  addSnapshot,
  initDemo,
  popSection,
  renderDemo,
  verifyDemo,
  writeDemo,
} from './demo.js';
import type { DemoState } from './demo.js';

/** Helper to create a minimal DemoState for tests that don't need initDemo */
function makeState(overrides?: Partial<DemoState>): DemoState {
  return {
    title: 'Test Demo',
    filePath: '/tmp/demo-out/DEMO.md',
    sections: [],
    startedAt: '2026-01-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('Demo Document Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // initDemo
  // ==========================================================================
  describe('initDemo', () => {
    it('creates correct state with title, filePath, and git metadata', async () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync
        .mockReturnValueOnce('main\n')
        .mockReturnValueOnce('abc1234\n');

      const state = await initDemo('My Tutorial', '/tmp/demo-out');

      expect(state.title).toBe('My Tutorial');
      expect(state.filePath).toBe('/tmp/demo-out/DEMO.md');
      expect(state.sections).toEqual([]);
      expect(state.startedAt).toBe('2026-01-15T12:00:00.000Z');
      expect(state.gitBranch).toBe('main');
      expect(state.gitCommit).toBe('abc1234');
    });

    it('creates output directory recursively', async () => {
      vi.mocked(execFileSync).mockImplementation(() => { throw new Error(); });

      await initDemo('Demo', '/tmp/deep/nested/dir');

      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/deep/nested/dir', { recursive: true });
    });

    it('writes the initial file via writeDemo', async () => {
      vi.mocked(execFileSync).mockImplementation(() => { throw new Error(); });

      await initDemo('Demo', '/tmp/demo-out');

      // Should write both DEMO.md and demo-state.json
      expect(fs.writeFile).toHaveBeenCalledTimes(2);
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/demo-out/DEMO.md',
        expect.any(String),
        'utf-8',
      );
    });

    it('stores url from options', async () => {
      vi.mocked(execFileSync).mockImplementation(() => { throw new Error(); });

      const state = await initDemo('Demo', '/tmp/out', { url: 'http://localhost:3000' });

      expect(state.url).toBe('http://localhost:3000');
    });

    it('handles detached HEAD (branch === HEAD)', async () => {
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync
        .mockReturnValueOnce('HEAD\n')
        .mockReturnValueOnce('abc1234\n');

      const state = await initDemo('Demo', '/tmp/out');

      expect(state.gitBranch).toBeUndefined();
      expect(state.gitCommit).toBe('abc1234');
    });

    it('handles git not available', async () => {
      vi.mocked(execFileSync).mockImplementation(() => { throw new Error('not a git repo'); });

      const state = await initDemo('Demo', '/tmp/out');

      expect(state.gitBranch).toBeUndefined();
      expect(state.gitCommit).toBeUndefined();
    });
  });

  // ==========================================================================
  // addNote
  // ==========================================================================
  describe('addNote', () => {
    it('appends a note section', () => {
      const state = makeState();
      const updated = addNote(state, 'This is a note');

      expect(updated.sections).toHaveLength(1);
      expect(updated.sections[0]).toMatchObject({
        type: 'note',
        content: 'This is a note',
      });
    });

    it('preserves existing sections', () => {
      const state = addNote(makeState(), 'First note');
      const updated = addNote(state, 'Second note');

      expect(updated.sections).toHaveLength(2);
      expect(updated.sections[0]!.content).toBe('First note');
      expect(updated.sections[1]!.content).toBe('Second note');
    });

    it('includes a timestamp', () => {
      const updated = addNote(makeState(), 'Note');

      expect(updated.sections[0]!.timestamp).toBe('2026-01-15T12:00:00.000Z');
    });
  });

  // ==========================================================================
  // addExec
  // ==========================================================================
  describe('addExec', () => {
    it('captures command output and exit code 0', () => {
      vi.mocked(execSync).mockReturnValue('hello world\n');

      const updated = addExec(makeState(), 'echo', ['hello', 'world']);

      expect(updated.sections).toHaveLength(1);
      expect(updated.sections[0]).toMatchObject({
        type: 'exec',
        content: 'hello world',
        command: 'echo hello world',
        exitCode: 0,
      });
    });

    it('handles command failure with non-zero exit code', () => {
      vi.mocked(execSync).mockImplementation(() => {
        const err = new Error('Command failed') as Error & {
          stdout: string; stderr: string; status: number;
        };
        err.stdout = '';
        err.stderr = 'file not found\n';
        err.status = 2;
        throw err;
      });

      const updated = addExec(makeState(), 'cat', ['missing.txt']);

      expect(updated.sections[0]).toMatchObject({
        type: 'exec',
        content: 'file not found',
        command: 'cat missing.txt',
        exitCode: 2,
      });
    });

    it('defaults exit code to 1 when status is null', () => {
      vi.mocked(execSync).mockImplementation(() => {
        const err = new Error('killed') as Error & { stdout: string; stderr: string };
        err.stdout = '';
        err.stderr = 'timeout';
        throw err;
      });

      const updated = addExec(makeState(), 'slow-cmd', []);

      expect(updated.sections[0]!.exitCode).toBe(1);
    });

    it('trims trailing newline from output', () => {
      vi.mocked(execSync).mockReturnValue('line1\nline2\n');

      const updated = addExec(makeState(), 'ls', []);

      expect(updated.sections[0]!.content).toBe('line1\nline2');
    });
  });

  // ==========================================================================
  // addScreenshot
  // ==========================================================================
  describe('addScreenshot', () => {
    it('increments screenshot counter in filename', async () => {
      const state = makeState();
      const buf = Buffer.from('png-data');

      const s1 = await addScreenshot(state, buf, 'First');
      const s2 = await addScreenshot(s1, buf, 'Second');

      expect(s1.sections[0]!.screenshotFile).toBe('demo-screenshot-1.png');
      expect(s2.sections[1]!.screenshotFile).toBe('demo-screenshot-2.png');
    });

    it('writes the PNG buffer to disk', async () => {
      const buf = Buffer.from('png-data');

      await addScreenshot(makeState(), buf, 'Test shot');

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/demo-out/demo-screenshot-1.png',
        buf,
      );
    });

    it('uses default caption when none provided', async () => {
      const updated = await addScreenshot(makeState(), Buffer.from('x'));

      expect(updated.sections[0]!.content).toBe('Screenshot 1');
    });

    it('uses custom caption when provided', async () => {
      const updated = await addScreenshot(makeState(), Buffer.from('x'), 'Login page');

      expect(updated.sections[0]!.content).toBe('Login page');
    });
  });

  // ==========================================================================
  // addSnapshot
  // ==========================================================================
  describe('addSnapshot', () => {
    it('adds a snapshot section', () => {
      const updated = addSnapshot(makeState(), '<main>\n  <h1>Hello</h1>\n</main>');

      expect(updated.sections).toHaveLength(1);
      expect(updated.sections[0]).toMatchObject({
        type: 'snapshot',
        content: '<main>\n  <h1>Hello</h1>\n</main>',
      });
    });
  });

  // ==========================================================================
  // popSection
  // ==========================================================================
  describe('popSection', () => {
    it('removes the last section', () => {
      let state = addNote(makeState(), 'First');
      state = addNote(state, 'Second');
      state = addNote(state, 'Third');

      const updated = popSection(state);

      expect(updated.sections).toHaveLength(2);
      expect(updated.sections[1]!.content).toBe('Second');
    });

    it('is a no-op on empty sections', () => {
      const state = makeState();
      const updated = popSection(state);

      expect(updated.sections).toEqual([]);
    });
  });

  // ==========================================================================
  // renderDemo
  // ==========================================================================
  describe('renderDemo', () => {
    it('produces valid markdown with header and metadata', () => {
      const state = makeState({
        gitBranch: 'feature-x',
        gitCommit: 'abc1234',
      });

      const md = renderDemo(state);

      expect(md).toContain('# Test Demo');
      expect(md).toContain('Generated by Sweetlink');
      expect(md).toContain('feature-x @ abc1234');
    });

    it('includes url in metadata when present', () => {
      const state = makeState({ url: 'http://localhost:3000' });

      const md = renderDemo(state);

      expect(md).toContain('http://localhost:3000');
    });

    it('renders note sections as plain text', () => {
      const state = addNote(makeState(), 'This is important.');

      const md = renderDemo(state);

      expect(md).toContain('This is important.');
    });

    it('renders exec sections as bash code blocks', () => {
      vi.mocked(execSync).mockReturnValue('v18.0.0\n');
      const state = addExec(makeState(), 'node', ['--version']);

      const md = renderDemo(state);

      expect(md).toContain('```bash');
      expect(md).toContain('$ node --version');
      expect(md).toContain('v18.0.0');
    });

    it('renders screenshot sections as image references', async () => {
      const state = await addScreenshot(makeState(), Buffer.from('x'), 'Home page');

      const md = renderDemo(state);

      expect(md).toContain('![Home page](demo-screenshot-1.png)');
    });

    it('renders snapshot sections as code blocks', () => {
      const state = addSnapshot(makeState(), '<div>snapshot</div>');

      const md = renderDemo(state);

      expect(md).toContain('```\n<div>snapshot</div>\n```');
    });

    it('renders all section types together', async () => {
      vi.mocked(execSync).mockReturnValue('ok\n');
      let state = makeState({ gitBranch: 'main', gitCommit: 'abc1234' });
      state = addNote(state, 'Step one.');
      state = addExec(state, 'echo', ['ok']);
      state = await addScreenshot(state, Buffer.from('x'), 'Result');
      state = addSnapshot(state, '<tree/>');

      const md = renderDemo(state);

      expect(md).toContain('# Test Demo');
      expect(md).toContain('Step one.');
      expect(md).toContain('$ echo ok');
      expect(md).toContain('![Result](demo-screenshot-1.png)');
      expect(md).toContain('```\n<tree/>\n```');
    });
  });

  // ==========================================================================
  // verifyDemo
  // ==========================================================================
  describe('verifyDemo', () => {
    it('passes when outputs match', async () => {
      vi.mocked(execSync).mockReturnValue('hello\n');

      // Build state with an exec section that has content 'hello'
      const state = makeState({
        sections: [
          {
            type: 'exec',
            content: 'hello',
            command: 'echo hello',
            exitCode: 0,
            timestamp: '2026-01-15T12:00:00.000Z',
          },
        ],
      });

      const result = await verifyDemo(state);

      expect(result.passed).toBe(true);
      expect(result.failures).toEqual([]);
    });

    it('fails when outputs differ', async () => {
      vi.mocked(execSync).mockReturnValue('goodbye\n');

      const state = makeState({
        sections: [
          {
            type: 'exec',
            content: 'hello',
            command: 'echo hello',
            exitCode: 0,
            timestamp: '2026-01-15T12:00:00.000Z',
          },
        ],
      });

      const result = await verifyDemo(state);

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatchObject({
        index: 0,
        command: 'echo hello',
        expected: 'hello',
        actual: 'goodbye',
      });
    });

    it('skips non-exec sections', async () => {
      const state = makeState({
        sections: [
          { type: 'note', content: 'Just a note', timestamp: '2026-01-15T12:00:00.000Z' },
          { type: 'snapshot', content: '<tree/>', timestamp: '2026-01-15T12:00:00.000Z' },
        ],
      });

      const result = await verifyDemo(state);

      expect(result.passed).toBe(true);
      expect(execSync).not.toHaveBeenCalled();
    });

    it('handles exec failure during verification', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        const err = new Error('failed') as Error & { stdout: string; stderr: string };
        err.stdout = 'error output';
        err.stderr = '';
        throw err;
      });

      const state = makeState({
        sections: [
          {
            type: 'exec',
            content: 'expected output',
            command: 'failing-cmd',
            exitCode: 0,
            timestamp: '2026-01-15T12:00:00.000Z',
          },
        ],
      });

      const result = await verifyDemo(state);

      expect(result.passed).toBe(false);
      expect(result.failures[0]!.actual).toBe('error output');
    });
  });

  // ==========================================================================
  // writeDemo
  // ==========================================================================
  describe('writeDemo', () => {
    it('writes both markdown and state JSON to disk', async () => {
      const state = makeState();

      await writeDemo(state);

      // First call: markdown file
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/demo-out/DEMO.md',
        expect.any(String),
        'utf-8',
      );

      // Second call: state JSON
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/demo-out/demo-state.json',
        expect.any(String),
        'utf-8',
      );
    });

    it('writes valid JSON for state file', async () => {
      const state = addNote(makeState(), 'Hello');

      await writeDemo(state);

      const jsonCall = vi.mocked(fs.writeFile).mock.calls.find(
        (call) => String(call[0]).endsWith('demo-state.json'),
      );
      expect(jsonCall).toBeDefined();
      const parsed = JSON.parse(jsonCall![1] as string);
      expect(parsed.title).toBe('Test Demo');
      expect(parsed.sections).toHaveLength(1);
    });

    it('writes markdown content matching renderDemo output', async () => {
      const state = addNote(makeState(), 'Test content');

      await writeDemo(state);

      const mdCall = vi.mocked(fs.writeFile).mock.calls.find(
        (call) => String(call[0]).endsWith('DEMO.md'),
      );
      expect(mdCall).toBeDefined();
      expect(mdCall![1]).toBe(renderDemo(state));
    });
  });
});
