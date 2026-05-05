/**
 * WebSocket connection, reconnection, port scanning, and message handling.
 *
 * Extracted from GlobalDevBar to reduce file size. All functions receive
 * DevBarState rather than referencing the class directly.
 */

import { runA11yAudit } from '../accessibility.js';
import {
  BASE_RECONNECT_DELAY_MS,
  DESIGN_REVIEW_NOTIFICATION_MS,
  MAX_PORT_RETRIES,
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECT_DELAY_MS,
  PORT_RETRY_DELAY_MS,
  PORT_SCAN_RESTART_DELAY_MS,
  SCREENSHOT_NOTIFICATION_MS,
} from '../constants.js';
import { getHtml2Canvas } from '../lazy/lazyHtml2Canvas.js';
import {
  extractDocumentOutline,
  outlineToMarkdown,
} from '@ytspar/sweetlink/browser/commands/outline';
import { extractPageSchema, schemaToMarkdown } from '@ytspar/sweetlink/browser/commands/schema';
import type { DevBarSettings } from '../settings.js';
import type { SweetlinkCommand } from '../types.js';
import type { DevBarState } from './types.js';

/**
 * Connect to the WebSocket server, handling port scanning for multi-instance support.
 */
/** Close and null out any pending viewer window (blank tab opened on record-stop click). */
function cleanupPendingWindow(state: DevBarState): void {
  if (state.pendingViewerWindow) {
    try {
      state.pendingViewerWindow.close();
    } catch {
      /* may already be closed */
    }
    state.pendingViewerWindow = null;
  }
}

function getDefaultWsUrl(state: DevBarState): string {
  return `ws://localhost:${state.baseWsPort}`;
}

function getWsUrlCandidates(state: DevBarState): readonly string[] {
  return state.wsUrlCandidates?.length ? state.wsUrlCandidates : [getDefaultWsUrl(state)];
}

function getWsUrlForTarget(state: DevBarState, target?: number | string): string {
  if (typeof target === 'string') return target;
  if (typeof target === 'number') return `ws://localhost:${target}`;
  return getWsUrlCandidates(state)[0] ?? getDefaultWsUrl(state);
}

function getPortForTarget(targetUrl: string): number | null {
  try {
    const url = new URL(targetUrl);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null;
    const port = Number(url.port);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

function scheduleNextTarget(
  state: DevBarState,
  targetUrl: string,
  delayMs: number = PORT_RETRY_DELAY_MS
): void {
  const candidates = getWsUrlCandidates(state);
  const candidateIndex = candidates.indexOf(targetUrl);
  if (candidateIndex >= 0 && candidateIndex + 1 < candidates.length) {
    setTimeout(() => connectWebSocket(state, candidates[candidateIndex + 1]!), delayMs);
    return;
  }

  const targetPort = getPortForTarget(targetUrl);
  if (targetPort !== null) {
    const nextPort = targetPort + 1;
    if (nextPort < state.baseWsPort + MAX_PORT_RETRIES) {
      setTimeout(() => connectWebSocket(state, nextPort), delayMs);
      return;
    }
  }

  setTimeout(() => connectWebSocket(state), PORT_SCAN_RESTART_DELAY_MS);
}

export function connectWebSocket(state: DevBarState, port?: number | string): void {
  if (state.destroyed) return;

  const targetUrl = getWsUrlForTarget(state, port);
  const targetPort = getPortForTarget(targetUrl);
  state.debug.ws('Connecting to WebSocket', {
    url: targetUrl,
    port: targetPort ?? 'same-origin',
    appPort: state.currentAppPort,
  });
  const ws = new WebSocket(targetUrl);
  let switchingTargets = false;
  state.ws = ws;
  state.wsVerified = false;

  ws.onopen = () => {
    state.debug.ws('WebSocket socket opened, awaiting server-info');
    ws.send(JSON.stringify({ type: 'browser-client-ready' }));
  };

  ws.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);

      // Handle server-info for port matching
      if (message.type === 'server-info') {
        const serverAppPort = message.appPort as number | null;
        const serverMatchesApp = serverAppPort === null || serverAppPort === state.currentAppPort;

        if (!serverMatchesApp) {
          state.debug.ws('Server mismatch', {
            serverAppPort,
            currentAppPort: state.currentAppPort,
            targetUrl,
          });
          switchingTargets = true;
          ws.close();
          scheduleNextTarget(state, targetUrl);
          return;
        }

        // Server matches - mark as verified and connected
        state.wsVerified = true;
        state.sweetlinkConnected = true;
        state.reconnectAttempts = 0;
        state.serverProjectDir = message.projectDir ?? null;
        state.serverGitBranch = message.gitBranch ?? null;
        state.serverAppName = message.appName ?? null;
        state.debug.ws('Server verified', {
          appPort: serverAppPort ?? 'any',
          projectDir: state.serverProjectDir,
          gitBranch: state.serverGitBranch,
        });

        state.settingsManager.setWebSocket(ws);
        state.settingsManager.setConnected(true);
        ws.send(JSON.stringify({ type: 'load-settings' }));
        state.render();
        return;
      }

      // Ignore other commands until verified
      if (!state.wsVerified) {
        state.debug.ws('Ignoring command before verification', { type: message.type });
        return;
      }

      // Handle hifi screenshot response (proxied through daemon)
      if (message.type === 'hifi-screenshot') {
        state.capturing = false;
        state.render();
        return;
      }

      // Handle recording responses (not in SweetlinkCommand union)
      if (message.type === 'record-start-response' && message.success) {
        state.recordingActive = true;
        state.recordingSessionId =
          ((message as Record<string, unknown>).sessionId as string) ?? null;
        state.recordingStartedAt = Date.now();
        state.recordingTimer = setInterval(() => state.render(), 1000);
        state.render();
        return;
      }
      if (message.type === 'record-stop-response' || message.type === 'record-stop') {
        state.recordingActive = false;
        if (state.recordingTimer) clearInterval(state.recordingTimer);
        state.recordingTimer = null;
        state.recordingStartedAt = null;

        if (message.success) {
          const data = message as Record<string, unknown>;
          const viewerUrl = data.viewerUrl as string | undefined;

          // Navigate the pre-opened window to the viewer
          if (viewerUrl && state.pendingViewerWindow) {
            state.pendingViewerWindow.location.href = viewerUrl;
            state.pendingViewerWindow = null;
          } else {
            // No URL — close the blank tab
            cleanupPendingWindow(state);
          }

          if (viewerUrl) {
            state.lastViewerPath = viewerUrl;
          }
        } else {
          // Stop failed — clean up the blank tab
          cleanupPendingWindow(state);
        }
        state.render();
        return;
      }

      const command = message as SweetlinkCommand;
      state.debug.ws('Received command', { type: command.type });
      await handleSweetlinkCommand(state, command);
    } catch (e) {
      console.error('[GlobalDevBar] Error handling command:', e);
    }
  };

  ws.onclose = () => {
    // Only reset connection state if we were actually verified/connected
    if (state.wsVerified) {
      state.sweetlinkConnected = false;
      state.wsVerified = false;
      state.serverProjectDir = null;
      state.settingsManager.setConnected(false);
      state.debug.ws('WebSocket disconnected');
      state.render();

      // Auto-reconnect with exponential backoff (start from base port)
      if (!state.destroyed && state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delayMs = BASE_RECONNECT_DELAY_MS * 2 ** state.reconnectAttempts;
        state.reconnectAttempts++;
        state.debug.ws('Scheduling reconnect', { attempt: state.reconnectAttempts, delayMs });
        state.reconnectTimeout = setTimeout(
          () => connectWebSocket(state, state.baseWsPort),
          Math.min(delayMs, MAX_RECONNECT_DELAY_MS)
        );
      }
    } else if (!state.destroyed && !switchingTargets) {
      const candidates = getWsUrlCandidates(state);
      const candidateIndex = candidates.indexOf(targetUrl);
      if (candidateIndex >= 0 && candidateIndex + 1 < candidates.length) {
        state.debug.ws('WebSocket closed before verification, trying next candidate');
        scheduleNextTarget(state, targetUrl);
      }
    }
  };

  ws.onerror = () => {
    // Error will trigger onclose, which handles reconnection
    state.debug.ws('WebSocket error');
  };
}

// ============================================================================
// Handler factories — reduce repetition for saved/error command pairs
// ============================================================================

/**
 * Create a handler for "*-saved" commands that show a notification.
 * @param notificationType - The notification type key (e.g. 'outline', 'schema')
 * @param pathField - The command field containing the saved file path
 * @param durationMs - How long to show the notification
 */
function createSavedHandler<T extends SweetlinkCommand>(
  notificationType: 'screenshot' | 'designReview' | 'outline' | 'schema' | 'consoleLogs' | 'a11y',
  pathField: keyof T & string,
  durationMs: number = SCREENSHOT_NOTIFICATION_MS
): (state: DevBarState, command: T) => void {
  return (state: DevBarState, command: T) => {
    handleNotification(
      state,
      notificationType,
      command[pathField] as string | undefined,
      durationMs
    );
  };
}

/**
 * Create a handler for "*-error" commands that log and optionally reset a saving flag.
 * @param label - Human-readable label for the error log (e.g. 'Outline save')
 * @param savingFlag - Optional state flag to reset to false on error
 */
function createErrorHandler<T extends SweetlinkCommand & { error?: string }>(
  label: string,
  savingFlag?: keyof DevBarState & string
): (state: DevBarState, command: T) => void {
  return (state: DevBarState, command: T) => {
    if (savingFlag) {
      (state as unknown as Record<string, unknown>)[savingFlag] = false;
    }
    console.error(`[GlobalDevBar] ${label} failed:`, command.error);
    if (savingFlag) {
      state.render();
    }
  };
}

// Saved handlers (created via factory)
const handleOutlineSavedCommand = createSavedHandler<SweetlinkCommand & { type: 'outline-saved' }>(
  'outline',
  'outlinePath'
);
const handleSchemaSavedCommand = createSavedHandler<SweetlinkCommand & { type: 'schema-saved' }>(
  'schema',
  'schemaPath'
);
const handleConsoleLogsSavedCommand = createSavedHandler<
  SweetlinkCommand & { type: 'console-logs-saved' }
>('consoleLogs', 'consoleLogsPath');
const handleA11ySavedCommand = createSavedHandler<SweetlinkCommand & { type: 'a11y-saved' }>(
  'a11y',
  'a11yPath'
);
const handleScreenshotSavedCommand = (
  state: DevBarState,
  command: SweetlinkCommand & { type: 'screenshot-saved' }
): void => {
  state.capturing = false;
  handleNotification(state, 'screenshot', command.path, SCREENSHOT_NOTIFICATION_MS);
};

// Error handlers (created via factory)
const handleOutlineErrorCommand = createErrorHandler<SweetlinkCommand & { type: 'outline-error' }>(
  'Outline save'
);
const handleSchemaErrorCommand = createErrorHandler<SweetlinkCommand & { type: 'schema-error' }>(
  'Schema save'
);
const handleConsoleLogsErrorCommand = createErrorHandler<
  SweetlinkCommand & { type: 'console-logs-error' }
>('Console logs save', 'savingConsoleLogs');
const handleA11yErrorCommand = createErrorHandler<SweetlinkCommand & { type: 'a11y-error' }>(
  'A11y save',
  'savingA11yAudit'
);

// ============================================================================
// Per-command handler functions (private, called from handleSweetlinkCommand)
// ============================================================================

async function handleScreenshotCommand(
  ws: WebSocket,
  command: SweetlinkCommand & { type: 'screenshot' }
): Promise<void> {
  const targetElement = command.selector
    ? (document.querySelector(command.selector) as HTMLElement) || document.body
    : document.body;
  const html2canvas = await getHtml2Canvas();
  const canvas = await html2canvas(targetElement, {
    logging: false,
    useCORS: true,
    allowTaint: true,
  });
  ws.send(
    JSON.stringify({
      success: true,
      data: {
        screenshot: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
        selector: command.selector || 'body',
      },
      timestamp: Date.now(),
    })
  );
}

function handleGetLogsCommand(
  state: DevBarState,
  ws: WebSocket,
  command: SweetlinkCommand & { type: 'get-logs' }
): void {
  let logs = state.consoleLogs;
  if (command.filter) {
    const filter = command.filter.toLowerCase();
    logs = logs.filter(
      (log) => log.level.includes(filter) || log.message.toLowerCase().includes(filter)
    );
  }
  ws.send(JSON.stringify({ success: true, data: logs, timestamp: Date.now() }));
}

function handleQueryDomCommand(
  ws: WebSocket,
  command: SweetlinkCommand & { type: 'query-dom' }
): void {
  if (command.selector) {
    const elements = Array.from(document.querySelectorAll(command.selector));
    const results = elements.map((el: Element) => {
      if (command.property)
        return (el as unknown as Record<string, unknown>)[command.property] ?? null;
      return {
        tagName: el.tagName,
        className: el.className,
        id: el.id,
        textContent: el.textContent?.trim().slice(0, 100),
      };
    });
    ws.send(
      JSON.stringify({
        success: true,
        data: { count: results.length, results },
        timestamp: Date.now(),
      })
    );
  }
}

function handleExecJsCommand(ws: WebSocket, command: SweetlinkCommand & { type: 'exec-js' }): void {
  if (command.code && typeof command.code === 'string' && command.code.length <= 10000) {
    try {
      // Use indirect eval to avoid strict mode issues
      // biome-ignore lint/security/noGlobalEval: intentional eval for remote JS execution
      const indirectEval = eval;
      const result = indirectEval(command.code);
      ws.send(JSON.stringify({ success: true, data: result, timestamp: Date.now() }));
    } catch (e) {
      ws.send(
        JSON.stringify({
          success: false,
          error: e instanceof Error ? e.message : 'Execution failed',
          timestamp: Date.now(),
        })
      );
    }
  }
}

async function handleGetA11yCommand(
  ws: WebSocket,
  command: SweetlinkCommand & { type: 'get-a11y' }
): Promise<void> {
  try {
    const result = await runA11yAudit(command.forceRefresh);
    const violationsByImpact: Record<string, number> = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    };
    for (const v of result.violations) {
      violationsByImpact[v.impact] = (violationsByImpact[v.impact] || 0) + 1;
    }
    ws.send(
      JSON.stringify({
        success: true,
        data: {
          result,
          summary: {
            totalViolations: result.violations.length,
            totalPasses: result.passes.length,
            totalIncomplete: result.incomplete.length,
            byImpact: violationsByImpact,
          },
          url: window.location.href,
          title: document.title,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      })
    );
  } catch (e) {
    ws.send(
      JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : 'Accessibility audit failed',
        timestamp: Date.now(),
      })
    );
  }
}

function handleGetOutlineCommand(ws: WebSocket): void {
  try {
    const outline = extractDocumentOutline();
    const markdown = outlineToMarkdown(outline);
    ws.send(
      JSON.stringify({
        success: true,
        data: {
          outline,
          markdown,
          url: window.location.href,
          title: document.title,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      })
    );
  } catch (e) {
    ws.send(
      JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : 'Outline extraction failed',
        timestamp: Date.now(),
      })
    );
  }
}

function handleGetSchemaCommand(ws: WebSocket): void {
  try {
    const schema = extractPageSchema();
    const markdown = schemaToMarkdown(schema);
    ws.send(
      JSON.stringify({
        success: true,
        data: {
          schema,
          markdown,
          url: window.location.href,
          title: document.title,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      })
    );
  } catch (e) {
    ws.send(
      JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : 'Schema extraction failed',
        timestamp: Date.now(),
      })
    );
  }
}

async function handleGetVitalsCommand(ws: WebSocket): Promise<void> {
  try {
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find((e) => e.name === 'first-contentful-paint');
    const fcp = fcpEntry ? Math.round(fcpEntry.startTime) : null;

    // Collect LCP, CLS from buffered observers
    const collectEntries = (entryType: string): Promise<PerformanceEntry[]> =>
      new Promise((resolve) => {
        try {
          const entries: PerformanceEntry[] = [];
          const observer = new PerformanceObserver((list) => {
            entries.push(...list.getEntries());
          });
          observer.observe({ type: entryType, buffered: true });
          setTimeout(() => {
            observer.disconnect();
            resolve(entries);
          }, 0);
        } catch {
          resolve([]);
        }
      });

    const [lcpEntries, layoutShiftEntries, eventEntries] = await Promise.all([
      collectEntries('largest-contentful-paint'),
      collectEntries('layout-shift'),
      collectEntries('event'),
    ]);

    const lcp =
      lcpEntries.length > 0
        ? Math.round(
            (lcpEntries[lcpEntries.length - 1] as PerformanceEntry & { startTime: number })
              .startTime
          )
        : null;

    let cls: number | null = null;
    if (layoutShiftEntries.length > 0) {
      let clsValue = 0;
      for (const entry of layoutShiftEntries) {
        const se = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
        if (!se.hadRecentInput) clsValue += se.value;
      }
      cls = Math.round(clsValue * 1000) / 1000;
    }

    let inp: number | null = null;
    if (eventEntries.length > 0) {
      let worstDuration = 0;
      for (const entry of eventEntries) {
        const ee = entry as PerformanceEntry & { duration: number };
        if (ee.duration > worstDuration) worstDuration = ee.duration;
      }
      inp = Math.round(worstDuration);
    }

    let pageSize: number | null = null;
    const resourceEntries = performance.getEntriesByType('resource');
    let totalSize = 0;
    for (const entry of resourceEntries) {
      totalSize += (entry as PerformanceResourceTiming).transferSize || 0;
    }
    if (totalSize > 0) pageSize = totalSize;

    const vitals = {
      fcp,
      lcp,
      cls,
      inp,
      pageSize,
      url: window.location.href,
      title: document.title,
      timestamp: Date.now(),
    };
    const parts: string[] = [];
    if (fcp !== null) parts.push(`FCP: ${fcp}ms`);
    if (lcp !== null) parts.push(`LCP: ${lcp}ms`);
    if (cls !== null) parts.push(`CLS: ${cls}`);
    if (inp !== null) parts.push(`INP: ${inp}ms`);
    if (pageSize !== null) parts.push(`Page size: ${Math.round(pageSize / 1024)}KB`);

    ws.send(
      JSON.stringify({
        success: true,
        data: { vitals, summary: parts.join(', ') || 'No metrics available yet' },
        timestamp: Date.now(),
      })
    );
  } catch (e) {
    ws.send(
      JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : 'Vitals collection failed',
        timestamp: Date.now(),
      })
    );
  }
}

function handleRefreshCommand(ws: WebSocket): void {
  try {
    window.location.reload();
    ws.send(JSON.stringify({ success: true, timestamp: Date.now() }));
  } catch (e) {
    ws.send(
      JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : 'Refresh failed',
        timestamp: Date.now(),
      })
    );
  }
}

function handleDesignReviewSavedCommand(
  state: DevBarState,
  command: SweetlinkCommand & { type: 'design-review-saved' }
): void {
  state.designReviewInProgress = false;
  handleNotification(state, 'designReview', command.reviewPath, DESIGN_REVIEW_NOTIFICATION_MS);
}

function handleDesignReviewErrorCommand(
  state: DevBarState,
  command: SweetlinkCommand & { type: 'design-review-error' }
): void {
  state.designReviewInProgress = false;
  state.designReviewError = command.error || 'Unknown error';
  console.error('[GlobalDevBar] Design review failed:', command.error);
  // Clear error after notification duration
  if (state.designReviewErrorTimeout) clearTimeout(state.designReviewErrorTimeout);
  state.designReviewErrorTimeout = setTimeout(() => {
    state.designReviewError = null;
    state.render();
  }, DESIGN_REVIEW_NOTIFICATION_MS);
  state.render();
}

function handleApiKeyStatusCommand(
  state: DevBarState,
  command: SweetlinkCommand & { type: 'api-key-status' }
): void {
  // Properties are at top level of the response
  const response = command as unknown as {
    configured?: boolean;
    model?: string;
    pricing?: { input: number; output: number };
  };
  state.apiKeyStatus = {
    configured: response.configured ?? false,
    model: response.model,
    pricing: response.pricing,
  };
  // Re-render to update the confirmation modal
  state.render();
}

function handleSettingsLoadedCommand(
  state: DevBarState,
  command: SweetlinkCommand & { type: 'settings-loaded' }
): void {
  handleSettingsLoaded(state, (command.settings as unknown) as DevBarSettings | null);
}

function handleSettingsSavedCommand(
  state: DevBarState,
  command: SweetlinkCommand & { type: 'settings-saved' }
): void {
  state.debug.state('Settings saved to server', { path: command.settingsPath });
}

function handleSettingsErrorCommand(command: SweetlinkCommand & { type: 'settings-error' }): void {
  console.error('[GlobalDevBar] Settings operation failed:', command.error);
}

// ============================================================================
// Main command dispatcher
// ============================================================================

/**
 * Handle an incoming Sweetlink command from the WebSocket.
 */
async function handleSweetlinkCommand(
  state: DevBarState,
  command: SweetlinkCommand
): Promise<void> {
  const ws = state.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  switch (command.type) {
    case 'screenshot':
      await handleScreenshotCommand(ws, command);
      break;
    case 'get-logs':
      handleGetLogsCommand(state, ws, command);
      break;
    case 'query-dom':
      handleQueryDomCommand(ws, command);
      break;
    case 'exec-js':
      handleExecJsCommand(ws, command);
      break;
    case 'get-a11y':
      await handleGetA11yCommand(ws, command);
      break;
    case 'get-outline':
      handleGetOutlineCommand(ws);
      break;
    case 'get-schema':
      handleGetSchemaCommand(ws);
      break;
    case 'get-vitals':
      await handleGetVitalsCommand(ws);
      break;
    case 'refresh':
      handleRefreshCommand(ws);
      break;
    case 'screenshot-saved':
      handleScreenshotSavedCommand(state, command);
      break;
    case 'design-review-saved':
      handleDesignReviewSavedCommand(state, command);
      break;
    case 'design-review-error':
      handleDesignReviewErrorCommand(state, command);
      break;
    case 'api-key-status':
      handleApiKeyStatusCommand(state, command);
      break;
    case 'outline-saved':
      handleOutlineSavedCommand(state, command);
      break;
    case 'outline-error':
      handleOutlineErrorCommand(state, command);
      break;
    case 'schema-saved':
      handleSchemaSavedCommand(state, command);
      break;
    case 'schema-error':
      handleSchemaErrorCommand(state, command);
      break;
    case 'console-logs-saved':
      handleConsoleLogsSavedCommand(state, command);
      break;
    case 'console-logs-error':
      handleConsoleLogsErrorCommand(state, command);
      break;
    case 'a11y-saved':
      handleA11ySavedCommand(state, command);
      break;
    case 'a11y-error':
      handleA11yErrorCommand(state, command);
      break;
    case 'settings-loaded':
      handleSettingsLoadedCommand(state, command);
      break;
    case 'settings-saved':
      handleSettingsSavedCommand(state, command);
      break;
    case 'settings-error':
      handleSettingsErrorCommand(command);
      break;
    default:
      break;
  }
}

/**
 * Handle notification state updates with auto-clear timeout.
 */
export function handleNotification(
  state: DevBarState,
  type: 'screenshot' | 'designReview' | 'outline' | 'schema' | 'consoleLogs' | 'a11y',
  path: string | undefined,
  durationMs: number
): void {
  if (!path) return;

  // Update the appropriate state
  switch (type) {
    case 'screenshot':
      state.lastScreenshot = path;
      if (state.screenshotTimeout) clearTimeout(state.screenshotTimeout);
      state.screenshotTimeout = setTimeout(() => {
        state.lastScreenshot = null;
        state.render();
      }, durationMs);
      break;
    case 'designReview':
      state.lastDesignReview = path;
      if (state.designReviewTimeout) clearTimeout(state.designReviewTimeout);
      state.designReviewTimeout = setTimeout(() => {
        state.lastDesignReview = null;
        state.render();
      }, durationMs);
      break;
    case 'outline':
      state.savingOutline = false;
      state.lastOutline = path;
      if (state.outlineTimeout) clearTimeout(state.outlineTimeout);
      state.outlineTimeout = setTimeout(() => {
        state.lastOutline = null;
        state.render();
      }, durationMs);
      break;
    case 'schema':
      state.savingSchema = false;
      state.lastSchema = path;
      if (state.schemaTimeout) clearTimeout(state.schemaTimeout);
      state.schemaTimeout = setTimeout(() => {
        state.lastSchema = null;
        state.render();
      }, durationMs);
      break;
    case 'consoleLogs':
      state.savingConsoleLogs = false;
      state.lastConsoleLogs = path;
      if (state.consoleLogsTimeout) clearTimeout(state.consoleLogsTimeout);
      state.consoleLogsTimeout = setTimeout(() => {
        state.lastConsoleLogs = null;
        state.render();
      }, durationMs);
      break;
    case 'a11y':
      state.savingA11yAudit = false;
      state.lastA11yAudit = path;
      if (state.a11yTimeout) clearTimeout(state.a11yTimeout);
      state.a11yTimeout = setTimeout(() => {
        state.lastA11yAudit = null;
        state.render();
      }, durationMs);
      break;
  }
  state.render();
}

/**
 * Handle settings loaded from server.
 */
function handleSettingsLoaded(state: DevBarState, settings: DevBarSettings | null): void {
  if (!settings) {
    state.debug.state('No server settings found, using local');
    return;
  }

  state.debug.state('Settings loaded from server', settings);

  // Update settings manager
  state.settingsManager.handleSettingsLoaded(settings);

  // Apply settings to local state
  state.applySettings(settings);
}
