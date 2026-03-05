// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsonEnvelope } from './outputSchemas.js';
import { emitJson, printOutputSchema, SCHEMAS } from './outputSchemas.js';

describe('outputSchemas', () => {
  // =========================================================================
  // SCHEMAS registry
  // =========================================================================

  describe('SCHEMAS registry', () => {
    const EXPECTED_COMMANDS = [
      'screenshot',
      'query',
      'logs',
      'exec',
      'click',
      'refresh',
      'ruler',
      'network',
      'schema',
      'outline',
      'a11y',
      'vitals',
      'cleanup',
      'wait',
      'status',
    ];

    it('has an entry for every known command', () => {
      for (const cmd of EXPECTED_COMMANDS) {
        expect(SCHEMAS).toHaveProperty(cmd);
        expect(typeof SCHEMAS[cmd]).toBe('string');
        expect(SCHEMAS[cmd].length).toBeGreaterThan(0);
      }
    });

    it('has no extra entries beyond known commands', () => {
      const schemaKeys = Object.keys(SCHEMAS).sort();
      expect(schemaKeys).toEqual([...EXPECTED_COMMANDS].sort());
    });

    it('each schema contains "interface" keyword', () => {
      for (const [_name, schema] of Object.entries(SCHEMAS)) {
        expect(schema).toContain('interface');
      }
    });
  });

  // =========================================================================
  // emitJson
  // =========================================================================

  describe('emitJson', () => {
    let writeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      writeSpy.mockRestore();
    });

    it('writes valid JSON to stdout', () => {
      const envelope: JsonEnvelope = {
        ok: true,
        command: 'screenshot',
        data: { path: 'test.png', width: 800, height: 600, method: 'Playwright' },
        duration: 123,
      };

      emitJson(envelope);

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const output = writeSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.ok).toBe(true);
      expect(parsed.command).toBe('screenshot');
      expect(parsed.data.path).toBe('test.png');
      expect(parsed.duration).toBe(123);
    });

    it('includes error field when present', () => {
      const envelope: JsonEnvelope = {
        ok: false,
        command: 'exec',
        data: null,
        error: 'Something went wrong',
        duration: 50,
      };

      emitJson(envelope);

      const output = writeSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toBe('Something went wrong');
      expect(parsed.data).toBeNull();
    });

    it('output ends with newline', () => {
      emitJson({ ok: true, command: 'test', data: {}, duration: 0 });

      const output = writeSpy.mock.calls[0][0] as string;
      expect(output.endsWith('\n')).toBe(true);
    });

    it('envelope has required fields', () => {
      emitJson({ ok: true, command: 'logs', data: { total: 5 }, duration: 42 });

      const output = writeSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('ok');
      expect(parsed).toHaveProperty('command');
      expect(parsed).toHaveProperty('data');
      expect(parsed).toHaveProperty('duration');
    });
  });

  // =========================================================================
  // printOutputSchema
  // =========================================================================

  describe('printOutputSchema', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    });

    afterEach(() => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('prints all schemas when no command specified', () => {
      printOutputSchema();

      const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
      // Should contain the envelope
      expect(allOutput).toContain('JsonEnvelope');
      // Should contain at least a few command schemas
      expect(allOutput).toContain('ScreenshotData');
      expect(allOutput).toContain('LogsData');
      expect(allOutput).toContain('ExecData');
    });

    it('prints just the command schema when command specified', () => {
      printOutputSchema('screenshot');

      const allOutput = logSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(allOutput).toContain('ScreenshotData');
      // Should NOT contain other command schemas
      expect(allOutput).not.toContain('LogsData');
      expect(allOutput).not.toContain('ExecData');
    });

    it('exits with error for unknown command', () => {
      printOutputSchema('nonexistent');

      expect(errorSpy).toHaveBeenCalled();
      const errorMsg = errorSpy.mock.calls[0][0] as string;
      expect(errorMsg).toContain('Unknown command');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('prints schema for each known command individually', () => {
      for (const cmd of Object.keys(SCHEMAS)) {
        logSpy.mockClear();
        printOutputSchema(cmd);
        expect(logSpy).toHaveBeenCalled();
      }
    });
  });
});
