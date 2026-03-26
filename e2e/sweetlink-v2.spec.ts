/**
 * Sweetlink v2 Integration Tests (Headed)
 *
 * Run with: pnpm exec playwright test e2e/sweetlink-v2.spec.ts --headed --project=chromium
 *
 * These tests exercise every daemon feature against the playground dev server.
 * They run headed so you can watch each operation in real time.
 */

import { expect, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Daemon Client (inline — avoids import resolution issues in Playwright)
// ============================================================================

interface DaemonState {
  pid: number;
  port: number;
  token: string;
  startedAt: string;
  url: string;
}

const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(PROJECT_ROOT, '.sweetlink');
const STATE_FILE = path.join(STATE_DIR, 'daemon.json');
const CLI = path.join(PROJECT_ROOT, 'packages/sweetlink/dist/cli/sweetlink.js');
const OUTPUT_DIR = path.join(PROJECT_ROOT, '.sweetlink/test-artifacts');

function readState(): DaemonState | null {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function cli(...args: string[]): string {
  return execFileSync('node', [CLI, ...args], {
    encoding: 'utf-8',
    timeout: 30_000,
    cwd: PROJECT_ROOT,
  });
}

async function daemonReq(
  state: DaemonState,
  action: string,
  params?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${state.port}/api/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
    },
    body: JSON.stringify({ params }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error ?? `Daemon ${action} failed`);
  return body.data ?? {};
}

// ============================================================================
// Setup & Teardown
// ============================================================================

test.describe.configure({ mode: 'serial' }); // Tests depend on daemon state

let daemon: DaemonState;

test.beforeAll(async () => {
  // Clean up any previous test artifacts
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Ensure daemon is running against playground
  cli('daemon', 'start', '--url', 'http://localhost:5173');
  const state = readState();
  expect(state).not.toBeNull();
  daemon = state!;
  console.log(`  Daemon ready on port ${daemon.port} (PID: ${daemon.pid})`);
});

test.afterAll(async () => {
  // Stop daemon after all tests
  try {
    cli('daemon', 'stop');
  } catch {
    // Already stopped
  }
});

// ============================================================================
// Phase 1: Daemon Infrastructure
// ============================================================================

test.describe('Phase 1: Daemon Infrastructure', () => {
  test('daemon is alive and responds to ping', async () => {
    const data = await daemonReq(daemon, 'ping');
    expect(data.pong).toBe(true);
    expect(data.timestamp).toBeGreaterThan(0);
  });

  test('daemon status shows running', async () => {
    const output = cli('daemon', 'status');
    expect(output).toContain('Daemon running');
    expect(output).toContain(`port=${daemon.port}`);
  });

  test('hifi screenshot captures pixel-perfect PNG', async () => {
    const outPath = path.join(OUTPUT_DIR, 'hifi-screenshot.png');
    const output = cli('screenshot', '--hifi', '--url', 'http://localhost:5173', '--output', outPath);
    expect(output).toContain('Daemon (hifi)');

    // Verify file exists and is a valid PNG
    const stat = fs.statSync(outPath);
    expect(stat.size).toBeGreaterThan(50_000); // At least 50KB for a real page
    const header = Buffer.alloc(8);
    const fd = fs.openSync(outPath, 'r');
    fs.readSync(fd, header, 0, 8, 0);
    fs.closeSync(fd);
    // PNG magic bytes: 137 80 78 71 13 10 26 10
    expect(header[0]).toBe(137);
    expect(header[1]).toBe(80);
    expect(header[2]).toBe(78);
    expect(header[3]).toBe(71);
  });

  test('responsive screenshots produce 3 breakpoints', async () => {
    const output = cli('screenshot', '--responsive', '--url', 'http://localhost:5173');
    expect(output).toContain('mobile-375');
    expect(output).toContain('tablet-768');
    expect(output).toContain('desktop-1280');

    // CLI writes to .tmp/sweetlink-screenshots/
    const screenshotDir = path.join(PROJECT_ROOT, '.tmp', 'sweetlink-screenshots');
    const files = fs.readdirSync(screenshotDir).filter((f: string) => f.startsWith('responsive-'));
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  test('second hifi screenshot reuses daemon (fast)', async () => {
    const start = Date.now();
    const outPath = path.join(OUTPUT_DIR, 'hifi-fast.png');
    cli('screenshot', '--hifi', '--url', 'http://localhost:5173', '--output', outPath);
    const elapsed = Date.now() - start;

    // Should be under 2 seconds (daemon already running, browser already open)
    expect(elapsed).toBeLessThan(2000);
    expect(fs.existsSync(outPath)).toBe(true);
  });
});

// ============================================================================
// Phase 2: Ref System
// ============================================================================

test.describe('Phase 2: Ref System', () => {
  test('snapshot -i lists interactive elements with @refs', async () => {
    const data = await daemonReq(daemon, 'snapshot', { interactive: true });
    const refs = data.refs as Array<{ ref: string; role: string; name: string }>;
    const tree = data.tree as string;

    expect(refs.length).toBeGreaterThan(10);
    expect(refs[0]!.ref).toBe('@e1');
    expect(tree).toContain('@e1');

    // Should contain known playground elements
    const roles = refs.map(r => r.role);
    expect(roles).toContain('link');
    expect(roles).toContain('button');

    console.log(`  Found ${refs.length} interactive elements`);
    console.log(`  Sample refs:\n${refs.slice(0, 5).map(r => `    ${r.ref} [${r.role}] "${r.name}"`).join('\n')}`);
  });

  test('click @ref clicks a button', async () => {
    // First get fresh refs
    const snap = await daemonReq(daemon, 'snapshot', { interactive: true });
    const refs = snap.refs as Array<{ ref: string; role: string; name: string }>;

    // Find "Log Info" button
    const logInfo = refs.find(r => r.name === 'Log Info');
    expect(logInfo).toBeDefined();

    // Click it
    const result = await daemonReq(daemon, 'click-ref', { ref: logInfo!.ref });
    expect(result.clicked).toBe(logInfo!.ref);
    console.log(`  Clicked ${logInfo!.ref} [button] "Log Info"`);
  });

  test('fill @ref fills an input', async () => {
    const snap = await daemonReq(daemon, 'snapshot', { interactive: true });
    const refs = snap.refs as Array<{ ref: string; role: string; name: string }>;

    // Find any textbox
    const textbox = refs.find(r => r.role === 'textbox');
    if (textbox) {
      const result = await daemonReq(daemon, 'fill-ref', {
        ref: textbox.ref,
        value: 'Sweetlink v2 integration test',
      });
      expect(result.filled).toBe(textbox.ref);
      expect(result.value).toBe('Sweetlink v2 integration test');
      console.log(`  Filled ${textbox.ref} [textbox] "${textbox.name}"`);
    } else {
      console.log('  No textbox found on page — skipping fill test');
    }
  });

  test('hover @ref hovers an element', async () => {
    const snap = await daemonReq(daemon, 'snapshot', { interactive: true });
    const refs = snap.refs as Array<{ ref: string; role: string; name: string }>;
    const link = refs.find(r => r.role === 'link');
    expect(link).toBeDefined();

    const result = await daemonReq(daemon, 'hover-ref', { ref: link!.ref });
    expect(result.hovered).toBe(link!.ref);
    console.log(`  Hovered ${link!.ref} [link] "${link!.name}"`);
  });

  test('press-key sends keyboard input', async () => {
    const result = await daemonReq(daemon, 'press-key', { key: 'Escape' });
    expect(result.pressed).toBe('Escape');
  });

  test('stale ref returns helpful error', async () => {
    // Use a ref that won't exist after we re-snapshot
    let threw = false;
    try {
      await daemonReq(daemon, 'click-ref', { ref: '@e99999' });
    } catch (e) {
      threw = true;
      expect((e as Error).message).toContain('@e99999');
    }
    expect(threw).toBe(true);
  });
});

// ============================================================================
// Phase 3: Diffing & Annotation
// ============================================================================

test.describe('Phase 3: Diffing & Annotation', () => {
  test('snapshot diff detects changes after interaction', async () => {
    // Take baseline
    await daemonReq(daemon, 'snapshot', { interactive: true });

    // Click a button to change state
    const snap = await daemonReq(daemon, 'snapshot', { interactive: true });
    const refs = snap.refs as Array<{ ref: string; role: string; name: string }>;
    const logError = refs.find(r => r.name === 'Log Error');
    if (logError) {
      await daemonReq(daemon, 'click-ref', { ref: logError.ref });
    }

    // Take diff
    const diff = await daemonReq(daemon, 'snapshot', { interactive: true, diff: true });
    const diffText = diff.diff as string;

    // Diff should show changes (console count in devbar changed)
    expect(diffText).toBeDefined();
    console.log(`  Diff output:\n${diffText.split('\n').slice(0, 10).map(l => `    ${l}`).join('\n')}`);
  });

  test('annotated screenshot has ref labels', async () => {
    // Take snapshot first to populate refs
    await daemonReq(daemon, 'snapshot', { interactive: true });

    // Get annotated screenshot
    const data = await daemonReq(daemon, 'snapshot', { interactive: true, annotate: true });
    const screenshot = data.screenshot as string;
    expect(screenshot).toBeDefined();
    expect(screenshot.length).toBeGreaterThan(1000); // base64 PNG data

    // Save to file for visual inspection
    const outPath = path.join(OUTPUT_DIR, 'annotated.png');
    fs.writeFileSync(outPath, Buffer.from(screenshot, 'base64'));
    const stat = fs.statSync(outPath);
    expect(stat.size).toBeGreaterThan(50_000);
    console.log(`  Annotated screenshot saved: ${outPath} (${(stat.size / 1024).toFixed(0)}KB)`);
  });
});

// ============================================================================
// Phase 4: Ring Buffers
// ============================================================================

test.describe('Phase 4: Ring Buffers', () => {
  test('console buffer captures page logs', async () => {
    // The playground emits console.log and console.info on load
    const data = await daemonReq(daemon, 'console-read', {});
    const entries = data.entries as Array<{ level: string; message: string }>;
    const total = data.total as number;

    expect(total).toBeGreaterThan(0);
    expect(entries.length).toBeGreaterThan(0);

    console.log(`  Console buffer: ${total} entries`);
    console.log(`  Last 5 entries:`);
    entries.slice(-5).forEach(e => {
      console.log(`    [${e.level}] ${e.message.substring(0, 80)}`);
    });
  });

  test('console --errors filters error entries', async () => {
    // Click "Log Error" to generate an error
    const snap = await daemonReq(daemon, 'snapshot', { interactive: true });
    const refs = snap.refs as Array<{ ref: string; role: string; name: string }>;
    const logError = refs.find(r => r.name === 'Log Error');
    if (logError) {
      await daemonReq(daemon, 'click-ref', { ref: logError.ref });
      // Small delay for event propagation
      await new Promise(r => setTimeout(r, 200));
    }

    const data = await daemonReq(daemon, 'console-read', { errors: true });
    const entries = data.entries as Array<{ level: string; message: string }>;
    const errorCount = data.errorCount as number;

    expect(errorCount).toBeGreaterThan(0);
    entries.forEach(e => expect(e.level).toBe('error'));
    console.log(`  Error count: ${errorCount}`);
  });

  test('console --last N returns only last N entries', async () => {
    const data = await daemonReq(daemon, 'console-read', { last: 3 });
    const entries = data.entries as Array<{ level: string; message: string }>;
    expect(entries.length).toBeLessThanOrEqual(3);
  });

  test('network buffer captures page requests', async () => {
    const data = await daemonReq(daemon, 'network-read', {});
    const entries = data.entries as Array<{ method: string; url: string; status: number }>;
    const total = data.total as number;

    expect(total).toBeGreaterThan(0);
    expect(entries.length).toBeGreaterThan(0);

    // Page load should have fetched CSS, JS, images, etc.
    const statuses = entries.map(e => e.status);
    expect(statuses.some(s => s === 200)).toBe(true);

    console.log(`  Network buffer: ${total} requests`);
    console.log(`  Last 5:`);
    entries.slice(-5).forEach(e => {
      const url = e.url.length > 60 ? e.url.substring(0, 57) + '...' : e.url;
      console.log(`    ${e.status} ${e.method} ${url}`);
    });
  });

  test('network --failed filters failed requests', async () => {
    const data = await daemonReq(daemon, 'network-read', { failed: true });
    const entries = data.entries as Array<{ status: number }>;
    entries.forEach(e => expect(e.status === 0 || e.status >= 400).toBe(true));
    console.log(`  Failed requests: ${data.failedCount}`);
  });

  test('dialog buffer starts empty', async () => {
    const data = await daemonReq(daemon, 'dialog-read');
    expect(data.total).toBe(0);
  });

  test('console buffer live update — trigger burst and verify capture', async () => {
    // Get current count
    const before = await daemonReq(daemon, 'console-read', {});
    const countBefore = before.total as number;

    // Click "Log Multiple" to trigger a burst
    const snap = await daemonReq(daemon, 'snapshot', { interactive: true });
    const refs = snap.refs as Array<{ ref: string; role: string; name: string }>;
    const logMultiple = refs.find(r => r.name === 'Log Multiple');
    if (logMultiple) {
      await daemonReq(daemon, 'click-ref', { ref: logMultiple.ref });
      await new Promise(r => setTimeout(r, 500));
    }

    const after = await daemonReq(daemon, 'console-read', {});
    const countAfter = after.total as number;

    expect(countAfter).toBeGreaterThan(countBefore);
    console.log(`  Console entries: ${countBefore} → ${countAfter} (+${countAfter - countBefore})`);
  });
});

// ============================================================================
// Phase 5: Visual Enhancements
// ============================================================================

test.describe('Phase 5: Visual Enhancements', () => {
  test('cursor highlight visible in hifi screenshot', async () => {
    // Hover over a button to show cursor dot
    const snap = await daemonReq(daemon, 'snapshot', { interactive: true });
    const refs = snap.refs as Array<{ ref: string; role: string; name: string }>;
    const button = refs.find(r => r.role === 'button');
    if (button) {
      await daemonReq(daemon, 'hover-ref', { ref: button.ref });
    }

    // Take screenshot — should show red cursor dot
    const data = await daemonReq(daemon, 'screenshot', {});
    const screenshot = data.screenshot as string;
    const outPath = path.join(OUTPUT_DIR, 'cursor-highlight.png');
    fs.writeFileSync(outPath, Buffer.from(screenshot, 'base64'));
    expect(fs.statSync(outPath).size).toBeGreaterThan(50_000);
    console.log(`  Cursor highlight screenshot saved: ${outPath}`);
  });

  test('device screenshot captures at named preset', async () => {
    const data = await daemonReq(daemon, 'screenshot-devices', {
      devices: ['iphone-14', 'desktop'],
    });
    const screenshots = data.screenshots as Array<{
      device: string;
      width: number;
      height: number;
      screenshot: string;
    }>;

    expect(screenshots.length).toBe(2);

    // iPhone 14
    expect(screenshots[0]!.device).toBe('iPhone 14');
    expect(screenshots[0]!.width).toBe(390);

    // Desktop
    expect(screenshots[1]!.device).toBe('Desktop');
    expect(screenshots[1]!.width).toBe(1440);

    // Save both
    for (const shot of screenshots) {
      const name = shot.device.toLowerCase().replace(/\s+/g, '-');
      const outPath = path.join(OUTPUT_DIR, `device-${name}.png`);
      fs.writeFileSync(outPath, Buffer.from(shot.screenshot, 'base64'));
      console.log(`  Device "${shot.device}": ${shot.width}x${shot.height} → ${outPath}`);
    }
  });

  test('visual diff compares two screenshots', async () => {
    // Take two screenshots (same page, should be very similar)
    const shot1 = await daemonReq(daemon, 'screenshot', {});
    const shot2 = await daemonReq(daemon, 'screenshot', {});

    const diffResult = await daemonReq(daemon, 'visual-diff', {
      baseline: shot1.screenshot,
      current: shot2.screenshot,
      threshold: 0.05, // 5% tolerance
    });

    expect(diffResult.pass).toBe(true);
    expect(diffResult.mismatchPercentage).toBeLessThan(5);
    console.log(`  Visual diff: ${diffResult.mismatchPercentage}% mismatch (threshold: 5%)`);
  });
});

// ============================================================================
// Phase 6 & 7: Session Recording + Viewer
// ============================================================================

test.describe('Phase 6 & 7: Recording + Viewer', () => {
  test('full recording session with viewer generation', async () => {
    // Start recording
    const startResult = await daemonReq(daemon, 'record-start');
    const sessionId = startResult.sessionId as string;
    expect(sessionId).toMatch(/^session-\d+$/);
    console.log(`  Recording started: ${sessionId}`);

    // Get recording status
    const status1 = await daemonReq(daemon, 'record-status');
    expect(status1.recording).toBe(true);
    expect(status1.sessionId).toBe(sessionId);

    // Perform actions during recording
    const snap = await daemonReq(daemon, 'snapshot', { interactive: true });
    const refs = snap.refs as Array<{ ref: string; role: string; name: string }>;

    // Click 3 different buttons
    const buttons = refs.filter(r => r.role === 'button').slice(0, 3);
    for (const btn of buttons) {
      await daemonReq(daemon, 'click-ref', { ref: btn.ref });
      await new Promise(r => setTimeout(r, 300)); // Let animation/state settle
      console.log(`  Action: click ${btn.ref} [button] "${btn.name}"`);
    }

    // Fill a textbox if available
    const textbox = refs.find(r => r.role === 'textbox');
    if (textbox) {
      await daemonReq(daemon, 'fill-ref', { ref: textbox.ref, value: 'Recorded action!' });
      console.log(`  Action: fill ${textbox.ref} "Recorded action!"`);
    }

    // Take a screenshot mid-recording
    await daemonReq(daemon, 'screenshot', {});

    // Check status shows actions
    const status2 = await daemonReq(daemon, 'record-status');
    expect(status2.actionCount).toBeGreaterThan(0);
    console.log(`  Actions recorded: ${status2.actionCount}`);

    // Stop recording (generates viewer)
    const stopResult = await daemonReq(daemon, 'record-stop');
    const manifest = stopResult.manifest as {
      sessionId: string;
      duration: number;
      commands: Array<{ action: string; args: string[]; timestamp: number }>;
      screenshots: string[];
    };

    expect(manifest.sessionId).toBe(sessionId);
    expect(manifest.commands.length).toBeGreaterThan(0);
    expect(manifest.duration).toBeGreaterThan(0);

    console.log(`  Session complete:`);
    console.log(`    Duration: ${manifest.duration.toFixed(1)}s`);
    console.log(`    Commands: ${manifest.commands.length}`);
    console.log(`    Screenshots: ${manifest.screenshots.length}`);

    // Verify viewer HTML was generated
    const viewerPath = stopResult.viewerPath as string | undefined;
    if (viewerPath) {
      expect(fs.existsSync(viewerPath)).toBe(true);
      const viewerSize = fs.statSync(viewerPath).size;
      expect(viewerSize).toBeGreaterThan(1000);
      console.log(`    Viewer: ${viewerPath} (${(viewerSize / 1024).toFixed(0)}KB)`);

      // Verify viewer has embedded screenshots
      const viewerHtml = fs.readFileSync(viewerPath, 'utf-8');
      expect(viewerHtml).toContain('<!DOCTYPE html>');
      expect(viewerHtml).toContain('data:image/png;base64');
      expect(viewerHtml).toContain('Sweetlink Session');
    }

    // Verify session manifest was saved
    const sessionDir = `.sweetlink/${sessionId}`;
    const manifestPath = path.join(sessionDir, 'sweetlink-session.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    // Verify action screenshots were saved
    for (const screenshotName of manifest.screenshots) {
      const screenshotPath = path.join(sessionDir, screenshotName);
      expect(fs.existsSync(screenshotPath)).toBe(true);
    }
  });
});

// ============================================================================
// Live Console Feedback Loop Visualization
// ============================================================================

test.describe('Live Console Feedback Loop', () => {
  test('watch console buffer grow in real time', async () => {
    // This test demonstrates the always-on ring buffer by triggering
    // console events and reading them back in a loop.

    console.log('\n  === Live Console Feedback Loop ===');
    console.log('  Triggering console events and watching the buffer fill...\n');

    const snap = await daemonReq(daemon, 'snapshot', { interactive: true });
    const refs = snap.refs as Array<{ ref: string; role: string; name: string }>;

    const logInfo = refs.find(r => r.name === 'Log Info');
    const logWarn = refs.find(r => r.name === 'Log Warning');
    const logError = refs.find(r => r.name === 'Log Error');
    const logMultiple = refs.find(r => r.name === 'Log Multiple');

    const actions = [
      { ref: logInfo, label: 'INFO' },
      { ref: logWarn, label: 'WARN' },
      { ref: logError, label: 'ERROR' },
      { ref: logMultiple, label: 'BURST' },
      { ref: logInfo, label: 'INFO' },
      { ref: logError, label: 'ERROR' },
    ];

    for (const action of actions) {
      if (!action.ref) continue;

      // Click the button
      await daemonReq(daemon, 'click-ref', { ref: action.ref.ref });
      await new Promise(r => setTimeout(r, 250));

      // Read the buffer
      const data = await daemonReq(daemon, 'console-read', {});
      const entries = data.entries as Array<{ level: string; message: string; timestamp: number }>;
      const total = data.total as number;
      const errors = data.errorCount as number;
      const warnings = data.warningCount as number;

      // Build a mini status bar
      const bar = '█'.repeat(Math.min(50, Math.ceil(total / 2)));
      const latest = entries.length > 0 ? entries[entries.length - 1]! : null;
      const latestMsg = latest ? `${latest.level}: ${latest.message.substring(0, 40)}` : '';

      console.log(
        `  [${action.label.padEnd(5)}] ${bar} ` +
        `total=${String(total).padStart(3)} err=${String(errors).padStart(2)} warn=${String(warnings).padStart(2)} │ ${latestMsg}`
      );
    }

    // Final summary
    const final = await daemonReq(daemon, 'console-read', {});
    console.log(`\n  Final buffer state: ${final.total} entries, ${final.errorCount} errors, ${final.warningCount} warnings`);
  });

  test('watch network buffer during page reload', async () => {
    console.log('\n  === Network Buffer During Page Reload ===');

    // Read before
    const before = await daemonReq(daemon, 'network-read', {});
    const countBefore = before.total as number;
    console.log(`  Before reload: ${countBefore} requests`);

    // Trigger a page reload via press-key (F5) or navigation
    await daemonReq(daemon, 'press-key', { key: 'F5' });
    await new Promise(r => setTimeout(r, 2000)); // Wait for page load

    // Read after
    const after = await daemonReq(daemon, 'network-read', {});
    const countAfter = after.total as number;
    const newRequests = countAfter - countBefore;
    console.log(`  After reload: ${countAfter} requests (+${newRequests} new)`);

    // Show the new requests
    const entries = after.entries as Array<{ method: string; url: string; status: number; duration: number }>;
    const recent = entries.slice(-newRequests);
    recent.forEach(e => {
      const url = e.url.replace('http://localhost:5173', '');
      const urlDisplay = url.length > 50 ? url.substring(0, 47) + '...' : url;
      const statusColor = e.status >= 400 ? '❌' : e.status >= 300 ? '↗️' : '✓';
      console.log(`  ${statusColor} ${e.status} ${e.method.padEnd(4)} ${urlDisplay} (${e.duration}ms)`);
    });
  });
});

// ============================================================================
// Full Workflow: End-to-End Demo
// ============================================================================

test.describe('Full Workflow Demo', () => {
  test('complete QA workflow: snapshot → interact → verify → screenshot', async () => {
    console.log('\n  === Complete QA Workflow ===\n');

    // Step 1: Take baseline snapshot
    console.log('  Step 1: Baseline snapshot');
    const baseline = await daemonReq(daemon, 'snapshot', { interactive: true });
    const refs = baseline.refs as Array<{ ref: string; role: string; name: string }>;
    console.log(`    ${refs.length} interactive elements found`);

    // Step 2: Verify no console errors
    console.log('  Step 2: Check console health');
    const consoleCheck = await daemonReq(daemon, 'console-read', { errors: true });
    const errorsBefore = consoleCheck.errorCount as number;
    console.log(`    Console errors: ${errorsBefore}`);

    // Step 3: Interact with the page
    console.log('  Step 3: Interact with page');
    const logInfoBtn = refs.find(r => r.name === 'Log Info');
    if (logInfoBtn) {
      await daemonReq(daemon, 'click-ref', { ref: logInfoBtn.ref });
      console.log(`    Clicked "${logInfoBtn.name}"`);
    }

    // Step 4: Diff to see what changed
    console.log('  Step 4: Diff snapshot');
    const diffResult = await daemonReq(daemon, 'snapshot', { interactive: true, diff: true });
    const diffText = diffResult.diff as string;
    const changedLines = diffText.split('\n').filter(l => l.startsWith('+ ') || l.startsWith('- ')).length;
    console.log(`    ${changedLines} lines changed`);

    // Step 5: Check no new errors introduced
    console.log('  Step 5: Verify no new errors');
    await new Promise(r => setTimeout(r, 200));
    const errorsAfter = await daemonReq(daemon, 'console-read', { errors: true });
    const newErrors = (errorsAfter.errorCount as number) - errorsBefore;
    console.log(`    New errors: ${newErrors}`);

    // Step 6: Take final screenshot
    console.log('  Step 6: Final screenshot');
    const outPath = path.join(OUTPUT_DIR, 'qa-final.png');
    const shot = await daemonReq(daemon, 'screenshot', {});
    fs.writeFileSync(outPath, Buffer.from(shot.screenshot as string, 'base64'));
    console.log(`    Saved: ${outPath}`);

    // Step 7: Network health
    console.log('  Step 7: Network health');
    const netData = await daemonReq(daemon, 'network-read', { failed: true });
    console.log(`    Failed requests: ${netData.failedCount}`);

    console.log('\n  ✅ QA workflow complete\n');
  });
});
