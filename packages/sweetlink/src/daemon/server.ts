/**
 * Daemon HTTP Server
 *
 * Localhost-only HTTP server with bearer token auth.
 * Routes POST requests to /api/{action} and dispatches to handlers.
 * Manages idle timer for auto-shutdown.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import {
  closeBrowser,
  getBrowserInstance,
  getPage,
  initBrowser,
  takeResponsiveScreenshots,
  takeScreenshot,
} from './browser.js';
import { takeDeviceScreenshots } from './devices.js';
import { annotateScreenshot, diffSnapshots } from './diff.js';
import { detectServerErrors } from './errorPatterns.js';
import {
  consoleBuffer,
  dialogBuffer,
  formatConsoleEntries,
  formatNetworkEntries,
  getErrorCount,
  getWarningCount,
  networkBuffer,
} from './listeners.js';
import {
  getRecordingEventCursors,
  getRecordingPage,
  getRecordingStatus,
  isRecording,
  logAction,
  pauseRecording,
  resumeRecording,
  startRecording,
  stopRecording,
} from './recording.js';
import {
  buildRefMap,
  checkRefStale,
  formatRefMap,
  getBaseline,
  getCurrentRefMap,
  resolveRef,
  setBaseline,
} from './refs.js';
import { generateSummary } from './summary.js';
import type {
  DaemonAction,
  DaemonResponse,
  ResponsiveScreenshotParams,
  ScreenshotParams,
} from './types.js';
import { DAEMON_IDLE_TIMEOUT_MS, DEFAULT_RESPONSIVE_VIEWPORTS } from './types.js';
import { escapeHtml } from './utils.js';
import { generateViewer } from './viewer.js';
import { visualDiff } from './visualDiff.js';

type Locator = import('playwright').Locator;
type Page = import('playwright').Page;
type DaemonHandler = (params: Record<string, unknown>, url: string) => Promise<DaemonResponse>;

interface InspectActionEntry {
  action: string;
  target?: string;
  result?: string;
}

interface InspectPageInfo {
  url: string;
  title: string;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
  vitals: {
    fcp: number | null;
    pageSize: number | null;
  };
}

// ============================================================================
// State
// ============================================================================

let httpServer: ReturnType<typeof createServer> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let shutdownCallback: (() => void) | null = null;
let daemonPort: number | null = null;

// ============================================================================
// Idle Timer
// ============================================================================

let idleWarnTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (idleWarnTimer) clearTimeout(idleWarnTimer);
  // Warn at 80% so users running long sessions get a heads-up before
  // the daemon dies under them.
  const warnAt = Math.floor(DAEMON_IDLE_TIMEOUT_MS * 0.8);
  idleWarnTimer = setTimeout(() => {
    const remainingSec = Math.round((DAEMON_IDLE_TIMEOUT_MS - warnAt) / 1000);
    console.error(
      `[Daemon] ⚠ Idle for ${Math.round(warnAt / 1000)}s — will shut down in ${remainingSec}s if no further requests arrive.`
    );
  }, warnAt);
  idleTimer = setTimeout(() => {
    console.error('[Daemon] Idle timeout reached. Shutting down...');
    shutdown();
  }, DAEMON_IDLE_TIMEOUT_MS);
}

// ============================================================================
// Action Handlers
// ============================================================================

async function handlePing(): Promise<DaemonResponse> {
  return { ok: true, data: { pong: true, timestamp: Date.now() } };
}

async function handleShutdown(): Promise<DaemonResponse> {
  // Schedule shutdown after response is sent
  setTimeout(() => shutdown(), 100);
  return { ok: true, data: { message: 'Daemon shutting down' } };
}

async function handleScreenshot(params: ScreenshotParams, url: string): Promise<DaemonResponse> {
  await initBrowser(url);

  // During a recording, screenshots must target the recording page so the
  // captured image matches what the video shows, and the action is logged
  // into the session manifest.
  const recPage = getRecordingPage();
  const targetPage = recPage ?? undefined;

  const padding = (params as ScreenshotParams & { padding?: number }).padding;
  const theme = (params as ScreenshotParams & { theme?: 'light' | 'dark' | 'no-preference' }).theme;
  const { buffer, width, height, matchCount, pageHeight, viewportHeight } = await takeScreenshot({
    selector: params.selector,
    fullPage: params.fullPage,
    viewport: params.viewport,
    padding: typeof padding === 'number' ? padding : undefined,
    theme,
    page: targetPage,
  });

  if (recPage && isRecording()) {
    const args: string[] = [];
    if (params.selector) args.push(`--selector=${params.selector}`);
    if (params.fullPage) args.push('--full-page');
    if (params.viewport) args.push(`--viewport=${params.viewport}`);
    await logAction('screenshot', args, recPage);
  }

  return {
    ok: true,
    data: {
      screenshot: buffer.toString('base64'),
      width,
      height,
      matchCount,
      pageHeight,
      viewportHeight,
    },
  };
}

async function handleResponsiveScreenshot(
  params: ResponsiveScreenshotParams,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const viewports = params.viewports ?? DEFAULT_RESPONSIVE_VIEWPORTS;
  // Default to fullPage so users see the page in its entirety at each
  // breakpoint — that's the typical reason to invoke `--responsive`.
  // Caller can pass `fullPage: false` explicitly to opt out.
  const fullPage = params.fullPage !== false;
  const results = await takeResponsiveScreenshots({
    viewports,
    fullPage,
  });

  return {
    ok: true,
    data: {
      screenshots: results.map((r) => ({
        width: r.width,
        height: r.height,
        screenshot: r.buffer.toString('base64'),
        label: r.label,
      })),
    },
  };
}

// ============================================================================
// Ref System Handlers
// ============================================================================

async function handleSnapshot(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const recPage = getRecordingPage();
  const page = recPage ?? getPage();
  const interactive = params.interactive as boolean | undefined;
  const diff = params.diff as boolean | undefined;
  const annotate = params.annotate as boolean | undefined;

  // If diffing, we need the baseline before taking new snapshot
  const baseline = diff ? getBaseline() : null;

  const resolved = await buildRefMap(page, { interactive: interactive !== false });

  // Handle diff mode
  if (diff) {
    if (!baseline) {
      return {
        ok: false,
        error:
          'No baseline snapshot to diff against. Run `snapshot` first, then make changes, then `snapshot -D`.',
      };
    }
    const diffText = diffSnapshots(baseline, resolved);
    setBaseline(); // Update baseline for next diff
    return {
      ok: true,
      data: {
        diff: diffText,
        tree: formatRefMap(resolved),
        refs: resolved.entries,
        count: resolved.entries.length,
      },
    };
  }

  // Handle annotated screenshot mode
  if (annotate) {
    const currentRefs = getCurrentRefMap();
    if (!currentRefs || currentRefs.entries.length === 0) {
      return { ok: false, error: 'No refs to annotate. Run `snapshot -i` first.' };
    }
    const buffer = await annotateScreenshot(page, currentRefs);
    // Pull dims from the PNG IHDR so callers don't see undefined.
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    setBaseline();
    return {
      ok: true,
      data: {
        screenshot: buffer.toString('base64'),
        width,
        height,
        tree: formatRefMap(resolved),
        refs: resolved.entries,
        count: resolved.entries.length,
      },
    };
  }

  // Default: set as baseline for future diffs
  setBaseline();

  return {
    ok: true,
    data: {
      tree: formatRefMap(resolved),
      refs: resolved.entries,
      count: resolved.entries.length,
      rawSnapshot: resolved.rawSnapshot,
    },
  };
}

/**
 * Capture a screenshot of `page` and stash it under `.sweetlink/failures/`
 * so users can see what state the page was in when an action failed.
 * Returns the relative path or `undefined` if capture itself failed.
 */
async function captureFailure(page: Page, reason: string): Promise<string | undefined> {
  try {
    const { promises: fsp } = await import('fs');
    const dir = '.sweetlink/failures';
    await fsp.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const slug = reason
      .replace(/[^a-z0-9]/gi, '-')
      .slice(0, 40)
      .toLowerCase();
    const filePath = `${dir}/${stamp}-${slug}.png`;
    const buf = await page.screenshot({ fullPage: false });
    await fsp.writeFile(filePath, buf);
    return filePath;
  } catch {
    return undefined;
  }
}

function failureData(
  page: Page,
  details: Record<string, unknown>,
  failureScreenshot?: string
): Record<string, unknown> {
  return {
    currentUrl: page.url(),
    ...details,
    ...(failureScreenshot ? { failureScreenshot } : {}),
  };
}

function slugifyArtifact(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 72) || 'inspect'
  );
}

function normalizeActionTranscript(value: unknown): InspectActionEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const action = typeof record.action === 'string' ? record.action : undefined;
    if (!action) return [];
    return [
      {
        action,
        target: typeof record.target === 'string' ? record.target : undefined,
        result: typeof record.result === 'string' ? record.result : undefined,
      },
    ];
  });
}

async function getPageInfo(page: Page): Promise<InspectPageInfo> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0] as
      | PerformanceEntry
      | undefined;
    return {
      url: location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        deviceScaleFactor: window.devicePixelRatio,
      },
      vitals: {
        fcp: fcp ? Math.round(fcp.startTime) : null,
        pageSize: nav ? nav.transferSize || nav.encodedBodySize || null : null,
      },
    };
  });
}

async function getAxeSource(): Promise<string | null> {
  try {
    const axeModule = await import('axe-core');
    const candidate = axeModule as unknown as {
      default?: { source?: string };
      source?: string;
    };
    return candidate.source ?? candidate.default?.source ?? null;
  } catch {
    return null;
  }
}

async function runInspectA11y(page: Page): Promise<Record<string, unknown>> {
  const source = await getAxeSource();
  if (!source) {
    return {
      ok: false,
      error: 'axe-core is not available in this environment',
    };
  }

  try {
    await page.addScriptTag({ content: source });
    return await page.evaluate(async () => {
      type AxeNode = {
        target?: string[];
        html?: string;
        failureSummary?: string;
        any?: Array<{ message?: string }>;
        all?: Array<{ message?: string }>;
        none?: Array<{ message?: string }>;
      };
      type AxeIssue = {
        id: string;
        impact?: string;
        description?: string;
        help?: string;
        helpUrl?: string;
        nodes?: AxeNode[];
      };
      type AxeResult = {
        violations: AxeIssue[];
        incomplete: AxeIssue[];
        passes: unknown[];
      };

      const axe = (
        window as unknown as {
          axe?: {
            run: (context?: unknown, options?: unknown) => Promise<AxeResult>;
          };
        }
      ).axe;
      if (!axe) throw new Error('axe-core did not initialize on the page');

      const compactIssue = (issue: AxeIssue) => ({
        id: issue.id,
        impact: issue.impact ?? 'unknown',
        help: issue.help ?? '',
        description: issue.description ?? '',
        helpUrl: issue.helpUrl ?? '',
        nodes: (issue.nodes ?? []).slice(0, 3).map((node) => ({
          target: (node.target ?? []).join(' '),
          html: (node.html ?? '').slice(0, 180),
          summary:
            node.failureSummary ??
            node.any?.[0]?.message ??
            node.all?.[0]?.message ??
            node.none?.[0]?.message ??
            '',
        })),
      });

      const result = await axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
        },
        rules: {
          'color-contrast': { enabled: true },
        },
      });

      const byImpact: Record<string, number> = {};
      for (const violation of result.violations) {
        const impact = violation.impact ?? 'unknown';
        byImpact[impact] = (byImpact[impact] ?? 0) + 1;
      }

      return {
        ok: true,
        summary: {
          violations: result.violations.length,
          incomplete: result.incomplete.length,
          passes: result.passes.length,
          byImpact,
        },
        violations: result.violations.map(compactIssue),
        incomplete: result.incomplete.map(compactIssue),
      };
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function inspectNextActions(
  counts: {
    refs: number;
    consoleErrors: number;
    consoleWarnings: number;
    networkFailures: number;
    a11yViolations?: number;
    a11yIncomplete?: number;
  },
  artifacts: { summaryMarkdown: string; screenshotPng: string; a11yJson?: string }
): string[] {
  const actions = [
    `Open ${artifacts.summaryMarkdown} and ${artifacts.screenshotPng} before making visual claims.`,
  ];

  if (counts.consoleErrors > 0) {
    actions.push('Investigate console errors before changing UI behavior.');
  } else if (counts.consoleWarnings > 0) {
    actions.push('Review console warnings for stale props, hydration, or deprecated API signals.');
  }

  if (counts.networkFailures > 0) {
    actions.push('Inspect failed network entries before assuming the UI state is a component bug.');
  }

  if ((counts.a11yViolations ?? 0) > 0 || (counts.a11yIncomplete ?? 0) > 0) {
    actions.push(
      `Use ${artifacts.a11yJson ?? 'the a11y artifact'} to prioritize accessibility fixes.`
    );
  }

  if (counts.refs > 0) {
    actions.push('Use @e refs for click/fill/press actions, then rerun inspect after DOM changes.');
  } else {
    actions.push(
      'No interactive refs were found; inspect the DOM/outline before attempting actions.'
    );
  }

  return actions;
}

function renderInspectSummary(data: {
  url: string;
  title: string;
  generatedAt: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  vitals: { fcp: number | null; pageSize: number | null };
  artifacts: Record<string, string | undefined>;
  counts: {
    refs: number;
    consoleEntries: number;
    consoleErrors: number;
    consoleWarnings: number;
    networkEntries: number;
    networkFailures: number;
    a11yViolations?: number;
    a11yIncomplete?: number;
  };
  refs: Array<{ ref: string; role: string; name: string }>;
  consoleText: string;
  networkText: string;
  a11y?: Record<string, unknown>;
  expectedOutcome?: string;
  actionTranscript: InspectActionEntry[];
  nextActions: string[];
}): string {
  const transcript =
    data.actionTranscript.length > 0
      ? data.actionTranscript
          .map((entry, index) => {
            const target = entry.target ? ` target=${entry.target}` : '';
            const result = entry.result ? ` result=${entry.result}` : '';
            return `${index + 1}. ${entry.action}${target}${result}`;
          })
          .join('\n')
      : '(none supplied)';

  const refs =
    data.refs.length > 0
      ? data.refs.map((ref) => `- ${ref.ref} [${ref.role}] "${ref.name}"`).join('\n')
      : '(no interactive refs)';

  const a11ySummary = data.a11y
    ? JSON.stringify(data.a11y.summary ?? { ok: data.a11y.ok, error: data.a11y.error }, null, 2)
    : '(skipped)';

  return [
    '# Sweetlink Inspect',
    '',
    `- URL: ${data.url}`,
    `- Title: ${data.title || '(untitled)'}`,
    `- Generated: ${data.generatedAt}`,
    `- Viewport: ${data.viewport.width}x${data.viewport.height} @${data.viewport.deviceScaleFactor}x`,
    `- FCP: ${data.vitals.fcp ?? 'n/a'}ms`,
    `- Page size: ${data.vitals.pageSize ?? 'n/a'} bytes`,
    '',
    '## Expected Outcome',
    '',
    data.expectedOutcome ?? '(not supplied)',
    '',
    '## Action Transcript',
    '',
    transcript,
    '',
    '## Counts',
    '',
    `- Interactive refs: ${data.counts.refs}`,
    `- Console: ${data.counts.consoleEntries} entries, ${data.counts.consoleErrors} errors, ${data.counts.consoleWarnings} warnings`,
    `- Network: ${data.counts.networkEntries} entries, ${data.counts.networkFailures} failures`,
    `- Accessibility: ${data.counts.a11yViolations ?? 'n/a'} violations, ${data.counts.a11yIncomplete ?? 'n/a'} incomplete`,
    '',
    '## Next Actions',
    '',
    data.nextActions.map((action) => `- ${action}`).join('\n'),
    '',
    '## Artifacts',
    '',
    ...Object.entries(data.artifacts).map(
      ([key, value]) => `- ${key}: ${value ?? '(not generated)'}`
    ),
    '',
    '## Interactive Refs',
    '',
    refs,
    '',
    '## Console',
    '',
    data.consoleText,
    '',
    '## Network',
    '',
    data.networkText,
    '',
    '## Accessibility',
    '',
    a11ySummary,
    '',
  ].join('\n');
}

async function handleInspect(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const page = getRecordingPage() ?? getPage();
  const pageInfo = await getPageInfo(page);
  const generatedAt = new Date().toISOString();
  const label = typeof params.label === 'string' ? params.label : 'inspect';
  const stamp = generatedAt.replace(/[:.]/g, '-');
  const { promises: fsp } = await import('fs');
  const path = await import('path');
  const dir = path.resolve(`.sweetlink/inspect/${stamp}-${slugifyArtifact(label)}`);
  await fsp.mkdir(dir, { recursive: true });

  const lastRaw = typeof params.last === 'number' ? params.last : Number(params.last);
  const last = Number.isFinite(lastRaw) && lastRaw > 0 ? Math.min(Math.floor(lastRaw), 500) : 50;
  const includeA11y = params.includeA11y !== false;
  const expectedOutcome =
    typeof params.expectedOutcome === 'string' ? params.expectedOutcome : undefined;
  const actionTranscript = normalizeActionTranscript(params.actionTranscript);

  const refMap = await buildRefMap(page, { interactive: true });
  const snapshotText = formatRefMap(refMap);
  const screenshotBuffer = await page.screenshot({ fullPage: true });
  const eventCursors = getRecordingEventCursors();
  const consoleEntries = (
    eventCursors ? consoleBuffer.since(eventCursors.consoleStartCursor) : consoleBuffer.toArray()
  ).slice(-last);
  const networkEntries = (
    eventCursors ? networkBuffer.since(eventCursors.networkStartCursor) : networkBuffer.toArray()
  ).slice(-last);
  const consoleText = formatConsoleEntries(consoleEntries);
  const networkText = formatNetworkEntries(networkEntries);
  const a11y = includeA11y ? await runInspectA11y(page) : undefined;

  const artifacts = {
    dir,
    summaryMarkdown: path.join(dir, 'SUMMARY.md'),
    contextJson: path.join(dir, 'context.json'),
    screenshotPng: path.join(dir, 'screenshot.png'),
    snapshotMarkdown: path.join(dir, 'snapshot.md'),
    consoleText: path.join(dir, 'console.txt'),
    networkText: path.join(dir, 'network.txt'),
    a11yJson: includeA11y ? path.join(dir, 'a11y.json') : undefined,
  };

  const a11ySummary = a11y?.summary as { violations?: number; incomplete?: number } | undefined;
  const counts = {
    refs: refMap.entries.length,
    consoleEntries: consoleEntries.length,
    consoleErrors: consoleEntries.filter((entry) => entry.level === 'error').length,
    consoleWarnings: consoleEntries.filter((entry) => entry.level === 'warning').length,
    networkEntries: networkEntries.length,
    networkFailures: networkEntries.filter((entry) => entry.status >= 400 || entry.status === 0)
      .length,
    a11yViolations: a11ySummary?.violations,
    a11yIncomplete: a11ySummary?.incomplete,
  };
  const nextActions = inspectNextActions(counts, artifacts);

  const context = {
    url: pageInfo.url,
    title: pageInfo.title,
    generatedAt,
    viewport: pageInfo.viewport,
    vitals: pageInfo.vitals,
    artifacts,
    counts,
    refs: refMap.entries,
    console: { entries: consoleEntries, formatted: consoleText },
    network: { entries: networkEntries, formatted: networkText },
    a11y,
    expectedOutcome,
    actionTranscript,
    failureArtifacts: [],
    nextActions,
  };

  await fsp.writeFile(artifacts.screenshotPng, screenshotBuffer);
  await fsp.writeFile(artifacts.snapshotMarkdown, snapshotText, 'utf-8');
  await fsp.writeFile(artifacts.consoleText, consoleText, 'utf-8');
  await fsp.writeFile(artifacts.networkText, networkText, 'utf-8');
  if (artifacts.a11yJson) {
    await fsp.writeFile(artifacts.a11yJson, JSON.stringify(a11y ?? null, null, 2), 'utf-8');
  }
  const summary = renderInspectSummary({
    url: context.url,
    title: context.title,
    generatedAt: context.generatedAt,
    viewport: context.viewport,
    vitals: context.vitals,
    artifacts: context.artifacts,
    counts: context.counts,
    refs: context.refs,
    consoleText,
    networkText,
    a11y,
    expectedOutcome,
    actionTranscript,
    nextActions,
  });
  await fsp.writeFile(artifacts.summaryMarkdown, summary, 'utf-8');
  await fsp.writeFile(artifacts.contextJson, JSON.stringify(context, null, 2), 'utf-8');

  return { ok: true, data: context as unknown as Record<string, unknown> };
}

async function handleClickRef(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);

  // Use recording page if recording, otherwise main page
  const recPage = getRecordingPage();
  const page = recPage ?? getPage();
  const ref = params.ref as string;

  if (!ref) return { ok: false, error: 'Missing ref parameter' };

  const stale = await checkRefStale(page, ref);
  if (stale) {
    const failureScreenshot = await captureFailure(page, `stale-ref-${ref}`);
    return {
      ok: false,
      error: `Ref ${ref} is stale — element no longer exists. Run \`snapshot\` to get fresh refs.`,
      data: failureData(
        page,
        {
          action: 'click-ref',
          ref,
          staleRef: true,
          remediation:
            'Run `sweetlink snapshot -i` or `sweetlink inspect` to refresh refs before retrying.',
        },
        failureScreenshot
      ),
    };
  }

  const locator = resolveRef(page, ref);

  // Fail fast if the element is disabled — without this check, Playwright's
  // click would wait for the default 30s before throwing.
  const enabled = await locator.isEnabled().catch(() => true);
  if (!enabled) {
    const failureScreenshot = await captureFailure(page, `disabled-${ref}`);
    return {
      ok: false,
      error: `Ref ${ref} is disabled — cannot click.`,
      data: failureData(
        page,
        {
          action: 'click-ref',
          ref,
          disabled: true,
          remediation:
            'Wait for the control to become enabled or choose a different interactive ref.',
        },
        failureScreenshot
      ),
    };
  }

  const box = await locator.boundingBox();
  const t0 = Date.now();
  try {
    await locator.click();
  } catch (error) {
    const failureScreenshot = await captureFailure(page, `click-failed-${ref}`);
    return {
      ok: false,
      error: `Click failed for ${ref}: ${error instanceof Error ? error.message : String(error)}`,
      data: failureData(
        page,
        {
          action: 'click-ref',
          ref,
          remediation:
            'Inspect the failure screenshot and rerun `sweetlink snapshot -i` if the layout changed.',
        },
        failureScreenshot
      ),
    };
  }
  const durationMs = Date.now() - t0;

  // Log action if recording
  if (isRecording()) {
    await logAction('click', [ref], page, box ?? undefined, durationMs);
  }

  return { ok: true, data: { clicked: ref, duration: durationMs } };
}

async function handleFillRef(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const recPage = getRecordingPage();
  const page = recPage ?? getPage();
  const ref = params.ref as string;
  const value = params.value as string;

  if (!ref) return { ok: false, error: 'Missing ref parameter' };
  if (value === undefined) return { ok: false, error: 'Missing value parameter' };

  const stale = await checkRefStale(page, ref);
  if (stale) {
    const failureScreenshot = await captureFailure(page, `stale-fill-ref-${ref}`);
    return {
      ok: false,
      error: `Ref ${ref} is stale — element no longer exists. Run \`snapshot\` to get fresh refs.`,
      data: failureData(
        page,
        {
          action: 'fill-ref',
          ref,
          staleRef: true,
          remediation:
            'Run `sweetlink snapshot -i` or `sweetlink inspect` to refresh refs before retrying.',
        },
        failureScreenshot
      ),
    };
  }

  const locator = resolveRef(page, ref);

  // Fail fast for non-fillable elements (e.g. <option>, <select>, <button>) —
  // Playwright's fill() would otherwise wait 30s for the editable check.
  const editable = await locator.isEditable().catch(() => false);
  if (!editable) {
    const failureScreenshot = await captureFailure(page, `non-editable-${ref}`);
    return {
      ok: false,
      error: `Ref ${ref} is not editable (use click-ref/press-key for non-text inputs).`,
      data: failureData(
        page,
        {
          action: 'fill-ref',
          ref,
          nonEditable: true,
          remediation:
            'Use `fill-ref` only on editable inputs, textareas, or contenteditable fields.',
        },
        failureScreenshot
      ),
    };
  }

  const box = await locator.boundingBox();
  const t0 = Date.now();
  try {
    await locator.fill(value);
  } catch (error) {
    const failureScreenshot = await captureFailure(page, `fill-failed-${ref}`);
    return {
      ok: false,
      error: `Fill failed for ${ref}: ${error instanceof Error ? error.message : String(error)}`,
      data: failureData(
        page,
        {
          action: 'fill-ref',
          ref,
          remediation:
            'Inspect the failure screenshot and rerun `sweetlink snapshot -i` if the target changed.',
        },
        failureScreenshot
      ),
    };
  }
  const durationMs = Date.now() - t0;

  if (isRecording()) {
    await logAction('fill', [ref, value], page, box ?? undefined, durationMs);
  }

  return { ok: true, data: { filled: ref, value, duration: durationMs } };
}

async function handleClickCss(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);

  // Route to the recording page when a session is active so the click
  // appears in the video and gets logged into the manifest.
  const recPage = getRecordingPage();
  const page = recPage ?? getPage();

  const selector = params.selector as string | undefined;
  const text = params.text as string | undefined;
  const index = (params.index as number | undefined) ?? 0;

  if (!selector && !text) {
    return { ok: false, error: 'Missing selector or text parameter' };
  }

  let locator: Locator;
  if (selector && text) {
    locator = page.locator(selector, { hasText: text });
  } else if (selector) {
    locator = page.locator(selector);
  } else {
    locator = page.getByText(text!, { exact: false });
  }
  const target = locator.nth(index);

  try {
    await target.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    const found = await locator.count();
    const failureScreenshot = await captureFailure(
      page,
      `no-element-${selector ?? text ?? 'unknown'}`
    );
    return {
      ok: false,
      error: `No element found matching: ${selector ?? text} (${found} matches)`,
      data: failureData(
        page,
        {
          action: 'click-css',
          selector,
          text,
          index,
          matchCount: found,
          remediation:
            'Update the selector/text or run `sweetlink inspect` to verify the current DOM.',
        },
        failureScreenshot
      ),
    };
  }

  const box = await target.boundingBox();

  // Occlusion check: if the element's center is covered by a different
  // element (e.g. a sticky modal/overlay), Playwright's click would wait
  // for actionability and time out with a generic message. Probe up
  // front so we can return a useful error.
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    type OcclusionInfo = { ours: boolean; coveredBy?: string };
    const info: OcclusionInfo = await page.evaluate(
      ({ cx, cy, sel }) => {
        const intended = sel ? document.querySelector(sel) : null;
        const top = document.elementFromPoint(cx, cy);
        if (!top || !intended) return { ours: true };
        if (top === intended || intended.contains(top)) return { ours: true };
        const desc = [
          top.tagName.toLowerCase(),
          top.id ? `#${top.id}` : '',
          top.className && typeof top.className === 'string'
            ? `.${top.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`
            : '',
        ].join('');
        return { ours: false, coveredBy: desc };
      },
      { cx, cy, sel: selector ?? null }
    );
    if (!info.ours) {
      const failureScreenshot = await captureFailure(page, `occluded-${selector ?? text}`);
      return {
        ok: false,
        error: `Click target ${selector ?? text} is covered by <${info.coveredBy}>. Dismiss the overlay first.`,
        data: failureData(
          page,
          {
            action: 'click-css',
            selector,
            text,
            index,
            coveredBy: info.coveredBy,
            remediation: 'Scroll, close overlays, or click a visible target before retrying.',
          },
          failureScreenshot
        ),
      };
    }
  }

  const t0 = Date.now();
  try {
    await target.click();
  } catch (error) {
    const failureScreenshot = await captureFailure(page, `click-css-failed-${selector ?? text}`);
    return {
      ok: false,
      error: `Click failed for ${selector ?? text}: ${error instanceof Error ? error.message : String(error)}`,
      data: failureData(
        page,
        {
          action: 'click-css',
          selector,
          text,
          index,
          remediation:
            'Inspect the failure screenshot and rerun `sweetlink inspect` if the layout changed.',
        },
        failureScreenshot
      ),
    };
  }
  const durationMs = Date.now() - t0;

  const tag = await target.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'unknown');
  const found = await locator.count();

  if (isRecording()) {
    const args: string[] = [];
    if (selector) args.push(`--selector=${selector}`);
    if (text) args.push(`--text=${text}`);
    if (index > 0) args.push(`--index=${index}`);
    await logAction('click', args, page, box ?? undefined, durationMs);
  }

  return { ok: true, data: { clicked: tag, found, index, duration: durationMs } };
}

async function handleHoverRef(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const page = getPage();
  const ref = params.ref as string;

  if (!ref) return { ok: false, error: 'Missing ref parameter' };

  const stale = await checkRefStale(page, ref);
  if (stale) {
    return {
      ok: false,
      error: `Ref ${ref} is stale — element no longer exists. Run \`snapshot\` to get fresh refs.`,
    };
  }

  const locator = resolveRef(page, ref);
  await locator.hover();
  return { ok: true, data: { hovered: ref } };
}

async function handlePressKey(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const page = getPage();
  const key = params.key as string;

  if (!key) return { ok: false, error: 'Missing key parameter' };

  await page.keyboard.press(key);
  return { ok: true, data: { pressed: key } };
}

// ============================================================================
// Ring Buffer Handlers
// ============================================================================

async function handleConsoleRead(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  // Ensure the configured page is loaded so the listeners have something to
  // observe. Without this, a fresh daemon returns an empty buffer with no
  // explanation.
  await initBrowser(url);

  const errorsOnly = params.errors as boolean | undefined;
  const last = params.last as number | undefined;

  let entries = errorsOnly
    ? consoleBuffer.filter((e) => e.level === 'error')
    : consoleBuffer.toArray();

  if (last) {
    entries = entries.slice(-last);
  }

  return {
    ok: true,
    data: {
      entries,
      formatted: formatConsoleEntries(entries),
      total: consoleBuffer.size,
      errorCount: getErrorCount(),
      warningCount: getWarningCount(),
    },
  };
}

async function handleNetworkRead(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  // Toggle body capture BEFORE any navigation so body buffers populate
  // for the current page-load.
  if (params.withBody) {
    const { setCaptureBodies } = await import('./listeners.js');
    setCaptureBodies(true);
  }
  await initBrowser(url);
  const failedOnly = params.failed as boolean | undefined;
  const last = params.last as number | undefined;

  let entries = failedOnly
    ? networkBuffer.filter((e) => e.status >= 400 || e.status === 0)
    : networkBuffer.toArray();

  if (last) {
    entries = entries.slice(-last);
  }

  return {
    ok: true,
    data: {
      entries,
      formatted: formatNetworkEntries(entries),
      total: networkBuffer.size,
      failedCount: networkBuffer.filter((e) => e.status >= 400 || e.status === 0).length,
    },
  };
}

async function handleDialogRead(url: string): Promise<DaemonResponse> {
  await initBrowser(url);
  const entries = dialogBuffer.toArray();
  return {
    ok: true,
    data: { entries, total: dialogBuffer.size },
  };
}

async function handleScreenshotDevices(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const page = getPage();
  const devices = params.devices as string[] | undefined;
  if (!devices || devices.length === 0) {
    return { ok: false, error: 'Missing devices parameter' };
  }

  const { results, unknown } = await takeDeviceScreenshots(page, devices, {
    fullPage: params.fullPage as boolean | undefined,
  });

  // Surface unknown device names to the caller instead of silently dropping
  // them. If everything was unknown, treat as a hard error.
  if (results.length === 0 && unknown.length > 0) {
    const { listDeviceNames } = await import('./devices.js');
    return {
      ok: false,
      error: `Unknown device(s): ${unknown.join(', ')}. Known: ${listDeviceNames().join(', ')}`,
    };
  }

  return {
    ok: true,
    data: {
      screenshots: results.map((r) => ({
        device: r.device.name,
        width: r.device.viewport.width,
        height: r.device.viewport.height,
        screenshot: r.buffer.toString('base64'),
      })),
      unknown,
    },
  };
}

async function handleRecordStart(
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  await initBrowser(url);
  const browser = getBrowserInstance();
  const viewportParam = params.viewport as string | undefined;
  let viewport: { width: number; height: number } | undefined;
  if (viewportParam) {
    const { parseViewport, DEFAULT_VIEWPORT } = await import('../viewportUtils.js');
    viewport = parseViewport(viewportParam, DEFAULT_VIEWPORT);
  }
  const label = (params.label as string | undefined) || undefined;
  const storageState = (params.storageState as string | undefined) || undefined;
  const trace = (params.trace as boolean | undefined) || undefined;
  const result = await startRecording(browser, url, '.sweetlink', {
    viewport,
    label,
    storageState,
    trace,
  });
  return { ok: true, data: { sessionId: result.sessionId, label, trace: !!trace } };
}

async function handleRecordStop(): Promise<DaemonResponse> {
  const eventCursors = getRecordingEventCursors();
  const manifest = await stopRecording();
  if (!manifest) {
    return { ok: false, error: 'No recording in progress' };
  }

  // Auto-generate viewer HTML + summary report
  const sessionDir = `.sweetlink/${manifest.sessionId}`;
  let viewerPath: string | undefined;
  let summaryPath: string | undefined;

  try {
    const consoleLogs = eventCursors
      ? consoleBuffer.since(eventCursors.consoleStartCursor)
      : consoleBuffer.toArray();
    const networkLogs = eventCursors
      ? networkBuffer.since(eventCursors.networkStartCursor)
      : networkBuffer.toArray();

    viewerPath = await generateViewer(manifest, {
      sessionDir,
      consoleEntries: consoleLogs,
      networkEntries: networkLogs,
    });

    // Generate SUMMARY.md
    const { promises: fsp } = await import('fs');
    // Detect server errors from console log messages
    const consoleText = consoleLogs.map((e) => e.message).join('\n');
    const serverErrors = detectServerErrors(consoleText);
    if (serverErrors.length > 0) {
      manifest.errors.server = serverErrors.length;
    }
    await fsp.writeFile(
      `${sessionDir}/sweetlink-session.json`,
      JSON.stringify(manifest, null, 2),
      'utf-8'
    );

    const summaryMd = generateSummary({
      manifest,
      consoleEntries: consoleLogs,
      networkEntries: networkLogs,
      serverErrors: serverErrors.map((e) => ({
        source: 'server' as const,
        message: e.line,
        timestamp: Date.now(),
        code: e.language,
      })),
      gitBranch: manifest.gitBranch,
      gitCommit: manifest.gitCommit,
    });
    summaryPath = `${sessionDir}/SUMMARY.md`;
    await fsp.writeFile(summaryPath, summaryMd, 'utf-8');
    console.error(`[Daemon] Summary saved: ${summaryPath}`);
  } catch (e) {
    console.error('[Daemon] Report generation error:', e);
  }

  // Include a browser-accessible URL for the viewer
  const viewerUrl =
    manifest.sessionId && daemonPort
      ? `http://127.0.0.1:${daemonPort}/viewer/${manifest.sessionId}`
      : undefined;

  return { ok: true, data: { manifest, viewerPath, viewerUrl, summaryPath } };
}

async function handleRecordStatus(): Promise<DaemonResponse> {
  const status = getRecordingStatus();
  return { ok: true, data: status };
}

async function handleRecordPause(): Promise<DaemonResponse> {
  const r = pauseRecording();
  if (!r) return { ok: false, error: 'No active recording to pause (or already paused).' };
  return { ok: true, data: r };
}

async function handleRecordResume(): Promise<DaemonResponse> {
  const r = resumeRecording();
  if (!r) return { ok: false, error: 'Recording is not paused.' };
  return { ok: true, data: r };
}

async function handleSessionsList(): Promise<DaemonResponse> {
  try {
    const { promises: fsp } = await import('fs');
    const path = await import('path');
    const dir = '.sweetlink';
    let entries: import('fs').Dirent[] = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return { ok: true, data: { sessions: [] } };
    }
    const sessions: Array<{
      sessionId: string;
      label?: string;
      url?: string;
      startedAt?: string;
      duration?: number;
      actionCount: number;
      errors?: { console: number; network: number; server: number };
      hasVideo: boolean;
      hasViewer: boolean;
      manifestPath: string;
    }> = [];
    for (const e of entries) {
      if (!e.isDirectory() || !e.name.startsWith('session-')) continue;
      const manifestPath = path.join(dir, e.name, 'sweetlink-session.json');
      try {
        const raw = await fsp.readFile(manifestPath, 'utf-8');
        const m = JSON.parse(raw) as import('./session.js').SessionManifest;
        const hasVideo = await fsp
          .access(path.join(dir, e.name, 'session.webm'))
          .then(() => true)
          .catch(() => false);
        const hasViewer = await fsp
          .access(path.join(dir, e.name, 'viewer.html'))
          .then(() => true)
          .catch(() => false);
        sessions.push({
          sessionId: m.sessionId,
          label: m.label,
          url: m.url,
          startedAt: m.startedAt,
          duration: m.duration,
          actionCount: m.commands.length,
          errors: m.errors,
          hasVideo,
          hasViewer,
          manifestPath,
        });
      } catch {
        // Skip directories without a valid manifest.
      }
    }
    // Most recent first.
    sessions.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));

    // Also write an index.html that links to every viewer for quick browsing.
    try {
      const items = sessions
        .map((s) => {
          const viewerLink = s.hasViewer ? `${s.sessionId}/viewer.html` : '#';
          const errorsTotal = s.errors ? s.errors.console + s.errors.network + s.errors.server : 0;
          const errBadge =
            errorsTotal > 0
              ? `<span style="color:#c00;font-weight:600">${errorsTotal} err</span>`
              : '<span style="color:#0a0">clean</span>';
          const labelHtml = s.label
            ? `<span style="color:#06c">${escapeHtml(s.label)}</span> · `
            : '';
          const dur = s.duration ? `${s.duration.toFixed(1)}s` : '—';
          return `<li><a href="${viewerLink}">${labelHtml}<code>${escapeHtml(s.sessionId)}</code></a> · ${escapeHtml(s.url ?? '')} · ${dur} · ${s.actionCount} actions · ${errBadge}</li>`;
        })
        .join('\n');
      const indexHtml = `<!DOCTYPE html>
<html><head><title>Sweetlink Sessions</title>
<style>
body{font-family:system-ui;margin:40px;max-width:900px}
li{margin:8px 0;padding:8px;border-radius:6px}
li:hover{background:#f5f5fa}
code{background:#eef;padding:1px 6px;border-radius:3px}
a{text-decoration:none;color:#222}
</style></head>
<body><h1>Sweetlink Sessions <small style="color:#888">(${sessions.length})</small></h1>
<ul>${items}</ul>
</body></html>`;
      await fsp.writeFile(path.join(dir, 'index.html'), indexHtml);
    } catch {
      /* index is best-effort */
    }

    return { ok: true, data: { sessions, indexPath: path.join(dir, 'index.html') } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// escapeHtml moved to ./utils.ts

async function handleGenerateViewer(params: Record<string, unknown>): Promise<DaemonResponse> {
  const sessionDir = params.sessionDir as string;
  const outputPath = params.outputPath as string | undefined;

  if (!sessionDir) return { ok: false, error: 'Missing sessionDir parameter' };

  try {
    const { promises: fsp } = await import('fs');
    const manifestRaw = await fsp.readFile(`${sessionDir}/sweetlink-session.json`, 'utf-8');
    const manifest = JSON.parse(manifestRaw);
    const viewerPath = await generateViewer(manifest, {
      sessionDir,
      outputPath,
      consoleEntries: consoleBuffer.toArray(),
      networkEntries: networkBuffer.toArray(),
    });
    return { ok: true, data: { viewerPath } };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to generate viewer: ${error instanceof Error ? error.message : error}`,
    };
  }
}

async function handleVisualDiff(params: Record<string, unknown>): Promise<DaemonResponse> {
  const baseline = params.baseline as string | undefined;
  const current = params.current as string | undefined;
  const threshold = params.threshold as number | undefined;

  if (!baseline || !current) {
    return { ok: false, error: 'Missing baseline or current parameter (base64 encoded PNG)' };
  }

  const outputPath = params.outputPath as string | undefined;
  const baselineBuffer = Buffer.from(baseline, 'base64');
  const currentBuffer = Buffer.from(current, 'base64');
  const result = await visualDiff(baselineBuffer, currentBuffer, { threshold, outputPath });

  return {
    ok: true,
    data: {
      mismatchPercentage: result.mismatchPercentage,
      mismatchCount: result.mismatchCount,
      totalPixels: result.totalPixels,
      pass: result.pass,
      diffImagePath: result.diffImagePath,
      diffViewerPath: result.diffViewerPath,
    },
  };
}

// ============================================================================
// Request Handling
// ============================================================================

const DAEMON_HANDLERS: Partial<Record<DaemonAction, DaemonHandler>> = {
  ping: () => handlePing(),
  shutdown: () => handleShutdown(),
  screenshot: (params, url) => handleScreenshot(params as unknown as ScreenshotParams, url),
  'screenshot-responsive': (params, url) =>
    handleResponsiveScreenshot(params as unknown as ResponsiveScreenshotParams, url),
  snapshot: (params, url) => handleSnapshot(params, url),
  inspect: (params, url) => handleInspect(params, url),
  'click-ref': (params, url) => handleClickRef(params, url),
  'click-css': (params, url) => handleClickCss(params, url),
  'fill-ref': (params, url) => handleFillRef(params, url),
  'hover-ref': (params, url) => handleHoverRef(params, url),
  'press-key': (params, url) => handlePressKey(params, url),
  'console-read': (params, url) => handleConsoleRead(params, url),
  'network-read': (params, url) => handleNetworkRead(params, url),
  'dialog-read': (_params, url) => handleDialogRead(url),
  'screenshot-devices': (params, url) => handleScreenshotDevices(params, url),
  'visual-diff': (params) => handleVisualDiff(params),
  'record-start': (params, url) => handleRecordStart(params, url),
  'record-pause': () => handleRecordPause(),
  'record-resume': () => handleRecordResume(),
  'sessions-list': () => handleSessionsList(),
  'record-stop': () => handleRecordStop(),
  'record-status': () => handleRecordStatus(),
  'generate-viewer': (params) => handleGenerateViewer(params),
};

async function handleRequest(
  action: DaemonAction,
  params: Record<string, unknown>,
  url: string
): Promise<DaemonResponse> {
  const handler = DAEMON_HANDLERS[action];
  if (!handler) return { ok: false, error: `Unknown action: ${action}` };
  return handler(params, url);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 10 * 1024 * 1024; // 10MB max (visual-diff sends two screenshots)

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: DaemonResponse): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ============================================================================
// Server Lifecycle
// ============================================================================

export interface StartServerOptions {
  port: number;
  token: string;
  url: string;
  onShutdown: () => void;
}

/**
 * Start the daemon HTTP server.
 * Binds to 127.0.0.1 (localhost only) on the specified port.
 */
export function startServer(options: StartServerOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    shutdownCallback = options.onShutdown;
    daemonPort = options.port;

    httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        });
        res.end();
        return;
      }

      // Serve viewer HTML via GET (no auth required — localhost only)
      if (req.method === 'GET') {
        const urlPath = req.url ?? '/';
        const viewerMatch = urlPath.match(/^\/viewer\/([a-z0-9-]+)$/);
        if (viewerMatch) {
          const sid = viewerMatch[1];
          try {
            const { promises: fsp } = await import('fs');
            const viewerHtml = await fsp.readFile(`.sweetlink/${sid}/viewer.html`, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(viewerHtml);
          } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Viewer not found');
          }
          return;
        }
        // GET /viewers — list available sessions
        if (urlPath === '/viewers') {
          try {
            const { promises: fsp } = await import('fs');
            const entries = await fsp.readdir('.sweetlink', { withFileTypes: true });
            const sessions = entries
              .filter((e) => e.isDirectory() && e.name.startsWith('session-'))
              .map((e) => e.name)
              .sort()
              .reverse();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ sessions, daemonPort: options.port }));
          } catch {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ sessions: [] }));
          }
          return;
        }
        sendJson(res, 404, { ok: false, error: 'Not found' });
        return;
      }

      // Only accept POST for API
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'Method not allowed' });
        return;
      }

      // Validate bearer token
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${options.token}`) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized' });
        return;
      }

      // Parse action from URL path: /api/{action}
      const urlPath = req.url ?? '/';
      const match = urlPath.match(/^\/api\/([a-z-]+)$/);
      if (!match) {
        sendJson(res, 404, { ok: false, error: 'Not found' });
        return;
      }
      const action = match[1] as DaemonAction;

      // Reset idle timer on every valid request
      resetIdleTimer();

      try {
        const body = await readBody(req);
        const parsed = body ? JSON.parse(body) : {};
        const params = parsed.params ?? {};
        const response = await handleRequest(action, params, options.url);
        sendJson(res, response.ok ? 200 : 400, response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Daemon] Request error:', message);
        sendJson(res, 500, { ok: false, error: message });
      }
    });

    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${options.port} is in use`));
      } else {
        reject(error);
      }
    });

    // Bind to localhost only
    httpServer.listen(options.port, '127.0.0.1', () => {
      console.error(`[Daemon] HTTP server listening on http://127.0.0.1:${options.port}`);
      resetIdleTimer();
      resolve();
    });
  });
}

/**
 * Shut down the daemon: close browser, close HTTP server, call shutdown callback.
 */
export async function shutdown(): Promise<void> {
  console.error('[Daemon] Shutting down...');

  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  await closeBrowser();

  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }

  shutdownCallback?.();
}
