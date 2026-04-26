/**
 * Console + Network Ring Buffers — TDD Suite
 *
 * Covers daemon actions:
 *   - console-read (with --errors / --last filtering)
 *   - network-read (with --failed / --last filtering)
 *   - dialog-read
 *
 * Run:
 *   pnpm exec playwright test e2e/buffers-bugs.spec.ts --project=chromium
 */

import { expect, test } from '@playwright/test';
import { daemonReq, makeFixture } from './_harness.js';

interface ConsoleEntry { level: string; message: string; timestamp: number }
interface NetworkEntry { method: string; url: string; status: number; timestamp: number }

function noisyPage(): string {
  return `<!DOCTYPE html>
<html><head><title>Buf</title></head>
<body><h1>Buffer Fixture</h1>
<script>
console.log('initial info');
console.warn('initial warn');
console.error('initial err 1');
console.error('initial err 2');
fetch('/data.json').catch(()=>{});
// Hit a port nothing is listening on to force a network-level failure
// (Playwright records this as 'requestfailed' with status 0).
fetch('http://127.0.0.1:1/').catch(()=>{});
</script>
</body></html>`;
}

/** Settle all microtasks/animation/network. */
async function settle(ms = 600): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

test.describe.configure({ mode: 'serial', timeout: 60_000 });

test.describe('Buffers — happy path baselines (after page load)', () => {
  test('console buffer captures all levels emitted on load', async () => {
    const fx = await makeFixture(noisyPage());
    try {
      // Force page load via screenshot.
      await daemonReq(fx.daemon, 'screenshot');
      await settle();
      const data = (await daemonReq(fx.daemon, 'console-read')) as {
        entries: ConsoleEntry[]; total: number; errorCount: number; warningCount: number;
      };
      expect(data.total).toBeGreaterThanOrEqual(4);
      expect(data.errorCount).toBeGreaterThanOrEqual(2);
      expect(data.warningCount).toBeGreaterThanOrEqual(1);

      const messages = data.entries.map((e) => e.message).join('|');
      expect(messages).toContain('initial info');
      expect(messages).toContain('initial err 1');
      expect(messages).toContain('initial err 2');
    } finally {
      await fx.cleanup();
    }
  });

  test('console-read { errors: true } filters to error level only', async () => {
    const fx = await makeFixture(noisyPage());
    try {
      await daemonReq(fx.daemon, 'screenshot');
      await settle();
      const data = (await daemonReq(fx.daemon, 'console-read', { errors: true })) as {
        entries: ConsoleEntry[]; errorCount: number;
      };
      expect(data.entries.length).toBeGreaterThan(0);
      for (const e of data.entries) {
        expect(e.level).toBe('error');
      }
    } finally {
      await fx.cleanup();
    }
  });

  test('console-read { last: N } caps entry count', async () => {
    const fx = await makeFixture(noisyPage());
    try {
      await daemonReq(fx.daemon, 'screenshot');
      await settle();
      const data = (await daemonReq(fx.daemon, 'console-read', { last: 2 })) as {
        entries: ConsoleEntry[];
      };
      expect(data.entries.length).toBeLessThanOrEqual(2);
    } finally {
      await fx.cleanup();
    }
  });

  test('network buffer captures page + fetch requests', async () => {
    const fx = await makeFixture(noisyPage());
    try {
      await daemonReq(fx.daemon, 'screenshot');
      await settle();
      const data = (await daemonReq(fx.daemon, 'network-read')) as {
        entries: NetworkEntry[]; total: number; failedCount: number;
      };
      expect(data.total).toBeGreaterThanOrEqual(2); // page + at least one fetch
      const urls = data.entries.map((e) => e.url).join(' ');
      expect(urls).toContain('/data.json');
      // The /127.0.0.1:1/ fetch is a network failure — should appear too.
      expect(urls).toContain('127.0.0.1:1');
    } finally {
      await fx.cleanup();
    }
  });

  test('network-read { failed: true } filters to non-2xx/0 status', async () => {
    const fx = await makeFixture(noisyPage());
    try {
      await daemonReq(fx.daemon, 'screenshot');
      await settle(1_500);
      const all = (await daemonReq(fx.daemon, 'network-read')) as { entries: NetworkEntry[] };
      // Diagnostic context if the assertion below fails.
      const summary = all.entries.map((e) => `${e.status} ${e.url}`).join('\n');
      const data = (await daemonReq(fx.daemon, 'network-read', { failed: true })) as {
        entries: NetworkEntry[]; failedCount: number;
      };
      expect(data.failedCount, `network buffer:\n${summary}`).toBeGreaterThanOrEqual(1);
      for (const e of data.entries) {
        expect(e.status === 0 || e.status >= 400).toBe(true);
      }
    } finally {
      await fx.cleanup();
    }
  });

  test('dialog buffer starts empty on a page with no dialogs', async () => {
    const fx = await makeFixture(noisyPage());
    try {
      await daemonReq(fx.daemon, 'screenshot');
      const data = (await daemonReq(fx.daemon, 'dialog-read')) as { total: number; entries: unknown[] };
      expect(data.total).toBe(0);
      expect(data.entries).toEqual([]);
    } finally {
      await fx.cleanup();
    }
  });
});

test.describe('Buffers — known bugs (TDD: drop .fail when fixed)', () => {
  // ----------------------------------------------------------------------
  // Bug I: console-read / network-read on a fresh daemon (no prior
  // page-loading action) silently returns 0 entries. The handlers don't
  // call initBrowser(), so events from the configured URL are never
  // captured. They should either init the browser OR return a clear
  // "no page loaded" error.
  // ----------------------------------------------------------------------
  test(
    'BUG I — console-read on a fresh daemon returns the configured page\'s console events',
    async () => {
      const fx = await makeFixture(noisyPage());
      try {
        // First request to the daemon — should still produce console entries
        // for the noisy page (which the daemon is configured to point at).
        const data = (await daemonReq(fx.daemon, 'console-read')) as {
          total: number; errorCount: number;
        };
        expect(data.total).toBeGreaterThan(0);
        expect(data.errorCount).toBeGreaterThanOrEqual(2);
      } finally {
        await fx.cleanup();
      }
    },
  );

  test(
    'BUG I — network-read on a fresh daemon returns the configured page\'s requests',
    async () => {
      const fx = await makeFixture(noisyPage());
      try {
        const data = (await daemonReq(fx.daemon, 'network-read')) as {
          total: number; failedCount: number;
        };
        expect(data.total).toBeGreaterThan(0);
      } finally {
        await fx.cleanup();
      }
    },
  );
});
