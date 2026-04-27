/**
 * E2E coverage for the LLM-facing evidence bundles used by frontend agents.
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

const contextPage = `<!DOCTYPE html>
<html>
  <body style="font-family:sans-serif;padding:24px">
    <main>
      <h1>Checkout Review</h1>
      <p id="status">Ready for agent context capture.</p>
      <button id="warn" aria-label="Trigger warning">Trigger warning</button>
      <button id="save" aria-label="Save order">Save order</button>
    </main>
    <script>
      document.querySelector('#warn').addEventListener('click', () => {
        console.warn('agent-context-warning: promo code expired');
        document.querySelector('#status').textContent = 'Warning emitted';
      });
      document.querySelector('#save').addEventListener('click', () => {
        console.error('agent-context-error: payment form missing');
      });
    </script>
  </body>
</html>`;

const staleRefPage = `<!DOCTYPE html>
<html>
  <body style="font-family:sans-serif;padding:24px">
    <button aria-label="Launch payment" id="temp">Launch payment</button>
    <button
      aria-label="Delete stale target"
      onclick="document.querySelector('#temp')?.remove()"
    >Delete stale target</button>
  </body>
</html>`;

const preSessionNoisePage = `<!DOCTYPE html>
<html>
  <body style="font-family:sans-serif;padding:24px">
    <h1>Pre-session noise</h1>
    <script>console.error('pre-session-noise: should not appear in active inspect evidence');</script>
  </body>
</html>`;

const sessionNoisePage = `<!DOCTYPE html>
<html>
  <body style="font-family:sans-serif;padding:24px">
    <button aria-label="Emit session warning">Emit session warning</button>
    <script>
      document.querySelector('button').addEventListener('click', () => {
        console.warn('session-noise: should appear in active inspect evidence');
      });
    </script>
  </body>
</html>`;

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test('agent context bundle captures screenshot, refs, console, and network state', async () => {
  const fx = await makeFixture(contextPage);
  try {
    const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as {
      refs: Ref[];
    };
    const warnRef = snap.refs.find((r) => r.name === 'Trigger warning');
    expect(warnRef).toBeDefined();
    await daemonReq(fx.daemon, 'click-ref', { ref: warnRef!.ref });

    const context = await collectAgentContext(fx, 'checkout warning state', {
      expectedOutcome: 'The Save order action remains discoverable after warning state.',
      actionTranscript: [
        {
          action: 'click',
          target: warnRef!.ref,
          result: 'agent-context-warning was emitted',
        },
      ],
    });

    expect(context.counts.refs).toBeGreaterThanOrEqual(2);
    expect(context.counts.consoleWarnings).toBeGreaterThanOrEqual(1);
    expect(context.refs.some((r) => r.name === 'Save order')).toBe(true);
    expect(context.nextActions.length).toBeGreaterThan(0);
    expect(context.expectedOutcome).toContain('Save order');
    expect(context.actionTranscript?.[0]?.target).toBe(warnRef!.ref);
    expect(context.artifacts.a11yJson).toBeDefined();

    for (const artifactPath of Object.values(context.artifacts).filter(Boolean)) {
      expect(fs.existsSync(artifactPath), artifactPath).toBe(true);
    }

    const summary = fs.readFileSync(context.artifacts.summaryMarkdown, 'utf-8');
    expect(summary).toContain('Sweetlink Inspect');
    expect(summary).toContain('Expected Outcome');
    expect(summary).toContain('Action Transcript');
    expect(summary).toContain('agent-context-warning: promo code expired');
    expect(summary).toContain('Save order');
  } finally {
    await fx.cleanup();
  }
});

test('inspect CLI emits a stable JSON context schema with artifact paths', async () => {
  const fx = await makeFixture(contextPage);
  try {
    const result = await cli(
      [
        'inspect',
        '--json',
        '--url',
        fx.url,
        '--label',
        'cli inspect context',
        '--expected',
        'Agent receives one bundle with visual, refs, logs, network, and a11y evidence.',
        '--action',
        'capture initial context',
      ],
      fx.projectRoot
    );

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout.trim()) as {
      ok: boolean;
      data: {
        artifacts: { contextJson: string; screenshotPng: string; summaryMarkdown: string };
        counts: { refs: number; networkEntries: number };
        refs: Ref[];
        nextActions: string[];
      };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.data.counts.refs).toBeGreaterThanOrEqual(2);
    expect(parsed.data.refs.some((r) => r.name === 'Save order')).toBe(true);
    expect(parsed.data.nextActions.some((action) => action.includes('@e refs'))).toBe(true);
    expect(fs.existsSync(parsed.data.artifacts.contextJson)).toBe(true);
    expect(fs.existsSync(parsed.data.artifacts.screenshotPng)).toBe(true);
    expect(fs.readFileSync(parsed.data.artifacts.summaryMarkdown, 'utf-8')).toContain(
      'Agent receives one bundle'
    );
  } finally {
    await fx.cleanup();
  }
});

test('daemon and CLI JSON errors retain failure screenshot context', async () => {
  const fx = await makeFixture(staleRefPage);
  try {
    const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as {
      refs: Ref[];
    };
    const ref = snap.refs.find((r) => r.name === 'Launch payment')!.ref;
    const removeRef = snap.refs.find((r) => r.name === 'Delete stale target')!.ref;
    await daemonReq(fx.daemon, 'click-ref', { ref: removeRef });

    let daemonError: DaemonReqError | null = null;
    try {
      await daemonReq(fx.daemon, 'click-ref', { ref });
    } catch (error) {
      daemonError = error as DaemonReqError;
    }
    expect(daemonError?.data?.failureScreenshot).toContain('.png');

    const result = await cli(['click', ref, '--json', '--url', fx.url], fx.projectRoot);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout.trim()) as {
      ok: boolean;
      data?: { failureScreenshot?: string };
      error?: string;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain(ref);
    expect(parsed.data?.failureScreenshot).toContain('.png');
  } finally {
    await fx.cleanup();
  }
});

test('inspect evidence is scoped to the active recording session', async () => {
  const fx = await makeFixture(preSessionNoisePage);
  try {
    await daemonReq(fx.daemon, 'screenshot');

    fx.setHtml(sessionNoisePage);
    await daemonReq(fx.daemon, 'record-start', { label: 'inspect scoped evidence' });
    const snap = (await daemonReq(fx.daemon, 'snapshot', { interactive: true })) as {
      refs: Ref[];
    };
    const warningRef = snap.refs.find((ref) => ref.name === 'Emit session warning')!.ref;
    await daemonReq(fx.daemon, 'click-ref', { ref: warningRef });

    const context = await collectAgentContext(fx, 'recording scoped inspect', {
      expectedOutcome: 'Inspect evidence only includes events from this recording session.',
      actionTranscript: [
        { action: 'click', target: warningRef, result: 'session warning emitted' },
      ],
      last: 500,
    });

    expect(context.console?.formatted).toContain(
      'session-noise: should appear in active inspect evidence'
    );
    expect(context.console?.formatted).not.toContain(
      'pre-session-noise: should not appear in active inspect evidence'
    );

    await daemonReq(fx.daemon, 'record-stop');
  } finally {
    await fx.cleanup();
  }
});
