/**
 * Shared Type Definitions for Sweetlink
 *
 * These types are used by both the server (server.ts), the browser bridge
 * (SweetlinkBridge.ts), and the devbar package (GlobalDevBar.ts).
 */

// ============================================================================
// Port Constants (shared across all packages)
// ============================================================================

/** Default WebSocket port for Sweetlink connection */
export const DEFAULT_WS_PORT = 9223;

/** Port offset from app port to calculate WebSocket port */
export const WS_PORT_OFFSET = 6223;

/** Maximum ports to try when scanning for matching server */
export const MAX_PORT_RETRIES = 10;

/** Delay between port scan attempts (ms) */
export const PORT_RETRY_DELAY_MS = 100;

/** Same-origin WebSocket path used when an app server can proxy Sweetlink. */
export const SWEETLINK_WS_PATH = '/__sweetlink';

/**
 * Ports browsers refuse to connect to (Chrome's restricted-port list from
 * net/base/port_util.cc; Firefox and Safari block near-identical sets).
 * A WebSocket to one of these fails with ERR_UNSAFE_PORT before it ever
 * reaches the network — infamously, 443 + WS_PORT_OFFSET = 6666 (IRC).
 * Any port derived by arithmetic MUST skip these, on the client and the
 * server alike, or the two sides stop agreeing.
 */
export const UNSAFE_WS_PORTS: ReadonlySet<number> = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6697, 10080,
]);

/** Whether browsers would refuse a WebSocket connection to this port. */
export function isUnsafeWsPort(port: number): boolean {
  return UNSAFE_WS_PORTS.has(port);
}

/**
 * Bump a derived port past any browser-restricted ports (e.g. 6666 → 6670,
 * clearing the whole 6665-6669 IRC block). Idempotent for safe ports.
 */
export function toSafeWsPort(port: number): number {
  let candidate = port;
  while (UNSAFE_WS_PORTS.has(candidate)) {
    candidate++;
  }
  return candidate;
}

// ============================================================================
// Local Development URL Helpers
// ============================================================================

export interface SweetlinkLocationLike {
  protocol: string;
  port: string;
  host?: string;
}

export interface SweetlinkRuntimeConfig {
  appPort?: number | string | null;
  wsPort?: number | string | null;
  wsUrl?: string | null;
  wsPath?: string | null;
}

export function parsePortNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : null;
}

export function getDefaultPortForProtocol(protocol: string): number | null {
  if (protocol === 'http:') {
    return 80;
  }
  if (protocol === 'https:') {
    return 443;
  }
  return null;
}

export function resolveAppPortFromLocation(location: SweetlinkLocationLike): number {
  return parsePortNumber(location.port) ?? getDefaultPortForProtocol(location.protocol) ?? 0;
}

export function resolveSweetlinkWsPortForAppPort(appPort: number | null | undefined): number {
  const parsedAppPort = parsePortNumber(appPort);
  // Protocol-default ports mean the app sits behind a local HTTPS/HTTP proxy
  // (e.g. Portless); the real dev-server port cannot be derived from the
  // location, so fall back to the default WS port instead of computing
  // garbage (443 + offset = 6666, a browser-restricted port).
  if (!parsedAppPort || parsedAppPort === 80 || parsedAppPort === 443) {
    return DEFAULT_WS_PORT;
  }
  return toSafeWsPort(parsedAppPort + WS_PORT_OFFSET);
}

export function resolveSweetlinkWsPortFromLocation(location: SweetlinkLocationLike): number {
  return resolveSweetlinkWsPortForAppPort(resolveAppPortFromLocation(location));
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

interface NextPublicSweetlinkEnv {
  appPort?: string;
  wsPort?: string;
  wsUrl?: string;
  wsPath?: string;
}

/**
 * Read the `NEXT_PUBLIC_SWEETLINK_*` hints injected by the Next.js plugin.
 *
 * Next.js (webpack AND Turbopack) inlines public env vars into client
 * bundles only when they are written as static member expressions
 * (`process.env.NEXT_PUBLIC_X`). Reading them off an intermediate
 * `process.env` object reference defeats the build-time replacement — the
 * values never reach the browser — so each key must be spelled out
 * literally here.
 */
function getNextPublicSweetlinkEnv(): NextPublicSweetlinkEnv {
  try {
    return {
      appPort: process.env.NEXT_PUBLIC_SWEETLINK_APP_PORT,
      wsPort: process.env.NEXT_PUBLIC_SWEETLINK_WS_PORT,
      wsUrl: process.env.NEXT_PUBLIC_SWEETLINK_WS_URL,
      wsPath: process.env.NEXT_PUBLIC_SWEETLINK_WS_PATH,
    };
  } catch {
    // `process` does not exist in unbundled browser contexts.
    return {};
  }
}

function normalizeWsPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const path = value.trim();
  return path.startsWith('/') ? path : `/${path}`;
}

function normalizeWsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Read Sweetlink connection hints injected by framework integrations.
 *
 * Vite injects `window.__SWEETLINK__`; Next.js exposes the same values through
 * `NEXT_PUBLIC_SWEETLINK_*` env replacement. Explicit user options should still
 * take precedence over these hints.
 */
export function getSweetlinkRuntimeConfig(
  globalValue: unknown = globalThis
): SweetlinkRuntimeConfig {
  const globalRecord = getRecord(globalValue);
  const nested = getRecord(globalRecord?.__SWEETLINK__);
  const env = getNextPublicSweetlinkEnv();
  const appPort = globalRecord?.__SWEETLINK_APP_PORT__ ?? nested?.appPort ?? env.appPort;
  const wsPort = globalRecord?.__SWEETLINK_WS_PORT__ ?? nested?.wsPort ?? env.wsPort;

  return {
    appPort: typeof appPort === 'string' || typeof appPort === 'number' ? appPort : null,
    wsPort: typeof wsPort === 'string' || typeof wsPort === 'number' ? wsPort : null,
    wsUrl:
      normalizeWsUrl(globalRecord?.__SWEETLINK_WS_URL__ ?? nested?.wsUrl) ??
      normalizeWsUrl(env.wsUrl),
    wsPath:
      normalizeWsPath(globalRecord?.__SWEETLINK_WS_PATH__ ?? nested?.wsPath) ??
      normalizeWsPath(env.wsPath),
  };
}

export function resolveAppPortFromRuntimeConfig(
  location: SweetlinkLocationLike,
  config: SweetlinkRuntimeConfig
): number {
  return parsePortNumber(config.appPort) ?? resolveAppPortFromLocation(location);
}

export function createSameOriginSweetlinkWsUrl(
  location: SweetlinkLocationLike,
  path: string = SWEETLINK_WS_PATH
): string | null {
  if (!location.host) return null;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}${normalizeWsPath(path) ?? SWEETLINK_WS_PATH}`;
}

/**
 * Build the ordered list of WebSocket endpoints a browser client should try.
 * Shared by the devbar and the SweetlinkBridge so both agree on priority:
 *
 * 1. An explicit `wsUrl` hint (framework plugin or user option).
 * 2. The same-origin Sweetlink path — always when a `wsPath` hint was
 *    injected, and also whenever the page has no explicit port. Behind a
 *    local HTTPS proxy (Portless etc.) the location carries no usable port,
 *    so the conventional `/__sweetlink` endpoint is the only derivable one.
 * 3. Localhost port math as the last resort.
 */
export function buildSweetlinkWsUrlCandidates(
  location: SweetlinkLocationLike,
  options: {
    wsUrl?: string | null;
    wsPort?: number | string | null;
    wsPath?: string | null;
    fallbackPort: number;
  }
): string[] {
  const urls: string[] = [];
  const add = (url: string | null | undefined): void => {
    if (url && !urls.includes(url)) urls.push(url);
  };

  add(options.wsUrl);
  if (options.wsPath) {
    add(createSameOriginSweetlinkWsUrl(location, options.wsPath));
  } else if (!parsePortNumber(location.port)) {
    add(createSameOriginSweetlinkWsUrl(location));
  }
  add(`ws://localhost:${parsePortNumber(options.wsPort) ?? options.fallbackPort}`);
  return urls;
}

export function isLocalDevelopmentHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.test') ||
    normalized.endsWith('.local')
  );
}

export function parseLocalDevelopmentUrl(value: string | null | undefined): URL | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return isLocalDevelopmentHostname(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

export function isLocalDevelopmentOrigin(origin: string | null | undefined): boolean {
  const url = parseLocalDevelopmentUrl(origin);
  return Boolean(
    url && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password
  );
}

export function resolveAppPortFromLocalUrl(value: string | null | undefined): number | null {
  const url = parseLocalDevelopmentUrl(value);
  if (!url) {
    return null;
  }
  return parsePortNumber(url.port) ?? getDefaultPortForProtocol(url.protocol);
}

export function localOriginMatchesAppPort(
  origin: string | null | undefined,
  appPort: number | null | undefined
): boolean {
  const parsedAppPort = parsePortNumber(appPort);
  const originAppPort = isLocalDevelopmentOrigin(origin)
    ? resolveAppPortFromLocalUrl(origin)
    : null;
  return parsedAppPort !== null && originAppPort === parsedAppPort;
}

// ============================================================================
// Console Log Types
// ============================================================================

/**
 * Structure for captured console log entries
 */
export type ConsoleLogLevel = 'log' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface ConsoleLog {
  level: ConsoleLogLevel;
  message: string;
  timestamp: number;
  stack?: string;
  source?: string;
}

// ============================================================================
// WebSocket Command Types
// ============================================================================

/**
 * Individual command interfaces for the discriminated union.
 * Each command type declares only the fields it actually uses.
 */

/**
 * Optional pass-through for screenshot/refresh sub-protocol. Tightened to a
 * known shape so the WS contract is no longer an opaque escape hatch.
 * Add fields here as new options ship; downstream callers that pass
 * unknown keys will fail to typecheck instead of silently dropping them.
 */
export interface ScreenshotOptions {
  /** Capture full page (vs viewport-only). */
  fullPage?: boolean;
  /** Output format. */
  format?: 'jpeg' | 'png';
  /** JPEG quality 0-100; ignored for PNG. */
  quality?: number;
  /** Device-pixel scale factor. */
  scale?: number;
  /** Whether to include the captured page metadata in the response. */
  includeMetadata?: boolean;
  /** Run an a11y audit after capturing. */
  a11y?: boolean;
}

/**
 * Optional CLI-provided target for client-executing commands: the URL of the
 * page the command is meant for (from `--url`). The server uses it to pick
 * the matching browser client when several are connected (pages from
 * multiple projects can attach to one server); browser clients ignore it.
 */
export interface TargetedCommand {
  targetUrl?: string;
}

export interface ScreenshotCommand extends TargetedCommand {
  type: 'screenshot';
  selector?: string;
  hideDevbar?: boolean;
  options?: ScreenshotOptions;
}

export interface QueryDomCommand extends TargetedCommand {
  type: 'query-dom';
  selector?: string;
  property?: string;
}

export interface GetLogsCommand extends TargetedCommand {
  type: 'get-logs';
  filter?: string;
}

export interface ExecJsCommand extends TargetedCommand {
  type: 'exec-js';
  code?: string;
}

export interface GetNetworkCommand {
  type: 'get-network';
}

export interface BrowserClientReadyCommand {
  type: 'browser-client-ready';
  /**
   * The page's current location. Lets the server route targeted commands to
   * the client that is actually on the requested page.
   */
  url?: string;
}

/**
 * Generic "save artifact" variant.
 *
 * The optional second type parameter narrows the `data` payload for callers
 * that have it. Default is `unknown` because the wire protocol delivers
 * data as JSON — receivers still call the `is*Data` type guards. Producers
 * (the browser building the message) get full type-checking via the
 * payload generic.
 */
export interface SaveCommand<T extends string, P = unknown> {
  type: T;
  data?: P;
}

export type SaveScreenshotCommand = SaveCommand<'save-screenshot', ScreenshotPayload>;

export type DesignReviewScreenshotCommand = SaveCommand<
  'design-review-screenshot',
  ScreenshotPayload
>;

export interface CheckApiKeyCommand {
  type: 'check-api-key';
}

export interface ApiKeyStatusCommand {
  type: 'api-key-status';
}

export type SaveOutlineCommand = SaveCommand<
  'save-outline',
  MarkdownSavePayload & { outline: unknown[] }
>;

export type SaveSchemaCommand = SaveCommand<
  'save-schema',
  MarkdownSavePayload & { schema: unknown }
>;

export type SaveSettingsCommand = SaveCommand<
  'save-settings',
  { settings: Record<string, unknown> }
>;

export interface LoadSettingsCommand {
  type: 'load-settings';
}

export interface SettingsLoadedCommand {
  type: 'settings-loaded';
  /**
   * Settings payload as opaque key/value record. Receivers parse it with
   * the SettingsManager-side validator; the type guarantees a non-string,
   * non-null payload at compile time but does not constrain the keys
   * (DevBar's settings shape lives in the consumer package).
   */
  settings?: Record<string, unknown>;
}

export interface SettingsSavedCommand {
  type: 'settings-saved';
  settingsPath?: string;
}

/**
 * Generic error variant. Every "X-error" command has the same shape — a
 * literal `type` discriminator and an optional `error` message — so we
 * express each one as `ErrorCommand<'X-error'>` instead of declaring six
 * structurally identical interfaces. Adding a new error variant becomes
 * a one-line alias.
 */
export interface ErrorCommand<T extends string> {
  type: T;
  error?: string;
}

export type SettingsErrorCommand = ErrorCommand<'settings-error'>;

export interface RefreshOptions {
  /** Force a full hard reload (bypass cache). */
  hard?: boolean;
}

export interface RefreshCommand extends TargetedCommand {
  type: 'refresh';
  options?: RefreshOptions;
}

export interface RequestScreenshotCommand {
  type: 'request-screenshot';
  requestId?: string;
  selector?: string;
  hideDevbar?: boolean;
  format?: ScreenshotOptions['format'];
  quality?: number;
  scale?: number;
  includeMetadata?: boolean;
  options?: ScreenshotOptions;
}

export interface ScreenshotResponseCommand {
  type: 'screenshot-response';
  requestId?: string;
  data?: unknown;
}

export interface LogSubscribeCommand {
  type: 'log-subscribe';
  subscriptionId?: string;
  filters?: {
    levels?: ConsoleLogLevel[];
    pattern?: string;
    source?: string;
  };
}

export interface LogUnsubscribeCommand {
  type: 'log-unsubscribe';
  subscriptionId?: string;
}

export interface LogEventCommand {
  type: 'log-event';
  data?: unknown;
}

export interface HmrScreenshotCommand {
  type: 'hmr-screenshot';
  data?: unknown;
}

export interface ChannelSubscribeCommand {
  type: 'subscribe';
  channel?: string;
}

export interface ChannelUnsubscribeCommand {
  type: 'unsubscribe';
  channel?: string;
}

export interface ScreenshotSavedCommand {
  type: 'screenshot-saved';
  path?: string;
}

export interface DesignReviewSavedCommand {
  type: 'design-review-saved';
  reviewPath?: string;
}

export type DesignReviewErrorCommand = ErrorCommand<'design-review-error'>;

export interface OutlineSavedCommand {
  type: 'outline-saved';
  outlinePath?: string;
}

export type OutlineErrorCommand = ErrorCommand<'outline-error'>;

export interface SchemaSavedCommand {
  type: 'schema-saved';
  schemaPath?: string;
}

export type SchemaErrorCommand = ErrorCommand<'schema-error'>;

export type SaveConsoleLogsCommand = SaveCommand<
  'save-console-logs',
  MarkdownSavePayload & { logs: unknown[] }
>;

export interface ConsoleLogsSavedCommand {
  type: 'console-logs-saved';
  consoleLogsPath?: string;
}

export type ConsoleLogsErrorCommand = ErrorCommand<'console-logs-error'>;

export type SaveA11yCommand = SaveCommand<'save-a11y', MarkdownSavePayload>;

export interface A11ySavedCommand {
  type: 'a11y-saved';
  a11yPath?: string;
}

export type A11yErrorCommand = ErrorCommand<'a11y-error'>;

export interface GetSchemaCommand {
  type: 'get-schema';
}

export interface GetOutlineCommand {
  type: 'get-outline';
}

export interface GetA11yCommand {
  type: 'get-a11y';
  forceRefresh?: boolean;
}

export interface GetVitalsCommand {
  type: 'get-vitals';
}

export interface RecordStartCommand {
  type: 'record-start';
  /**
   * Optional recording options forwarded browser→daemon over the WS bridge.
   * Intentionally limited to `label`/`viewport`: the daemon's HTTP API also
   * accepts `storageState` (a daemon-side auth-replay file path) and `trace`,
   * but those are CLI/HTTP-only and must NOT be reachable from a browser
   * origin — the WS proxy allow-lists to these two keys (see
   * `handleRecordCommand` in `server/index.ts`).
   */
  params?: {
    label?: string;
    viewport?: string;
  };
}

export interface RecordStopCommand {
  type: 'record-stop';
}

export interface DemoInitCommand {
  type: 'demo-init';
  data?: { title?: string };
}

export interface DemoScreenshotCommand {
  type: 'demo-screenshot';
}

export interface HifiScreenshotCommand {
  type: 'hifi-screenshot';
}

/**
 * Commands that can be sent over the Sweetlink WebSocket connection.
 *
 * This is a discriminated union on the `type` field. Each variant carries
 * only the fields that are relevant for that particular command.
 */
export type SweetlinkCommand =
  | ScreenshotCommand
  | QueryDomCommand
  | GetLogsCommand
  | ExecJsCommand
  | GetNetworkCommand
  | BrowserClientReadyCommand
  | SaveScreenshotCommand
  | DesignReviewScreenshotCommand
  | CheckApiKeyCommand
  | ApiKeyStatusCommand
  | SaveOutlineCommand
  | SaveSchemaCommand
  | SaveSettingsCommand
  | LoadSettingsCommand
  | SettingsLoadedCommand
  | SettingsSavedCommand
  | SettingsErrorCommand
  | RefreshCommand
  | RequestScreenshotCommand
  | ScreenshotResponseCommand
  | LogSubscribeCommand
  | LogUnsubscribeCommand
  | LogEventCommand
  | HmrScreenshotCommand
  | ChannelSubscribeCommand
  | ChannelUnsubscribeCommand
  | ScreenshotSavedCommand
  | DesignReviewSavedCommand
  | DesignReviewErrorCommand
  | OutlineSavedCommand
  | OutlineErrorCommand
  | SchemaSavedCommand
  | SchemaErrorCommand
  | SaveConsoleLogsCommand
  | ConsoleLogsSavedCommand
  | ConsoleLogsErrorCommand
  | GetSchemaCommand
  | GetOutlineCommand
  | GetA11yCommand
  | GetVitalsCommand
  | SaveA11yCommand
  | A11ySavedCommand
  | A11yErrorCommand
  | RecordStartCommand
  | RecordStopCommand
  | DemoInitCommand
  | DemoScreenshotCommand
  | HifiScreenshotCommand;

/**
 * Response structure for Sweetlink commands
 */
export interface SweetlinkResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  timestamp: number;
  consoleLogs?: ConsoleLog[];
  duration?: number;
}

// ============================================================================
// HMR Types
// ============================================================================

/**
 * Data structure for HMR-triggered screenshots
 */
export interface HmrScreenshotData {
  trigger: string;
  changedFile?: string;
  screenshot: string;
  url: string;
  timestamp: number;
  sequenceNumber: number;
  logs: {
    all: ConsoleLog[];
    errors: ConsoleLog[];
    warnings: ConsoleLog[];
    sinceLastCapture: number;
  };
  hmrMetadata?: {
    modulesUpdated?: string[];
    fullReload?: boolean;
    updateDuration?: number;
  };
}

// ============================================================================
// Server Info Types
// ============================================================================

/**
 * Server information sent to browser clients
 */
export interface ServerInfo {
  type: 'server-info';
  appPort: number | null;
  wsPort: number;
  projectDir: string;
  /** Git branch name (or worktree branch if running inside a git worktree) */
  gitBranch?: string;
  /** Logical app name, e.g. "el-lander" (from portless or package.json name) */
  appName?: string;
  timestamp: number;
}

// ============================================================================
// Document Structure Types
// ============================================================================

/**
 * Semantic category assigned to an outline node by getSemanticCategory.
 */
export type OutlineCategory =
  | 'heading'
  | 'sectioning'
  | 'landmark'
  | 'grouping'
  | 'form'
  | 'table'
  | 'list'
  | 'other';

/**
 * Node in the document outline tree
 */
export interface OutlineNode {
  tagName: string;
  level: number;
  text: string;
  id?: string;
  children: OutlineNode[];
  category?: OutlineCategory;
}

/**
 * A single microdata item extracted from the page
 */
export interface MicrodataItem {
  type?: string;
  properties?: Record<string, unknown>;
}

/**
 * Extracted page schema information
 */
export interface PageSchema {
  jsonLd: unknown[];
  metaTags: Record<string, string>;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  microdata: MicrodataItem[];
}

/**
 * A meta image found on the page (OG, Twitter, favicon, etc.)
 */
export interface MetaImage {
  label: string;
  url: string;
  size?: string;
}

/**
 * A missing recommended meta tag
 */
export interface MissingTag {
  tag: string;
  severity: 'error' | 'warning';
  hint: string;
}

// ============================================================================
// Accessibility Types
// ============================================================================

/**
 * Axe-core violation result (simplified)
 */
export interface AxeViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: Array<{
    html: string;
    target: string[];
    failureSummary?: string;
  }>;
}

/**
 * Axe-core audit result
 */
export interface AxeResult {
  violations: AxeViolation[];
  passes: Array<{ id: string; description: string }>;
  incomplete: AxeViolation[];
  inapplicable: Array<{ id: string }>;
  timestamp: string;
  url: string;
}

// ============================================================================
// Subscription Types (v1.4.0)
// ============================================================================

/**
 * Log subscription for streaming logs to CLI clients
 */
export interface LogSubscription {
  subscriptionId: string;
  filters?: {
    levels?: ConsoleLogLevel[];
    pattern?: string;
    source?: string;
  };
}

/**
 * Channel subscription for generic event streams
 */
export interface ChannelSubscription {
  channel: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid SweetlinkCommand
 */
export function isSweetlinkCommand(value: unknown): value is SweetlinkCommand {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string'
  );
}

/**
 * Check if a value is a valid ConsoleLog
 */
export function isConsoleLog(value: unknown): value is ConsoleLog {
  return (
    value !== null &&
    typeof value === 'object' &&
    'level' in value &&
    'message' in value &&
    'timestamp' in value &&
    typeof (value as Record<string, unknown>).level === 'string' &&
    typeof (value as Record<string, unknown>).message === 'string' &&
    typeof (value as Record<string, unknown>).timestamp === 'number'
  );
}

/**
 * Check if a value is a valid HmrScreenshotData
 */
export function isHmrScreenshotData(value: unknown): value is HmrScreenshotData {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.trigger === 'string' &&
    typeof obj.screenshot === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.timestamp === 'number'
  );
}

/**
 * Shared shape for screenshot-like command data (screenshot + url + dimensions + timestamp).
 * Used by both save-screenshot and design-review-screenshot commands.
 *
 * Exported so producers (the browser) can construct typed save commands
 * instead of passing `data: unknown`. The receiver still calls the
 * `isScreenshotPayload`-based type guard at runtime — trust between the
 * browser and the daemon is unidirectional.
 */
export type ScreenshotPayload = {
  screenshot: string;
  url: string;
  timestamp: number;
  width: number;
  height: number;
};

/**
 * Shared shape for markdown-based save commands.
 */
export type MarkdownSavePayload = {
  markdown: string;
  url: string;
  title: string;
  timestamp: number;
};

function isScreenshotPayload(value: unknown): value is ScreenshotPayload {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.screenshot === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.timestamp === 'number' &&
    typeof obj.width === 'number' &&
    typeof obj.height === 'number'
  );
}

/**
 * Type guard for save-screenshot command data
 */
export function isSaveScreenshotData(value: unknown): value is ScreenshotPayload {
  return isScreenshotPayload(value);
}

/**
 * Type guard for design-review-screenshot command data
 */
export function isDesignReviewScreenshotData(value: unknown): value is ScreenshotPayload {
  return isScreenshotPayload(value);
}

// MarkdownSavePayload is exported earlier alongside ScreenshotPayload so
// producers can construct typed save commands.

function isMarkdownSavePayload(value: unknown): value is MarkdownSavePayload {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.markdown === 'string' &&
    typeof obj.url === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.timestamp === 'number'
  );
}

/**
 * Type guard for save-outline command data
 */
export function isSaveOutlineData(
  value: unknown
): value is MarkdownSavePayload & { outline: unknown[] } {
  return isMarkdownSavePayload(value) && Array.isArray((value as Record<string, unknown>).outline);
}

/**
 * Type guard for save-schema command data
 */
export function isSaveSchemaData(
  value: unknown
): value is MarkdownSavePayload & { schema: unknown } {
  if (!isMarkdownSavePayload(value)) return false;
  const obj = value as Record<string, unknown>;
  return obj.schema !== null && typeof obj.schema === 'object';
}

/**
 * Type guard for save-console-logs command data
 */
export function isSaveConsoleLogsData(
  value: unknown
): value is MarkdownSavePayload & { logs: unknown[] } {
  return isMarkdownSavePayload(value) && Array.isArray((value as Record<string, unknown>).logs);
}

/**
 * Type guard for save-a11y command data
 */
export function isSaveA11yData(value: unknown): value is MarkdownSavePayload {
  return isMarkdownSavePayload(value);
}

/**
 * Type guard for save-settings command data
 * Validates minimum required fields for handleSaveSettings
 */
export function isSaveSettingsData(value: unknown): value is { settings: Record<string, unknown> } {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return obj.settings !== null && typeof obj.settings === 'object';
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
