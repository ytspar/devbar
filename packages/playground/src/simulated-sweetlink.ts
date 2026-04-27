/**
 * Demo-only Sweetlink bridge for devbar.dev and the local playground.
 *
 * The public website cannot connect to a visitor's local Sweetlink daemon, so
 * the toolbar would otherwise show disconnected controls. This shim only runs
 * in the playground and returns realistic success events for demo affordances.
 */

interface BridgeLocation {
  hostname: string;
  origin: string;
  pathname: string;
  port: string;
  protocol: string;
  search: string;
}

interface InstallOptions {
  force?: boolean;
  location?: BridgeLocation;
}

interface InstallResult {
  active: boolean;
  restore: () => void;
}

export interface SweetlinkDemoActionDetail {
  title: string;
  message: string;
  path?: string;
}

type WebSocketHandler = ((event: Event) => void) | null;
type MessageHandler = ((event: MessageEvent) => void) | null;
type CloseHandler = ((event: CloseEvent) => void) | null;

const DEMO_HOSTS = new Set(['devbar.dev', 'www.devbar.dev', 'localhost', '127.0.0.1', '0.0.0.0']);

function getCurrentAppPort(loc: BridgeLocation): number | null {
  if (loc.port) return Number(loc.port);
  if (loc.protocol === 'https:') return 443;
  if (loc.protocol === 'http:') return 80;
  return null;
}

export function shouldUseSimulatedSweetlinkBridge(loc: BridgeLocation): boolean {
  const params = new URLSearchParams(loc.search);
  const mode = params.get('sweetlink');
  if (mode === 'real') return false;
  if (mode === 'demo') return true;
  return DEMO_HOSTS.has(loc.hostname) || loc.hostname.endsWith('.local');
}

function createDemoPath(kind: string, extension: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `.sweetlink/demo/${kind}-${stamp}.${extension}`;
}

function createViewerUrl(loc: BridgeLocation): string {
  return `${loc.origin}${loc.pathname}#sweetlink-demo-viewer`;
}

function dispatchDemoActionFeedback(detail: SweetlinkDemoActionDetail): void {
  window.dispatchEvent(new CustomEvent('sweetlink-demo-action', { detail }));
}

export function installSimulatedSweetlinkBridge(options: InstallOptions = {}): InstallResult {
  if (typeof window === 'undefined') {
    return { active: false, restore: () => undefined };
  }

  const loc = options.location ?? window.location;
  if (!options.force && !shouldUseSimulatedSweetlinkBridge(loc)) {
    return { active: false, restore: () => undefined };
  }

  const OriginalWebSocket = window.WebSocket;
  const appPort = getCurrentAppPort(loc);
  const viewerUrl = createViewerUrl(loc);

  class SimulatedSweetlinkWebSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    readonly url: string;
    readonly protocol = '';
    readonly extensions = '';
    readonly bufferedAmount = 0;
    binaryType: BinaryType = 'blob';
    readyState = SimulatedSweetlinkWebSocket.CONNECTING;
    onopen: WebSocketHandler = null;
    onmessage: MessageHandler = null;
    onerror: WebSocketHandler = null;
    onclose: CloseHandler = null;

    private recordingSessionId: string | null = null;

    constructor(url: string | URL) {
      super();
      this.url = String(url);
      window.setTimeout(() => {
        this.readyState = SimulatedSweetlinkWebSocket.OPEN;
        const event = new Event('open');
        this.onopen?.(event);
        this.dispatchEvent(event);
      }, 0);
    }

    send(payload: string): void {
      const message = this.parsePayload(payload);
      if (!message) return;

      switch (message.type) {
        case 'browser-client-ready':
          this.emit({
            type: 'server-info',
            appPort,
            appName: 'devbar.dev demo',
            demo: true,
            gitBranch: 'simulated',
            projectDir: 'demo only - no local project',
          });
          break;
        case 'load-settings':
          this.emit({ type: 'settings-loaded', settings: null });
          break;
        case 'save-settings':
          {
            const path = createDemoPath('settings', 'json');
            this.emit(
              { type: 'settings-saved', settingsPath: path },
              {
                title: 'Settings save simulated',
                message: 'No settings file was written. The page returned an example path.',
                path,
              }
            );
          }
          break;
        case 'save-screenshot':
        case 'hifi-screenshot':
          {
            const path = createDemoPath('screenshot', 'png');
            this.emit(
              { type: 'screenshot-saved', path },
              {
                title:
                  message.type === 'hifi-screenshot'
                    ? 'HiFi screenshot simulated'
                    : 'Screenshot simulated',
                message:
                  'No image file was written. The toolbar received an example artifact path.',
                path,
              }
            );
          }
          break;
        case 'check-api-key':
          this.emit(
            {
              type: 'api-key-status',
              configured: true,
              model: 'claude-sonnet-4-5',
              pricing: { input: 3, output: 15 },
            },
            {
              title: 'API key check simulated',
              message: 'The demo reports a configured key. It did not read your environment.',
            }
          );
          break;
        case 'design-review-screenshot':
          {
            const path = createDemoPath('design-review', 'md');
            this.emit(
              {
                type: 'design-review-saved',
                reviewPath: path,
              },
              {
                title: 'Design review simulated',
                message:
                  'No Claude request was sent. The toolbar received an example markdown path.',
                path,
              }
            );
          }
          break;
        case 'save-outline':
          {
            const path = createDemoPath('outline', 'md');
            this.emit(
              { type: 'outline-saved', outlinePath: path },
              {
                title: 'Outline export simulated',
                message: 'No markdown file was written. The toolbar received an example path.',
                path,
              }
            );
          }
          break;
        case 'save-schema':
          {
            const path = createDemoPath('schema', 'md');
            this.emit(
              { type: 'schema-saved', schemaPath: path },
              {
                title: 'Schema export simulated',
                message: 'No markdown file was written. The toolbar received an example path.',
                path,
              }
            );
          }
          break;
        case 'save-console-logs':
          {
            const path = createDemoPath('console-logs', 'md');
            this.emit(
              {
                type: 'console-logs-saved',
                consoleLogsPath: path,
              },
              {
                title: 'Console export simulated',
                message: 'No log file was written. The toolbar received an example path.',
                path,
              }
            );
          }
          break;
        case 'save-a11y':
          {
            const path = createDemoPath('a11y', 'md');
            this.emit(
              { type: 'a11y-saved', a11yPath: path },
              {
                title: 'Accessibility report simulated',
                message: 'No report file was written. The toolbar received an example path.',
                path,
              }
            );
          }
          break;
        case 'record-start':
          this.recordingSessionId = `demo-session-${Date.now()}`;
          this.emit(
            {
              type: 'record-start-response',
              success: true,
              sessionId: this.recordingSessionId,
            },
            {
              title: 'Recording simulated',
              message: 'No video or action manifest is being recorded in demo mode.',
            }
          );
          break;
        case 'record-stop':
          this.emit(
            {
              type: 'record-stop-response',
              success: true,
              sessionId: this.recordingSessionId,
              viewerUrl,
            },
            {
              title: 'Recording finished in demo mode',
              message: 'The viewer link is a page anchor. No recording artifact was created.',
              path: viewerUrl,
            }
          );
          this.recordingSessionId = null;
          break;
        case 'demo-init':
          {
            const path = createDemoPath('demo', 'md');
            this.emit(
              {
                type: 'demo-init-response',
                success: true,
                filePath: path,
              },
              {
                title: 'Demo document simulated',
                message: 'No markdown document was created. The toolbar received an example path.',
                path,
              }
            );
          }
          break;
        case 'demo-screenshot':
          this.emit(
            { type: 'demo-screenshot-response', success: true, sections: 1 },
            {
              title: 'Demo screenshot section simulated',
              message: 'No screenshot section was appended to a real document.',
            }
          );
          break;
        default:
          break;
      }
    }

    close(): void {
      if (this.readyState === SimulatedSweetlinkWebSocket.CLOSED) return;
      this.readyState = SimulatedSweetlinkWebSocket.CLOSED;
      const event = new CloseEvent('close');
      this.onclose?.(event);
      this.dispatchEvent(event);
    }

    private parsePayload(payload: string): { type?: string } | null {
      try {
        const parsed = JSON.parse(payload) as { type?: string };
        return typeof parsed.type === 'string' ? parsed : null;
      } catch {
        return null;
      }
    }

    private emit(message: Record<string, unknown>, feedback?: SweetlinkDemoActionDetail): void {
      window.setTimeout(() => {
        if (this.readyState !== SimulatedSweetlinkWebSocket.OPEN) return;
        const payload = feedback
          ? { ...message, demo: true, demoMessage: feedback.message }
          : message;
        const event = new MessageEvent('message', { data: JSON.stringify(payload) });
        this.onmessage?.(event);
        this.dispatchEvent(event);
        if (feedback) dispatchDemoActionFeedback(feedback);
      }, 80);
    }
  }

  window.WebSocket = SimulatedSweetlinkWebSocket as unknown as typeof WebSocket;
  window.__devbarSweetlinkDemo = true;

  return {
    active: true,
    restore: () => {
      if (window.WebSocket === (SimulatedSweetlinkWebSocket as unknown as typeof WebSocket)) {
        window.WebSocket = OriginalWebSocket;
      }
      delete window.__devbarSweetlinkDemo;
    },
  };
}

declare global {
  interface Window {
    __devbarSweetlinkDemo?: boolean;
  }
}
