// @vitest-environment node

/**
 * Session Viewer Tests
 *
 * The viewer module produces a self-contained HTML file that embeds the
 * session manifest as a `<script>` block. The most important thing to
 * test (without spawning a browser to render the file) is the security
 * boundary: a malicious console message that contains `</script>` MUST
 * NOT be able to break out of the script tag and execute as HTML.
 *
 * We exercise this by passing a manifest with adversarial content
 * through generateViewer and asserting the resulting HTML keeps the
 * payload trapped inside the script body.
 */

import { promises as fsp } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessionManifest } from './session.js';
import { generateViewer } from './viewer.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'viewer-test-'));
});

afterEach(async () => {
  await fsp.rm(tmp, { recursive: true, force: true });
});

function manifestWith(overrides: Partial<SessionManifest> = {}): SessionManifest {
  return {
    sessionId: 'session-2026-01-01T00-00-00',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:00:01.000Z',
    duration: 1,
    commands: [],
    screenshots: [],
    errors: { console: 0, network: 0, server: 0 },
    ...overrides,
  };
}

describe('generateViewer — </script> XSS resistance', () => {
  it('escapes < to \\u003c so a console message cannot close the script tag', async () => {
    // The console buffer is unbounded user input. A malicious page can
    // emit `</script><img src=x onerror=alert(1)>` to the console; the
    // viewer must not let that turn into an executing HTML element.
    const consoleEntries = [
      { timestamp: Date.now(), level: 'log', message: '</script><img src=x onerror=alert(1)>' },
    ];
    const viewerPath = await generateViewer(manifestWith(), {
      sessionDir: tmp,
      consoleEntries,
    });
    const html = await fsp.readFile(viewerPath, 'utf-8');

    // After the encoder, the literal `</script>` substring must be absent
    // from the JSON payload — replaced with `</script>`. (The HTML
    // template still has its OWN `</script>` for the genuine closing tag,
    // so we look in the content area between consoleEntries assignment
    // and the next obvious anchor.)
    const consoleIdx = html.indexOf('var consoleEntries =');
    expect(consoleIdx).toBeGreaterThan(-1);
    const after = html.slice(consoleIdx, consoleIdx + 500);
    // The dangerous closer is escaped to <.
    expect(after).toContain('\\u003c/script>');
    // And the raw form should NOT survive between the assignment and the
    // first newline (which is where the JSON literal sits).
    const firstLine = after.split('\n')[0]!;
    expect(firstLine).not.toContain('</script>');
  });

  it('escapes < in network entries too', async () => {
    const networkEntries = [
      {
        timestamp: Date.now(),
        method: 'GET',
        url: 'http://x/?</script><b>',
        status: 200,
        duration: 5,
      },
    ];
    const viewerPath = await generateViewer(manifestWith(), {
      sessionDir: tmp,
      networkEntries,
    });
    const html = await fsp.readFile(viewerPath, 'utf-8');
    const idx = html.indexOf('var networkEntries =');
    const firstLine = html.slice(idx).split('\n')[0]!;
    expect(firstLine).toContain('\\u003c/script>');
    expect(firstLine).not.toContain('</script>');
  });

  it('writes a valid HTML file containing the embedded session id', async () => {
    const manifest = manifestWith({ label: 'demo' });
    const viewerPath = await generateViewer(manifest, { sessionDir: tmp });
    const html = await fsp.readFile(viewerPath, 'utf-8');
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain(manifest.sessionId);
  });

  it('embeds the action timeline when commands are present', async () => {
    const manifest = manifestWith({
      commands: [
        {
          timestamp: 0.5,
          action: 'click',
          args: ['@e2'],
          duration: 3,
        },
      ],
    });
    const viewerPath = await generateViewer(manifest, { sessionDir: tmp });
    const html = await fsp.readFile(viewerPath, 'utf-8');
    expect(html).toContain('"action":"click"');
    expect(html).toContain('"args":["@e2"]');
  });
});
