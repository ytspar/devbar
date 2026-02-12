// @vitest-environment node

/**
 * Sweetlink Development Server CLI Tests
 *
 * Tests the sweetlink-dev.ts CLI entry point which reads environment
 * variables, loads dotenv config, and starts the Sweetlink server.
 * All server I/O is mocked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks - hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const mockInitSweetlink = vi.fn();
const mockCloseSweetlink = vi.fn();
const mockDotenvConfig = vi.fn();

vi.mock('dotenv', () => ({
  config: mockDotenvConfig,
}));

vi.mock('../server.js', () => ({
  initSweetlink: mockInitSweetlink,
  closeSweetlink: mockCloseSweetlink,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Store original env values so we can restore them */
let originalEnv: Record<string, string | undefined>;

/** Track registered signal handlers so we can invoke them in tests */
let signalHandlers: Record<string, (() => void)[]>;

function captureSignalHandlers() {
  signalHandlers = { SIGTERM: [], SIGINT: [] };
  vi.spyOn(process, 'on').mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'SIGTERM' || event === 'SIGINT') {
      signalHandlers[event].push(handler as () => void);
    }
    return process;
  });
}

/**
 * Dynamically import the module fresh (bypassing module cache).
 * We use vi.importActual is not needed since the module is side-effecting;
 * instead we use a unique timestamp query parameter.
 */
async function loadModule() {
  // Reset module registry to get a fresh execution
  vi.resetModules();

  // Re-register the mocks after resetModules
  vi.doMock('dotenv', () => ({
    config: mockDotenvConfig,
  }));
  vi.doMock('../server.js', () => ({
    initSweetlink: mockInitSweetlink,
    closeSweetlink: mockCloseSweetlink,
  }));

  captureSignalHandlers();

  // Suppress console.log during module load
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  await import('./sweetlink-dev.js');

  consoleSpy.mockRestore();
  return consoleSpy;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sweetlink-dev CLI', () => {
  beforeEach(() => {
    originalEnv = {
      SWEETLINK_WS_PORT: process.env.SWEETLINK_WS_PORT,
      PORT: process.env.PORT,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment variables
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.restoreAllMocks();
  });

  it('loads dotenv config from the current working directory', async () => {
    delete process.env.SWEETLINK_WS_PORT;
    delete process.env.PORT;
    await loadModule();

    expect(mockDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining('.env'),
      }),
    );
  });

  it('uses default port 9223 when SWEETLINK_WS_PORT is not set', async () => {
    delete process.env.SWEETLINK_WS_PORT;
    delete process.env.PORT;
    await loadModule();

    expect(mockInitSweetlink).toHaveBeenCalledWith(
      expect.objectContaining({ port: 9223 }),
    );
  });

  it('uses SWEETLINK_WS_PORT when set', async () => {
    process.env.SWEETLINK_WS_PORT = '9500';
    delete process.env.PORT;
    await loadModule();

    expect(mockInitSweetlink).toHaveBeenCalledWith(
      expect.objectContaining({ port: 9500 }),
    );
  });

  it('passes appPort from PORT environment variable', async () => {
    delete process.env.SWEETLINK_WS_PORT;
    process.env.PORT = '3000';
    await loadModule();

    expect(mockInitSweetlink).toHaveBeenCalledWith(
      expect.objectContaining({ port: 9223, appPort: 3000 }),
    );
  });

  it('passes undefined appPort when PORT is not set', async () => {
    delete process.env.SWEETLINK_WS_PORT;
    delete process.env.PORT;
    await loadModule();

    expect(mockInitSweetlink).toHaveBeenCalledWith(
      expect.objectContaining({ appPort: undefined }),
    );
  });

  it('logs startup messages to console', async () => {
    delete process.env.SWEETLINK_WS_PORT;
    delete process.env.PORT;

    vi.resetModules();
    vi.doMock('dotenv', () => ({ config: mockDotenvConfig }));
    vi.doMock('../server.js', () => ({
      initSweetlink: mockInitSweetlink,
      closeSweetlink: mockCloseSweetlink,
    }));
    captureSignalHandlers();

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await import('./sweetlink-dev.js');

    const messages = consoleSpy.mock.calls.map((call) => call[0]);
    expect(messages.some((m: string) => m.includes('Starting development server'))).toBe(true);
    expect(messages.some((m: string) => m.includes('Project directory'))).toBe(true);
    expect(messages.some((m: string) => m.includes('Press Ctrl+C to stop'))).toBe(true);

    consoleSpy.mockRestore();
  });

  it('registers SIGTERM handler that calls closeSweetlink', async () => {
    delete process.env.SWEETLINK_WS_PORT;
    delete process.env.PORT;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await loadModule();

    expect(signalHandlers.SIGTERM.length).toBeGreaterThan(0);

    // Invoke the SIGTERM handler
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    signalHandlers.SIGTERM[0]();

    expect(mockCloseSweetlink).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('registers SIGINT handler that calls closeSweetlink', async () => {
    delete process.env.SWEETLINK_WS_PORT;
    delete process.env.PORT;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await loadModule();

    expect(signalHandlers.SIGINT.length).toBeGreaterThan(0);

    // Invoke the SIGINT handler
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    signalHandlers.SIGINT[0]();

    expect(mockCloseSweetlink).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('parses SWEETLINK_WS_PORT as an integer', async () => {
    process.env.SWEETLINK_WS_PORT = '9300';
    delete process.env.PORT;
    await loadModule();

    const call = mockInitSweetlink.mock.calls[0][0];
    expect(typeof call.port).toBe('number');
    expect(call.port).toBe(9300);
  });

  it('parses PORT as an integer', async () => {
    delete process.env.SWEETLINK_WS_PORT;
    process.env.PORT = '5173';
    await loadModule();

    const call = mockInitSweetlink.mock.calls[0][0];
    expect(typeof call.appPort).toBe('number');
    expect(call.appPort).toBe(5173);
  });
});
