/**
 * Output Schemas for Sweetlink CLI --json mode
 *
 * TypeScript interfaces for structured JSON output and string representations
 * for --output-schema discovery.
 */

// ============================================================================
// JSON Envelope
// ============================================================================

export interface JsonEnvelope<T = unknown> {
  ok: boolean;
  command: string;
  data: T;
  error?: string;
  duration: number;
}

// ============================================================================
// Per-command data interfaces
// ============================================================================

export interface ScreenshotData {
  path: string;
  width: number;
  height: number;
  method: string;
  selector?: string;
}

export interface QueryData {
  count: number;
  results: unknown[];
  property?: string;
}

export interface LogsData {
  total: number;
  format: string;
  deduped: boolean;
  logs: unknown[];
  outputPath?: string;
}

export interface ExecData {
  result: unknown;
}

export interface ClickData {
  clicked: string;
  found: number;
  index: number;
}

export interface RefreshData {
  hard: boolean;
}

export interface RulerData {
  summary: string;
  alignment?: { verticalOffset: number; horizontalOffset: number; aligned: boolean };
  results: unknown[];
  screenshotPath?: string;
}

export interface NetworkData {
  total: number;
  requests: unknown[];
}

export interface SchemaData {
  schema: unknown;
  markdown: string;
  outputPath?: string;
}

export interface OutlineData {
  outline: unknown;
  markdown: string;
  outputPath?: string;
}

export interface A11yData {
  result: unknown;
  summary: unknown;
  outputPath?: string;
}

export interface VitalsData {
  vitals: unknown;
  summary: string;
}

export interface CleanupData {
  found: number;
  closed: number;
  failed: number;
}

export interface WaitData {
  url: string;
  ready: boolean;
  elapsed: number;
}

export interface StatusData {
  url: string;
  running: boolean;
  statusCode?: number;
}

export interface DaemonStatusData {
  running: boolean;
  pid?: number;
  port?: number;
  url?: string;
  uptime?: number;
}

export interface SnapshotData {
  tree: string;
  refs?: Array<{ ref: string; role: string; name: string }>;
  diff?: string;
}

// ============================================================================
// Schema string registry (for --output-schema)
// ============================================================================

const ENVELOPE_SCHEMA = `interface JsonEnvelope<T> {
  ok: boolean;
  command: string;
  data: T;
  error?: string;
  duration: number;
}`;

export const SCHEMAS: Record<string, string> = {
  screenshot: `interface ScreenshotData {
  path: string;
  width: number;
  height: number;
  method: string;
  selector?: string;
}`,

  query: `interface QueryData {
  count: number;
  results: unknown[];
  property?: string;
}`,

  logs: `interface LogsData {
  total: number;
  format: string;
  deduped: boolean;
  logs: unknown[];
  outputPath?: string;
}`,

  exec: `interface ExecData {
  result: unknown;
}`,

  click: `interface ClickData {
  clicked: string;
  found: number;
  index: number;
}`,

  refresh: `interface RefreshData {
  hard: boolean;
}`,

  ruler: `interface RulerData {
  summary: string;
  alignment?: { verticalOffset: number; horizontalOffset: number; aligned: boolean };
  results: unknown[];
  screenshotPath?: string;
}`,

  network: `interface NetworkData {
  total: number;
  requests: unknown[];
}`,

  schema: `interface SchemaData {
  schema: unknown;
  markdown: string;
  outputPath?: string;
}`,

  outline: `interface OutlineData {
  outline: unknown;
  markdown: string;
  outputPath?: string;
}`,

  a11y: `interface A11yData {
  result: unknown;
  summary: unknown;
  outputPath?: string;
}`,

  vitals: `interface VitalsData {
  vitals: unknown;
  summary: string;
}`,

  cleanup: `interface CleanupData {
  found: number;
  closed: number;
  failed: number;
}`,

  wait: `interface WaitData {
  url: string;
  ready: boolean;
  elapsed: number;
}`,

  status: `interface StatusData {
  url: string;
  running: boolean;
  statusCode?: number;
}`,

  daemon: `interface DaemonStatusData {
  running: boolean;
  pid?: number;
  port?: number;
  url?: string;
  uptime?: number;
}`,

  snapshot: `interface SnapshotData {
  tree: string;
  refs?: Array<{ ref: string; role: string; name: string }>;
  diff?: string;
}`,

  console: `interface ConsoleData {
  formatted: string;
  total: number;
  errorCount: number;
  warningCount: number;
  entries: unknown[];
}`,

  fill: `interface FillData {
  filled: string;
  value: string;
}`,
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Write a JSON envelope to stdout. Used in --json mode.
 */
export function emitJson(envelope: JsonEnvelope): void {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

/**
 * Print TypeScript type definitions for --output-schema.
 * If command is provided, prints just that command's data type.
 * If command is omitted, prints the envelope + all command types.
 */
export function printOutputSchema(command?: string): void {
  if (command) {
    const schema = SCHEMAS[command];
    if (!schema) {
      console.error(`Unknown command: ${command}`);
      console.error(`Available commands: ${Object.keys(SCHEMAS).join(', ')}`);
      process.exit(1);
    }
    console.log(schema);
    return;
  }

  // Print envelope + all schemas
  console.log(ENVELOPE_SCHEMA);
  console.log('');
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    console.log(`// sweetlink ${name}`);
    console.log(schema);
    console.log('');
  }
}
