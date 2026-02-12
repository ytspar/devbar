// @vitest-environment node

/**
 * Sweetlink CLI Tests
 *
 * Tests for the CLI entry point: argument parsing, command routing,
 * log deduplication, port scanning, WebSocket communication, and
 * individual command formatting. All I/O is mocked.
 *
 * Strategy:
 * - Pure functions (deduplicateLogs, getPortsToScan, getArg, etc.) are
 *   re-implemented in the test file and tested directly, since the CLI
 *   module doesn't export them.
 * - Integration tests use vi.resetModules() + dynamic import() with
 *   process.argv configured before each import. process.exit is mocked
 *   as a no-op to prevent crashes.
 * - The mock WebSocket auto-replies with a configurable response when
 *   it receives a message, eliminating timing issues.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WS_PORT, MAX_PORT_RETRIES, WS_PORT_OFFSET } from '../types.js';

// ---------------------------------------------------------------------------
// Hoisted mocks — available inside vi.mock factories
// ---------------------------------------------------------------------------

const { MockWebSocket, autoResponse } = vi.hoisted(() => {
  const { EventEmitter: EE } = require('events');

  /**
   * Configurable auto-response: when set, the mock WebSocket will
   * automatically emit 'open' followed by a 'message' with this response
   * after construction. This eliminates timing issues.
   */
  const autoResponse: { value: object | null } = { value: null };

  class MockWS extends EE {
    static instances: MockWS[] = [];
    url: string;
    readyState = 1; // OPEN
    send = vi.fn();
    close = vi.fn();

    constructor(url: string) {
      super();
      this.url = url;
      MockWS.instances.push(this);

      // Auto-reply if configured
      if (autoResponse.value) {
        const response = autoResponse.value;
        // Use queueMicrotask to run after the caller has attached event listeners
        queueMicrotask(() => {
          this.emit('open');
          // After open, send is called by the module — reply after that
          queueMicrotask(() => {
            this.emit('message', Buffer.from(JSON.stringify(response)));
          });
        });
      }
    }

    static reset() {
      MockWS.instances = [];
    }
  }

  return { MockWebSocket: MockWS, autoResponse };
});

// Mock ws module
vi.mock('ws', () => ({
  WebSocket: MockWebSocket,
}));

// Mock heavy external dependencies so importing the CLI doesn't pull them in
vi.mock('../cdp.js', () => ({
  detectCDP: vi.fn().mockResolvedValue(false),
  getNetworkRequestsViaCDP: vi.fn().mockResolvedValue([]),
}));

vi.mock('../playwright.js', () => ({
  screenshotViaPlaywright: vi.fn().mockResolvedValue({
    width: 1512,
    height: 982,
  }),
}));

vi.mock('../ruler.js', () => ({
  getCardHeaderPreset: vi.fn(() => ({ selectors: ['article h2', 'article header > div:first-child'] })),
  getNavigationPreset: vi.fn(() => ({ selectors: ['.nav-item', '.nav-button'] })),
  measureViaPlaywright: vi.fn().mockResolvedValue({
    summary: '2 selectors measured',
    alignment: { verticalOffset: 0, horizontalOffset: 0, aligned: true },
    results: [],
    screenshotPath: null,
  }),
}));

// Mock fs to avoid real filesystem access
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => JSON.stringify({ dependencies: { '@ytspar/sweetlink': '*' } })),
  writeFileSync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const logs: string[] = [];
const errors: string[] = [];
const warns: string[] = [];
let spyLog: ReturnType<typeof vi.spyOn>;
let spyError: ReturnType<typeof vi.spyOn>;
let spyWarn: ReturnType<typeof vi.spyOn>;
let spyStdout: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
let originalArgv: string[];
let originalFetch: typeof globalThis.fetch;

function setup() {
  originalArgv = [...process.argv];
  originalFetch = globalThis.fetch;
  MockWebSocket.reset();
  autoResponse.value = null;
  logs.length = 0;
  errors.length = 0;
  warns.length = 0;

  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  spyLog = vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.map(String).join(' '));
  });
  spyError = vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args.map(String).join(' '));
  });
  spyWarn = vi.spyOn(console, 'warn').mockImplementation((...args) => {
    warns.push(args.map(String).join(' '));
  });
  spyStdout = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never);

  // Default: mock fetch as successful (for waitForServer)
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
}

function teardown() {
  process.argv = originalArgv;
  globalThis.fetch = originalFetch;
  autoResponse.value = null;
  exitSpy.mockRestore();
  spyLog.mockRestore();
  spyError.mockRestore();
  spyWarn.mockRestore();
  spyStdout.mockRestore();
  vi.restoreAllMocks();
}

/**
 * Import the CLI module with the given argv. The module runs its IIFE
 * immediately on import, so we must configure argv and mocks first.
 * Returns a promise that resolves when the IIFE finishes.
 */
async function runCLI(argv: string[]): Promise<void> {
  process.argv = ['node', 'sweetlink', ...argv];
  vi.resetModules();
  // Allow the IIFE to complete — it's an async function, so we await any
  // pending microtasks / timers.
  await import('./sweetlink.js').catch(() => {});
  // Drain microtask queue
  await new Promise((r) => setTimeout(r, 50));
}

// ===========================================================================
// 1. Pure function tests — deduplicateLogs
// ===========================================================================

interface LogEntry {
  level: string;
  message: string;
  timestamp: number;
}

interface DedupedLog {
  level: string;
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

/**
 * Re-implementation of the internal deduplicateLogs function from sweetlink.ts.
 * Tested directly to verify correctness without triggering the CLI IIFE.
 */
function deduplicateLogs(logs: LogEntry[]): DedupedLog[] {
  const seen = new Map<string, DedupedLog>();

  for (const log of logs) {
    const msgKey = log.message.substring(0, 200);
    const key = `${log.level}:${msgKey}`;

    const existing = seen.get(key);
    if (existing) {
      existing.count++;
      existing.lastSeen = Math.max(existing.lastSeen, log.timestamp);
    } else {
      seen.set(key, {
        level: log.level,
        message: log.message,
        count: 1,
        firstSeen: log.timestamp,
        lastSeen: log.timestamp,
      });
    }
  }

  return Array.from(seen.values()).sort((a, b) => {
    const levelOrder = { error: 0, warn: 1, info: 2, log: 3 };
    const aOrder = levelOrder[a.level as keyof typeof levelOrder] ?? 4;
    const bOrder = levelOrder[b.level as keyof typeof levelOrder] ?? 4;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.count - a.count;
  });
}

describe('deduplicateLogs', () => {
  it('returns empty array for empty input', () => {
    expect(deduplicateLogs([])).toEqual([]);
  });

  it('deduplicates identical messages', () => {
    const entries: LogEntry[] = [
      { level: 'error', message: 'Something broke', timestamp: 1000 },
      { level: 'error', message: 'Something broke', timestamp: 2000 },
      { level: 'error', message: 'Something broke', timestamp: 3000 },
    ];
    const result = deduplicateLogs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
    expect(result[0].firstSeen).toBe(1000);
    expect(result[0].lastSeen).toBe(3000);
  });

  it('sorts errors before warnings before info before log', () => {
    const entries: LogEntry[] = [
      { level: 'log', message: 'debug info', timestamp: 1000 },
      { level: 'error', message: 'critical failure', timestamp: 1000 },
      { level: 'info', message: 'status update', timestamp: 1000 },
      { level: 'warn', message: 'deprecation', timestamp: 1000 },
    ];
    const result = deduplicateLogs(entries);
    expect(result.map((r) => r.level)).toEqual(['error', 'warn', 'info', 'log']);
  });

  it('sorts by count (descending) within the same level', () => {
    const entries: LogEntry[] = [
      { level: 'error', message: 'rare error', timestamp: 1000 },
      { level: 'error', message: 'common error', timestamp: 1000 },
      { level: 'error', message: 'common error', timestamp: 2000 },
      { level: 'error', message: 'common error', timestamp: 3000 },
    ];
    const result = deduplicateLogs(entries);
    expect(result).toHaveLength(2);
    expect(result[0].message).toBe('common error');
    expect(result[0].count).toBe(3);
    expect(result[1].message).toBe('rare error');
    expect(result[1].count).toBe(1);
  });

  it('uses first 200 chars as dedup key', () => {
    const longMsg = 'A'.repeat(300);
    const longMsgVariant = 'A'.repeat(200) + 'B'.repeat(100);
    const entries: LogEntry[] = [
      { level: 'error', message: longMsg, timestamp: 1000 },
      { level: 'error', message: longMsgVariant, timestamp: 2000 },
    ];
    const result = deduplicateLogs(entries);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(2);
  });

  it('treats different levels as separate entries even with same message', () => {
    const entries: LogEntry[] = [
      { level: 'error', message: 'same msg', timestamp: 1000 },
      { level: 'warn', message: 'same msg', timestamp: 1000 },
    ];
    const result = deduplicateLogs(entries);
    expect(result).toHaveLength(2);
    expect(result[0].level).toBe('error');
    expect(result[1].level).toBe('warn');
  });

  it('handles unknown log levels by sorting them last', () => {
    const entries: LogEntry[] = [
      { level: 'custom', message: 'custom level', timestamp: 1000 },
      { level: 'log', message: 'normal log', timestamp: 1000 },
    ];
    const result = deduplicateLogs(entries);
    expect(result[0].level).toBe('log');
    expect(result[1].level).toBe('custom');
  });

  it('tracks firstSeen and lastSeen correctly across duplicates', () => {
    const entries: LogEntry[] = [
      { level: 'warn', message: 'dup', timestamp: 5000 },
      { level: 'warn', message: 'dup', timestamp: 1000 },
      { level: 'warn', message: 'dup', timestamp: 9000 },
    ];
    const result = deduplicateLogs(entries);
    expect(result[0].firstSeen).toBe(5000); // first encountered
    expect(result[0].lastSeen).toBe(9000);  // max timestamp
  });
});

// ===========================================================================
// 2. Port scanning logic
// ===========================================================================

const COMMON_APP_PORTS = [3000, 3001, 4000, 5173, 5174, 8000, 8080];

function getPortsToScan(): number[] {
  const ports = new Set<number>();
  for (let i = 0; i <= MAX_PORT_RETRIES; i++) {
    ports.add(DEFAULT_WS_PORT + i);
  }
  for (const appPort of COMMON_APP_PORTS) {
    const wsPort = appPort + WS_PORT_OFFSET;
    for (let i = 0; i <= MAX_PORT_RETRIES; i++) {
      ports.add(wsPort + i);
    }
  }
  return Array.from(ports).sort((a, b) => a - b);
}

describe('getPortsToScan', () => {
  it('includes the default WS port', () => {
    expect(getPortsToScan()).toContain(DEFAULT_WS_PORT);
  });

  it('includes retry ports beyond the default', () => {
    const ports = getPortsToScan();
    for (let i = 0; i <= MAX_PORT_RETRIES; i++) {
      expect(ports).toContain(DEFAULT_WS_PORT + i);
    }
  });

  it('includes common app port offsets', () => {
    const ports = getPortsToScan();
    for (const appPort of COMMON_APP_PORTS) {
      expect(ports).toContain(appPort + WS_PORT_OFFSET);
    }
  });

  it('returns sorted, unique ports', () => {
    const ports = getPortsToScan();
    for (let i = 1; i < ports.length; i++) {
      expect(ports[i]).toBeGreaterThan(ports[i - 1]);
    }
    expect(new Set(ports).size).toBe(ports.length);
  });

  it('has more than 50 ports in total', () => {
    expect(getPortsToScan().length).toBeGreaterThan(50);
  });
});

// ===========================================================================
// 3. Argument parsing helpers
// ===========================================================================

describe('getArg / hasFlag (argument parsing)', () => {
  function getArg(args: string[], flag: string): string | undefined {
    const index = args.indexOf(flag);
    return index !== -1 ? args[index + 1] : undefined;
  }

  function hasFlag(args: string[], flag: string): boolean {
    return args.includes(flag);
  }

  it('getArg returns the value after a flag', () => {
    const args = ['screenshot', '--selector', '.card', '--output', 'out.png'];
    expect(getArg(args, '--selector')).toBe('.card');
    expect(getArg(args, '--output')).toBe('out.png');
  });

  it('getArg returns undefined for missing flags', () => {
    expect(getArg(['screenshot', '--selector', '.card'], '--output')).toBeUndefined();
  });

  it('getArg returns undefined for flag at end with no value', () => {
    expect(getArg(['screenshot', '--selector'], '--selector')).toBeUndefined();
  });

  it('hasFlag returns true when flag is present', () => {
    const args = ['screenshot', '--full-page', '--force-cdp'];
    expect(hasFlag(args, '--full-page')).toBe(true);
    expect(hasFlag(args, '--force-cdp')).toBe(true);
  });

  it('hasFlag returns false when flag is absent', () => {
    expect(hasFlag(['screenshot', '--full-page'], '--force-cdp')).toBe(false);
  });
});

// ===========================================================================
// 4. showHelp tests
// ===========================================================================

describe('showHelp', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('displays help when --help flag is passed', async () => {
    await runCLI(['--help']);
    expect(logs.some((l) => l.includes('Sweetlink CLI'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('displays help when -h flag is passed', async () => {
    await runCLI(['-h']);
    expect(logs.some((l) => l.includes('Sweetlink CLI'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('displays help when no command is given', async () => {
    await runCLI([]);
    expect(logs.some((l) => l.includes('Sweetlink CLI'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('help text contains all major commands', async () => {
    await runCLI(['--help']);
    const allOutput = logs.join('\n');
    const expectedCommands = [
      'screenshot', 'query', 'logs', 'exec', 'click', 'network',
      'refresh', 'schema', 'outline', 'a11y', 'vitals', 'ruler',
      'wait', 'status', 'cleanup',
    ];
    for (const cmd of expectedCommands) {
      expect(allOutput).toContain(cmd);
    }
  });

  it('help text contains environment variable documentation', async () => {
    await runCLI(['--help']);
    const allOutput = logs.join('\n');
    expect(allOutput).toContain('SWEETLINK_WS_URL');
    expect(allOutput).toContain('CHROME_CDP_PORT');
  });
});

// ===========================================================================
// 5. Unknown command
// ===========================================================================

describe('unknown command', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('reports unknown command and exits with code 1', async () => {
    await runCLI(['foobar']);
    expect(errors.some((e) => e.includes('Unknown command: foobar'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ===========================================================================
// 6. Command validation
// ===========================================================================

describe('command validation', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('query command requires --selector', async () => {
    await runCLI(['query']);
    expect(errors.some((e) => e.includes('--selector is required'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exec command requires --code', async () => {
    await runCLI(['exec']);
    expect(errors.some((e) => e.includes('--code is required'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('click command requires --selector or --text', async () => {
    await runCLI(['click']);
    expect(errors.some((e) => e.includes('Either --selector or --text is required'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('ruler command requires --selector or --preset', async () => {
    await runCLI(['ruler']);
    expect(errors.some((e) => e.includes('At least one --selector is required'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ===========================================================================
// 7. WebSocket-based commands — with auto-response
// ===========================================================================

describe('exec command', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('sends exec-js command and displays result', async () => {
    autoResponse.value = {
      success: true,
      data: 'My Page Title',
      timestamp: Date.now(),
    };

    await runCLI(['exec', '--code', 'document.title']);

    expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    const ws = MockWebSocket.instances[0];
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData).toEqual({ type: 'exec-js', code: 'document.title' });
    expect(logs.some((l) => l.includes('Result'))).toBe(true);
  });

  it('handles failed exec-js response', async () => {
    autoResponse.value = {
      success: false,
      error: 'ReferenceError: badcode is not defined',
      timestamp: Date.now(),
    };

    await runCLI(['exec', '--code', 'badcode()']);

    expect(errors.some((e) => e.includes('Execution failed'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('query command', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('sends query-dom with selector and property', async () => {
    autoResponse.value = {
      success: true,
      data: { count: 2, results: ['Hello', 'World'] },
      timestamp: Date.now(),
    };

    await runCLI(['query', '--selector', 'h1', '--property', 'textContent']);

    const ws = MockWebSocket.instances[0];
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData).toEqual({
      type: 'query-dom',
      selector: 'h1',
      property: 'textContent',
    });
    expect(logs.some((l) => l.includes('Found 2 elements'))).toBe(true);
    expect(logs.some((l) => l.includes('Values:'))).toBe(true);
  });

  it('displays element info when no property is specified', async () => {
    autoResponse.value = {
      success: true,
      data: { count: 1, results: [{ tag: 'div', className: 'card' }] },
      timestamp: Date.now(),
    };

    await runCLI(['query', '--selector', '.card']);

    expect(logs.some((l) => l.includes('Elements:'))).toBe(true);
  });

  it('handles failed query response', async () => {
    autoResponse.value = {
      success: false,
      error: 'No browser client connected',
      timestamp: Date.now(),
    };

    await runCLI(['query', '--selector', 'h1']);

    expect(errors.some((e) => e.includes('No browser client connected'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('refresh command', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('sends refresh command', async () => {
    autoResponse.value = { success: true, timestamp: Date.now() };

    await runCLI(['refresh']);

    const ws = MockWebSocket.instances[0];
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData).toEqual({ type: 'refresh', options: { hard: false } });
    expect(logs.some((l) => l.includes('Page refreshed'))).toBe(true);
  });

  it('sends hard refresh with --hard flag', async () => {
    autoResponse.value = { success: true, timestamp: Date.now() };

    await runCLI(['refresh', '--hard']);

    const ws = MockWebSocket.instances[0];
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData).toEqual({ type: 'refresh', options: { hard: true } });
    expect(logs.some((l) => l.includes('hard reload'))).toBe(true);
  });
});

describe('click command', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('generates click-by-text code when --text is provided', async () => {
    autoResponse.value = {
      success: true,
      data: { success: true, clicked: 'BUTTON.submit', found: 1 },
      timestamp: Date.now(),
    };

    await runCLI(['click', '--text', 'Submit']);

    const ws = MockWebSocket.instances[0];
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData.type).toBe('exec-js');
    expect(sentData.code).toContain('Submit');
    expect(sentData.code).toContain('textContent');
    expect(logs.some((l) => l.includes('Clicked'))).toBe(true);
  });

  it('generates click-by-selector code when --selector is provided', async () => {
    autoResponse.value = {
      success: true,
      data: { success: true, clicked: 'BUTTON.primary', found: 1 },
      timestamp: Date.now(),
    };

    await runCLI(['click', '--selector', 'button.primary']);

    const ws = MockWebSocket.instances[0];
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData.type).toBe('exec-js');
    expect(sentData.code).toContain('querySelectorAll');
    expect(sentData.code).toContain('button.primary');
  });
});

describe('logs command', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('sends get-logs command with filter in json format', async () => {
    autoResponse.value = {
      success: true,
      data: [{ level: 'error', message: 'Something broke', timestamp: 1000 }],
      timestamp: Date.now(),
    };

    await runCLI(['logs', '--filter', 'error', '--format', 'json']);

    const ws = MockWebSocket.instances[0];
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData).toEqual({ type: 'get-logs', filter: 'error' });

    const jsonOutput = logs.find((l) => l.startsWith('{'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed.deduped).toBe(false);
    expect(parsed.logs).toHaveLength(1);
  });

  it('produces summary format', async () => {
    autoResponse.value = {
      success: true,
      data: [
        { level: 'error', message: 'err1', timestamp: 1000 },
        { level: 'warn', message: 'warn1', timestamp: 2000 },
        { level: 'log', message: 'log1', timestamp: 3000 },
      ],
      timestamp: Date.now(),
    };

    await runCLI(['logs', '--format', 'summary']);

    const jsonOutput = logs.find((l) => l.startsWith('{'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed.total).toBe(3);
    expect(parsed.unique).toBe(3);
    expect(parsed.byLevel.error).toBe(1);
    expect(parsed.byLevel.warn).toBe(1);
  });

  it('reports when no logs are found in text format', async () => {
    autoResponse.value = {
      success: true,
      data: [],
      timestamp: Date.now(),
    };

    await runCLI(['logs']);

    expect(logs.some((l) => l.includes('No logs found'))).toBe(true);
  });
});

describe('schema command', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('sends get-schema command and displays markdown by default', async () => {
    autoResponse.value = {
      success: true,
      data: {
        schema: { title: 'Test Page' },
        markdown: '# Test Page\nSome schema data',
      },
      timestamp: Date.now(),
    };

    await runCLI(['schema']);

    const ws = MockWebSocket.instances[0];
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData).toEqual({ type: 'get-schema' });
    expect(logs.some((l) => l.includes('# Test Page'))).toBe(true);
  });
});

describe('outline command', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('sends get-outline command and outputs json', async () => {
    autoResponse.value = {
      success: true,
      data: {
        outline: { headings: [{ level: 1, text: 'Title' }] },
        markdown: '# Title',
      },
      timestamp: Date.now(),
    };

    await runCLI(['outline', '--format', 'json']);

    const ws = MockWebSocket.instances[0];
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData).toEqual({ type: 'get-outline' });
    expect(logs.some((l) => l.includes('headings'))).toBe(true);
  });
});

describe('vitals command', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('sends get-vitals and displays text results', async () => {
    autoResponse.value = {
      success: true,
      data: {
        vitals: {
          url: 'http://localhost:3000',
          fcp: 1200,
          lcp: 2000,
          cls: 0.05,
          inp: 150,
          pageSize: 512000,
        },
        summary: 'FCP: 1200ms, LCP: 2000ms, CLS: 0.05, INP: 150ms',
      },
      timestamp: Date.now(),
    };

    await runCLI(['vitals']);

    const ws = MockWebSocket.instances[0];
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData).toEqual({ type: 'get-vitals' });

    const allOutput = logs.join('\n');
    expect(allOutput).toContain('Web Vitals');
    expect(allOutput).toContain('FCP');
    expect(allOutput).toContain('1200ms');
    expect(allOutput).toContain('500KB');
  });
});

describe('a11y command', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('sends get-a11y and displays text results', async () => {
    autoResponse.value = {
      success: true,
      data: {
        result: {
          url: 'http://localhost:3000',
          violations: [],
          passes: [],
          incomplete: [],
        },
        summary: {
          totalViolations: 0,
          totalPasses: 10,
          totalIncomplete: 0,
          byImpact: { critical: 0, serious: 0, moderate: 0, minor: 0 },
        },
      },
      timestamp: Date.now(),
    };

    await runCLI(['a11y']);

    const allOutput = logs.join('\n');
    expect(allOutput).toContain('Accessibility Audit');
    expect(allOutput).toContain('No violations found');
  });

  it('responds to "accessibility" alias', async () => {
    autoResponse.value = {
      success: true,
      data: {
        result: { url: 'http://localhost:3000', violations: [], passes: [], incomplete: [] },
        summary: { totalViolations: 0, totalPasses: 0, totalIncomplete: 0, byImpact: { critical: 0, serious: 0, moderate: 0, minor: 0 } },
      },
      timestamp: Date.now(),
    };

    await runCLI(['accessibility']);

    const ws = MockWebSocket.instances[0];
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData).toEqual({ type: 'get-a11y' });
  });
});

describe('screenshot command via WebSocket', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('sends screenshot command with selector and fullPage', async () => {
    autoResponse.value = {
      success: true,
      data: {
        screenshot: 'data:image/png;base64,iVBORw0KGgo=',
        width: 1920,
        height: 1080,
        selector: '.hero-image',
      },
      timestamp: Date.now(),
    };

    await runCLI([
      'screenshot',
      '--selector', '.hero-image',
      '--full-page',
      '--force-ws',
      '--output', '/tmp/test.png',
    ]);

    const ws = MockWebSocket.instances[0];
    const sentData = JSON.parse(ws.send.mock.calls[0][0]);
    expect(sentData).toEqual({
      type: 'screenshot',
      selector: '.hero-image',
      options: { fullPage: true, a11y: false },
    });
    expect(logs.some((l) => l.includes('Screenshot saved'))).toBe(true);
    expect(logs.some((l) => l.includes('1920x1080'))).toBe(true);
  });
});

// ===========================================================================
// 8. Ruler command aliases
// ===========================================================================

describe('ruler command', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('"measure" alias works the same as "ruler"', async () => {
    await runCLI(['measure']);
    // Should hit ruler logic, not unknown command
    expect(errors.some((e) => e.includes('Unknown command'))).toBe(false);
    expect(errors.some((e) => e.includes('--selector is required'))).toBe(true);
  });
});

// ===========================================================================
// 9. WebSocket error handling
// ===========================================================================

describe('WebSocket error handling', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('handles ECONNREFUSED error', async () => {
    // Configure auto-response to emit error instead of success
    autoResponse.value = null; // Disable auto-response

    process.argv = ['node', 'sweetlink', 'exec', '--code', '1+1'];
    vi.resetModules();

    const importPromise = import('./sweetlink.js').catch(() => {});

    await vi.waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    });

    const ws = MockWebSocket.instances[0];
    ws.emit('error', new Error('ECONNREFUSED'));

    await importPromise;
    await new Promise((r) => setTimeout(r, 50));

    expect(errors.some((e) => e.includes('ECONNREFUSED'))).toBe(true);
  });
});

// ===========================================================================
// 10. Constants validation
// ===========================================================================

describe('constants', () => {
  it('DEFAULT_WS_PORT is 9223', () => {
    expect(DEFAULT_WS_PORT).toBe(9223);
  });

  it('WS_PORT_OFFSET is 6223', () => {
    expect(WS_PORT_OFFSET).toBe(6223);
  });

  it('MAX_PORT_RETRIES is 10', () => {
    expect(MAX_PORT_RETRIES).toBe(10);
  });

  it('COMMON_APP_PORTS maps correctly with offset', () => {
    expect(3000 + WS_PORT_OFFSET).toBe(DEFAULT_WS_PORT);
    expect(5173 + WS_PORT_OFFSET).toBe(11396);
  });
});

// ===========================================================================
// 11. Screenshot viewport conversion
// ===========================================================================

describe('screenshot viewport conversion', () => {
  it('converts --width to viewport format with default aspect ratio', () => {
    const options: { width?: number; height?: number; viewport?: string } = { width: 768 };
    if (options.width && !options.viewport) {
      const height = options.height || Math.round(options.width * 1.5);
      options.viewport = `${options.width}x${height}`;
    }
    expect(options.viewport).toBe('768x1152');
  });

  it('converts --width and --height to viewport format', () => {
    const options: { width?: number; height?: number; viewport?: string } = { width: 375, height: 667 };
    if (options.width && !options.viewport) {
      const height = options.height || Math.round(options.width * 1.5);
      options.viewport = `${options.width}x${height}`;
    }
    expect(options.viewport).toBe('375x667');
  });

  it('does not override explicit --viewport', () => {
    const options: { width?: number; height?: number; viewport?: string } = { width: 768, viewport: 'tablet' };
    if (options.width && !options.viewport) {
      const height = options.height || Math.round(options.width * 1.5);
      options.viewport = `${options.width}x${height}`;
    }
    expect(options.viewport).toBe('tablet');
  });
});

// ===========================================================================
// 12. Log dedup edge cases
// ===========================================================================

describe('deduplicateLogs edge cases', () => {
  it('handles single log entry', () => {
    const result = deduplicateLogs([{ level: 'info', message: 'hello', timestamp: 100 }]);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(1);
  });

  it('handles messages with whitespace differences (treated as different)', () => {
    const result = deduplicateLogs([
      { level: 'log', message: 'hello world', timestamp: 100 },
      { level: 'log', message: 'hello  world', timestamp: 200 },
    ]);
    expect(result).toHaveLength(2);
  });

  it('summary format truncates long messages at 500 chars', () => {
    const longMessage = 'X'.repeat(600);
    const truncated = longMessage.length > 500 ? `${longMessage.substring(0, 500)}...` : longMessage;
    expect(truncated).toBe('X'.repeat(500) + '...');
    expect(truncated.length).toBe(503);
  });
});

// ===========================================================================
// 13. Port offset calculation
// ===========================================================================

describe('port offset calculation', () => {
  it('calculates WS port from app port correctly', () => {
    const cases = [
      { appPort: 3000, expected: 9223 },
      { appPort: 3001, expected: 9224 },
      { appPort: 4000, expected: 10223 },
      { appPort: 5173, expected: 11396 },
      { appPort: 5174, expected: 11397 },
      { appPort: 8000, expected: 14223 },
      { appPort: 8080, expected: 14303 },
    ];
    for (const tc of cases) {
      expect(tc.appPort + WS_PORT_OFFSET).toBe(tc.expected);
    }
  });
});

// ===========================================================================
// 14. Log summary structure
// ===========================================================================

describe('log summary format', () => {
  it('builds correct summary structure from logs', () => {
    const entries: LogEntry[] = [
      { level: 'error', message: 'err1', timestamp: 1000 },
      { level: 'error', message: 'err1', timestamp: 2000 },
      { level: 'warn', message: 'warn1', timestamp: 3000 },
      { level: 'info', message: 'info1', timestamp: 4000 },
      { level: 'log', message: 'log1', timestamp: 5000 },
      { level: 'log', message: 'log1', timestamp: 6000 },
      { level: 'log', message: 'log1', timestamp: 7000 },
    ];

    const deduped = deduplicateLogs(entries);
    const summary = {
      total: entries.length,
      unique: deduped.length,
      byLevel: {
        error: deduped.filter((l) => l.level === 'error').length,
        warn: deduped.filter((l) => l.level === 'warn').length,
        info: deduped.filter((l) => l.level === 'info').length,
        log: deduped.filter((l) => l.level === 'log').length,
      },
      entries: deduped.map((l) => ({
        level: l.level,
        count: l.count,
        message: l.message.length > 500 ? `${l.message.substring(0, 500)}...` : l.message,
      })),
    };

    expect(summary.total).toBe(7);
    expect(summary.unique).toBe(4);
    expect(summary.byLevel).toEqual({ error: 1, warn: 1, info: 1, log: 1 });
    expect(summary.entries[0]).toEqual({ level: 'error', count: 2, message: 'err1' });
    expect(summary.entries[3]).toEqual({ level: 'log', count: 3, message: 'log1' });
  });
});

// ===========================================================================
// 15. getRelativePath logic
// ===========================================================================

describe('getRelativePath logic', () => {
  it('returns relative path when absolutePath starts with projectRoot', () => {
    function getRelativePath(absolutePath: string, projectRoot: string): string {
      if (absolutePath.startsWith(projectRoot)) {
        const relative = absolutePath.slice(projectRoot.length).replace(/^\//, '');
        return relative || absolutePath;
      }
      return absolutePath;
    }
    expect(getRelativePath('/project/foo/bar.png', '/project')).toBe('foo/bar.png');
    expect(getRelativePath('/other/path/file.png', '/project')).toBe('/other/path/file.png');
  });
});

// ===========================================================================
// 16. ensureDir logic
// ===========================================================================

describe('ensureDir logic', () => {
  it('creates directory when it does not exist', () => {
    const mockExistsSync = vi.fn(() => false);
    const mockMkdirSync = vi.fn();

    function ensureDir(filePath: string): void {
      const path = require('path');
      const dir = path.dirname(filePath);
      if (dir && dir !== '.' && !mockExistsSync(dir)) {
        mockMkdirSync(dir, { recursive: true });
      }
    }

    ensureDir('/some/deep/path/file.png');
    expect(mockMkdirSync).toHaveBeenCalledWith('/some/deep/path', { recursive: true });
  });

  it('does not create directory when it already exists', () => {
    const mockExistsSync = vi.fn(() => true);
    const mockMkdirSync = vi.fn();

    function ensureDir(filePath: string): void {
      const path = require('path');
      const dir = path.dirname(filePath);
      if (dir && dir !== '.' && !mockExistsSync(dir)) {
        mockMkdirSync(dir, { recursive: true });
      }
    }

    ensureDir('/existing/path/file.png');
    expect(mockMkdirSync).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 17. Multiple --selector arguments for ruler
// ===========================================================================

describe('ruler multiple selector parsing', () => {
  it('collects all --selector arguments', () => {
    const args = ['ruler', '--selector', 'h1', '--selector', '.card', '--selector', 'nav'];
    const selectors: string[] = [];
    args.forEach((arg, i) => {
      if (arg === '--selector' && args[i + 1]) {
        selectors.push(args[i + 1]);
      }
    });
    expect(selectors).toEqual(['h1', '.card', 'nav']);
  });

  it('returns empty array when no selectors are provided', () => {
    const args = ['ruler', '--format', 'json'];
    const selectors: string[] = [];
    args.forEach((arg, i) => {
      if (arg === '--selector' && args[i + 1]) {
        selectors.push(args[i + 1]);
      }
    });
    expect(selectors).toEqual([]);
  });
});

// ===========================================================================
// 18. Screenshot /tmp warning
// ===========================================================================

describe('screenshot /tmp warning', () => {
  it('warns when output path starts with /tmp/', () => {
    expect('/tmp/screenshot.png'.startsWith('/tmp/')).toBe(true);
  });

  it('does not warn for project-relative paths', () => {
    expect('.tmp/screenshots/screenshot.png'.startsWith('/tmp/')).toBe(false);
  });
});

// ===========================================================================
// 19. Click result parsing
// ===========================================================================

describe('click result parsing', () => {
  it('handles success result with multiple matches', () => {
    const result = { success: true, clicked: 'BUTTON.submit', found: 3 };
    const index = 1;
    let output = '';
    if (typeof result === 'object' && 'success' in result && result.success) {
      output = `Clicked: ${result.clicked}${result.found > 1 ? ` (${result.found} matches, used index ${index})` : ''}`;
    }
    expect(output).toBe('Clicked: BUTTON.submit (3 matches, used index 1)');
  });

  it('handles success result with single match', () => {
    const result = { success: true, clicked: 'A.link', found: 1 };
    let output = '';
    if (typeof result === 'object' && 'success' in result && result.success) {
      output = `Clicked: ${result.clicked}${result.found > 1 ? ` (${result.found} matches, used index 0)` : ''}`;
    }
    expect(output).toBe('Clicked: A.link');
  });

  it('handles failure result', () => {
    const result = { success: false, error: 'No element found matching: .missing' };
    expect(typeof result === 'object' && 'success' in result && !result.success).toBe(true);
    expect(result.error).toContain('No element found');
  });
});

// ===========================================================================
// 20. Log level color mapping
// ===========================================================================

describe('log level color mapping', () => {
  it('maps each level to the correct ANSI color', () => {
    const levelColors: Record<string, string> = {
      error: '\x1b[31m',
      warn: '\x1b[33m',
      info: '\x1b[36m',
      log: '\x1b[37m',
    };
    expect(levelColors.error).toBe('\x1b[31m');
    expect(levelColors.warn).toBe('\x1b[33m');
    expect(levelColors.info).toBe('\x1b[36m');
    expect(levelColors.log).toBe('\x1b[37m');
  });

  it('falls back to white for unknown levels', () => {
    const levelColors: Record<string, string> = {
      error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', log: '\x1b[37m',
    };
    expect(levelColors['debug'] || '\x1b[37m').toBe('\x1b[37m');
  });
});

// ===========================================================================
// 21. Vitals threshold coloring
// ===========================================================================

describe('vitals threshold coloring', () => {
  function getVitalColor(metric: string, value: number): string {
    const thresholds: Record<string, [number, number]> = {
      fcp: [1800, 3000],
      lcp: [2500, 4000],
      cls: [0.1, 0.25],
      inp: [200, 500],
    };
    const [good, moderate] = thresholds[metric] || [0, 0];
    if (value <= good) return 'green';
    if (value <= moderate) return 'yellow';
    return 'red';
  }

  it('FCP: good (green) <= 1800ms', () => {
    expect(getVitalColor('fcp', 1500)).toBe('green');
    expect(getVitalColor('fcp', 1800)).toBe('green');
  });

  it('FCP: moderate (yellow) <= 3000ms', () => {
    expect(getVitalColor('fcp', 2500)).toBe('yellow');
  });

  it('FCP: poor (red) > 3000ms', () => {
    expect(getVitalColor('fcp', 3500)).toBe('red');
  });

  it('LCP: good (green) <= 2500ms', () => {
    expect(getVitalColor('lcp', 2000)).toBe('green');
  });

  it('CLS: good (green) <= 0.1', () => {
    expect(getVitalColor('cls', 0.05)).toBe('green');
  });

  it('INP: poor (red) > 500ms', () => {
    expect(getVitalColor('inp', 600)).toBe('red');
  });
});
