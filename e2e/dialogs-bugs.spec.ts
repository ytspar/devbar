/**
 * Dialog auto-dismiss — TDD Suite
 *
 * Page-emitted alert/confirm/prompt should be captured into the dialog
 * buffer and auto-dismissed so the page doesn't hang.
 */

import { expect, test } from '@playwright/test';
import { daemonReq, makeFixture } from './_harness.js';

interface DialogEntry {
  type: string;
  message: string;
  defaultValue?: string;
}

function dialogPage(): string {
  return `<!DOCTYPE html><html><body>
<script>
alert('synthetic alert');
confirm('confirm me?');
prompt('your name?', 'default');
</script>
</body></html>`;
}

test.describe.configure({ mode: 'serial', timeout: 30_000 });

test('dialog buffer captures alert + confirm + prompt without hanging', async () => {
  const fx = await makeFixture(dialogPage());
  try {
    // initBrowser must complete in reasonable time — page would hang on
    // alert() if dialogs weren't auto-dismissed.
    const t0 = Date.now();
    await daemonReq(fx.daemon, 'screenshot');
    expect(Date.now() - t0, 'page navigation should not hang on dialogs').toBeLessThan(10_000);

    const data = (await daemonReq(fx.daemon, 'dialog-read')) as {
      total: number;
      entries: DialogEntry[];
    };
    expect(data.total).toBe(3);
    const types = data.entries.map((e) => e.type).sort();
    expect(types).toEqual(['alert', 'confirm', 'prompt']);

    const prompt = data.entries.find((e) => e.type === 'prompt')!;
    expect(prompt.message).toBe('your name?');
    expect(prompt.defaultValue).toBe('default');
  } finally {
    await fx.cleanup();
  }
});
