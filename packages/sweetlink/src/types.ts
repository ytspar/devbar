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
  return parsedAppPort ? parsedAppPort + WS_PORT_OFFSET : DEFAULT_WS_PORT;
}

export function resolveSweetlinkWsPortFromLocation(location: SweetlinkLocationLike): number {
  return resolveSweetlinkWsPortForAppPort(resolveAppPortFromLocation(location));
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getProcessEnv(): Record<string, string | undefined> {
  if (typeof process === 'undefined') return {};
  return process.env;
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
  const env = getProcessEnv();
  const appPort =
    globalRecord?.__SWEETLINK_APP_PORT__ ?? nested?.appPort ?? env.NEXT_PUBLIC_SWEETLINK_APP_PORT;
  const wsPort =
    globalRecord?.__SWEETLINK_WS_PORT__ ?? nested?.wsPort ?? env.NEXT_PUBLIC_SWEETLINK_WS_PORT;

  return {
    appPort: typeof appPort === 'string' || typeof appPort === 'number' ? appPort : null,
    wsPort: typeof wsPort === 'string' || typeof wsPort === 'number' ? wsPort : null,
    wsUrl:
      normalizeWsUrl(globalRecord?.__SWEETLINK_WS_URL__ ?? nested?.wsUrl) ??
      normalizeWsUrl(env.NEXT_PUBLIC_SWEETLINK_WS_URL),
    wsPath:
      normalizeWsPath(globalRecord?.__SWEETLINK_WS_PATH__ ?? nested?.wsPath) ??
      normalizeWsPath(env.NEXT_PUBLIC_SWEETLINK_WS_PATH),
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

export interface ScreenshotCommand {
  type: 'screenshot';
  selector?: string;
  hideDevbar?: boolean;
  options?: Record<string, unknown>;
}

export interface QueryDomCommand {
  type: 'query-dom';
  selector?: string;
  property?: string;
}

export interface GetLogsCommand {
  type: 'get-logs';
  filter?: string;
}

export interface ExecJsCommand {
  type: 'exec-js';
  code?: string;
}

export interface GetNetworkCommand {
  type: 'get-network';
}

export interface BrowserClientReadyCommand {
  type: 'browser-client-ready';
}

export interface SaveScreenshotCommand {
  type: 'save-screenshot';
  data?: unknown;
}

export interface DesignReviewScreenshotCommand {
  type: 'design-review-screenshot';
  data?: unknown;
}

export interface CheckApiKeyCommand {
  type: 'check-api-key';
}

export interface ApiKeyStatusCommand {
  type: 'api-key-status';
}

export interface SaveOutlineCommand {
  type: 'save-outline';
  data?: unknown;
}

export interface SaveSchemaCommand {
  type: 'save-schema';
  data?: unknown;
}

export interface SaveSettingsCommand {
  type: 'save-settings';
  data?: unknown;
}

export interface LoadSettingsCommand {
  type: 'load-settings';
}

export interface SettingsLoadedCommand {
  type: 'settings-loaded';
  settings?: unknown;
}

export interface SettingsSavedCommand {
  type: 'settings-saved';
  settingsPath?: string;
}

export interface SettingsErrorCommand {
  type: 'settings-error';
  error?: string;
}

export interface RefreshCommand {
  type: 'refresh';
  options?: Record<string, unknown>;
}

export interface RequestScreenshotCommand {
  type: 'request-screenshot';
  requestId?: string;
  selector?: string;
  hideDevbar?: boolean;
  format?: 'jpeg' | 'png';
  quality?: number;
  scale?: number;
  includeMetadata?: boolean;
  options?: Record<string, unknown>;
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
    levels?: ('log' | 'error' | 'warn' | 'info' | 'debug')[];
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

export interface DesignReviewErrorCommand {
  type: 'design-review-error';
  error?: string;
}

export interface OutlineSavedCommand {
  type: 'outline-saved';
  outlinePath?: string;
}

export interface OutlineErrorCommand {
  type: 'outline-error';
  error?: string;
}

export interface SchemaSavedCommand {
  type: 'schema-saved';
  schemaPath?: string;
}

export interface SchemaErrorCommand {
  type: 'schema-error';
  error?: string;
}

export interface SaveConsoleLogsCommand {
  type: 'save-console-logs';
  data?: unknown;
}

export interface ConsoleLogsSavedCommand {
  type: 'console-logs-saved';
  consoleLogsPath?: string;
}

export interface ConsoleLogsErrorCommand {
  type: 'console-logs-error';
  error?: string;
}

export interface SaveA11yCommand {
  type: 'save-a11y';
  data?: unknown;
}

export interface A11ySavedCommand {
  type: 'a11y-saved';
  a11yPath?: string;
}

export interface A11yErrorCommand {
  type: 'a11y-error';
  error?: string;
}

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
 * Node in the document outline tree
 */
export interface OutlineNode {
  tagName: string;
  level: number;
  text: string;
  id?: string;
  children: OutlineNode[];
  category?: string;
}

/**
 * A single microdata item extracted from the page
 */
interface MicrodataItem {
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
    levels?: string[];
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
 */
type ScreenshotPayload = {
  screenshot: string;
  url: string;
  timestamp: number;
  width: number;
  height: number;
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

/**
 * Shared shape for markdown-based save commands (markdown + url + title + timestamp).
 * Used by outline, schema, console-logs, and a11y save commands.
 */
type MarkdownSavePayload = { markdown: string; url: string; title: string; timestamp: number };

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
