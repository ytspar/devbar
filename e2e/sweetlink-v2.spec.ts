/**
 * Sweetlink v2 integration coverage.
 *
 * This suite intentionally uses the isolated async harness from _harness.ts:
 * every test gets a temporary project root, scoped daemon state, async CLI
 * calls, and LLM-readable context artifacts.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import {
  cli,
  collectAgentContext,
  type DaemonReqError,
  daemonReq,
  makeFixture,
} from './_harness.js';

interface Ref {
  ref: string;
  role: string;
  name: string;
}

const assistantHarnessPage = `<!DOCTYPE html>
<html>
  <head>
    <title>Sweetlink v2 harness</title>
  </head>
  <body style="font-family: sans-serif; padding: 24px">
    <main>
      <h1>Assistant Harness</h1>
      <p id="status">Waiting for an agent action.</p>
      <label for="task">Task name</label>
      <input id="task" aria-label="Task name" />
      <button id="toggle" aria-label="Run assistant action">Run assistant action</button>
    </main>
    <script>
      document.querySelector('#toggle').addEventListener('click', () => {
        console.warn('sweetlink-v2: action warning emitted');
        document.querySelector('#status').textContent = 'Agent action completed';
      });
    </script>
  </body>
</html>`;

const staleRefPage = `<!DOCTYPE html>
<html>
  <body style="font-family: sans-serif; padding: 24px">
    <button aria-label="Run stale action" id="target">Run stale action</button>
    <button
      aria-label="Remove stale action"
      onclick="document.querySelector('#target')?.remove()"
    >Remove stale action</button>
  </body>
</html>`;

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test('exercises daemon actions through the isolated async harness', async () => {
  const fx = await makeFixture(assistantHarnessPage);
  try {
    const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as {
      refs: Ref[];
    };
    const actionRef = snap.refs.find((ref) => ref.name === 'Run assistant action');
    const inputRef = snap.refs.find((ref) => ref.name === 'Task name');

    expect(actionRef).toBeDefined();
    expect(inputRef).toBeDefined();

    await daemonReq(fx.daemon, 'fill-ref', {
      ref: inputRef!.ref,
      value: 'frontend assistant context',
    });
    await daemonReq(fx.daemon, 'click-ref', { ref: actionRef!.ref });

    const screenshot = (await daemonReq(fx.daemon, 'screenshot', { fullPage: true })) as {
      screenshot: string;
      width: number;
      height: number;
    };
    expect(Buffer.from(screenshot.screenshot, 'base64').length).toBeGreaterThan(1_000);
    expect(screenshot.width).toBeGreaterThan(0);
    expect(screenshot.height).toBeGreaterThan(0);

    const context = await collectAgentContext(fx, 'sweetlink v2 harness flow', {
      expectedOutcome: 'The agent can inspect, act, verify, and hand evidence back to an LLM.',
      actionTranscript: [
        { action: 'fill', target: inputRef!.ref, result: 'task name entered' },
        { action: 'click', target: actionRef!.ref, result: 'warning emitted and status changed' },
      ],
    });

    expect(context.counts.refs).toBeGreaterThanOrEqual(2);
    expect(context.counts.consoleWarnings).toBeGreaterThanOrEqual(1);
    expect(context.refs.some((ref) => ref.name === 'Run assistant action')).toBe(true);
    expect(context.actionTranscript).toHaveLength(2);
    expect(context.expectedOutcome).toContain('inspect, act, verify');

    for (const artifactPath of Object.values(context.artifacts).filter(Boolean)) {
      expect(fs.existsSync(artifactPath), artifactPath).toBe(true);
    }

    const summary = fs.readFileSync(context.artifacts.summaryMarkdown, 'utf-8');
    expect(summary).toContain('Sweetlink Inspect');
    expect(summary).toContain('sweetlink-v2: action warning emitted');
    expect(summary).toContain('Action Transcript');
  } finally {
    await fx.cleanup();
  }
});

test('CLI JSON errors preserve daemon failure data from stale refs', async () => {
  const fx = await makeFixture(staleRefPage);
  try {
    const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as {
      refs: Ref[];
    };
    const staleRef = snap.refs.find((ref) => ref.name === 'Run stale action')!.ref;
    const removeRef = snap.refs.find((ref) => ref.name === 'Remove stale action')!.ref;

    await daemonReq(fx.daemon, 'click-ref', { ref: removeRef });

    let daemonError: DaemonReqError | null = null;
    try {
      await daemonReq(fx.daemon, 'click-ref', { ref: staleRef });
    } catch (error) {
      daemonError = error as DaemonReqError;
    }
    expect(daemonError?.data?.failureScreenshot).toContain('.png');
    expect(daemonError?.data?.remediation).toContain('inspect');

    const result = await cli(['click', staleRef, '--json', '--url', fx.url], fx.projectRoot);
    expect(result.exitCode).toBe(1);

    const parsed = JSON.parse(result.stdout.trim()) as {
      ok: boolean;
      data?: { failureScreenshot?: string; remediation?: string; staleRef?: boolean };
      error?: string;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain(staleRef);
    expect(parsed.data?.staleRef).toBe(true);
    expect(parsed.data?.failureScreenshot).toContain('.png');
    expect(parsed.data?.remediation).toContain('inspect');
  } finally {
    await fx.cleanup();
  }
});
