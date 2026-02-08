/**
 * WebSocket connection, reconnection, port scanning, and message handling.
 *
 * Extracted from GlobalDevBar to reduce file size. All functions receive
 * DevBarState rather than referencing the class directly.
 */

import {
  BASE_RECONNECT_DELAY_MS,
  MAX_PORT_RETRIES,
  MAX_RECONNECT_ATTEMPTS,
  MAX_RECONNECT_DELAY_MS,
  PORT_RETRY_DELAY_MS,
  PORT_SCAN_RESTART_DELAY_MS,
  SCREENSHOT_NOTIFICATION_MS,
  DESIGN_REVIEW_NOTIFICATION_MS,
} from '../constants.js';
import { getHtml2Canvas } from '../lazy/lazyHtml2Canvas.js';
import type { DevBarSettings } from '../settings.js';
import type { SweetlinkCommand } from '../types.js';
import type { DevBarState } from './types.js';

/**
 * Connect to the WebSocket server, handling port scanning for multi-instance support.
 */
export function connectWebSocket(state: DevBarState, port?: number): void {
  if (state.destroyed) return;

  const targetPort = port ?? state.baseWsPort;
  state.debug.ws('Connecting to WebSocket', { port: targetPort, appPort: state.currentAppPort });
  const ws = new WebSocket(`ws://localhost:${targetPort}`);
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
            tryingNextPort: targetPort + 1,
          });
          ws.close();

          // Try next port
          const nextPort = targetPort + 1;
          if (nextPort < state.baseWsPort + MAX_PORT_RETRIES) {
            setTimeout(() => connectWebSocket(state, nextPort), PORT_RETRY_DELAY_MS);
          } else {
            state.debug.ws('No matching server found, will retry from base port');
            setTimeout(() => connectWebSocket(state, state.baseWsPort), PORT_SCAN_RESTART_DELAY_MS);
          }
          return;
        }

        // Server matches - mark as verified and connected
        state.wsVerified = true;
        state.sweetlinkConnected = true;
        state.reconnectAttempts = 0;
        state.serverProjectDir = message.projectDir ?? null;
        state.debug.ws('Server verified', {
          appPort: serverAppPort ?? 'any',
          projectDir: state.serverProjectDir,
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
    }
  };

  ws.onerror = () => {
    // Error will trigger onclose, which handles reconnection
    state.debug.ws('WebSocket error');
  };
}

/**
 * Handle an incoming Sweetlink command from the WebSocket.
 */
async function handleSweetlinkCommand(state: DevBarState, command: SweetlinkCommand): Promise<void> {
  const ws = state.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  switch (command.type) {
    case 'screenshot': {
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
      break;
    }
    case 'get-logs': {
      let logs = state.consoleLogs;
      if (command.filter) {
        const filter = command.filter.toLowerCase();
        logs = logs.filter(
          (log) => log.level.includes(filter) || log.message.toLowerCase().includes(filter)
        );
      }
      ws.send(JSON.stringify({ success: true, data: logs, timestamp: Date.now() }));
      break;
    }
    case 'query-dom': {
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
      break;
    }
    case 'exec-js': {
      if (command.code && typeof command.code === 'string' && command.code.length <= 10000) {
        try {
          // Use indirect eval to avoid strict mode issues
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
      break;
    }
    case 'screenshot-saved':
      handleNotification(state, 'screenshot', command.path, SCREENSHOT_NOTIFICATION_MS);
      break;
    case 'design-review-saved':
      state.designReviewInProgress = false;
      handleNotification(state, 'designReview', command.reviewPath, DESIGN_REVIEW_NOTIFICATION_MS);
      break;
    case 'design-review-error':
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
      break;
    case 'api-key-status': {
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
      break;
    }
    case 'outline-saved':
      handleNotification(state, 'outline', command.outlinePath, SCREENSHOT_NOTIFICATION_MS);
      break;
    case 'outline-error':
      console.error('[GlobalDevBar] Outline save failed:', command.error);
      break;
    case 'schema-saved':
      handleNotification(state, 'schema', command.schemaPath, SCREENSHOT_NOTIFICATION_MS);
      break;
    case 'schema-error':
      console.error('[GlobalDevBar] Schema save failed:', command.error);
      break;
    case 'settings-loaded':
      handleSettingsLoaded(state, command.settings as DevBarSettings | null);
      break;
    case 'settings-saved':
      state.debug.state('Settings saved to server', { path: command.settingsPath });
      break;
    case 'settings-error':
      console.error('[GlobalDevBar] Settings operation failed:', command.error);
      break;
  }
}

/**
 * Handle notification state updates with auto-clear timeout.
 */
export function handleNotification(
  state: DevBarState,
  type: 'screenshot' | 'designReview' | 'outline' | 'schema',
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
