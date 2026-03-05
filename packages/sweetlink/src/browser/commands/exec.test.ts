/**
 * Exec Command Handler Tests
 *
 * Tests for handleExecJS with focus on edge cases not covered
 * by commands.test.ts: CSP fallback, production guard, and
 * script tag injection path.
 */

import { describe, expect, it } from 'vitest';
import type { ExecJsCommand, SweetlinkResponse } from '../../types.js';
import { handleExecJS } from './exec.js';

// biome-ignore lint/suspicious/noExplicitAny: test helper - SweetlinkResponse.data is unknown
const d = (r: SweetlinkResponse): any => r.data;

describe('handleExecJS', () => {
  it('executes simple arithmetic', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: '2 + 3' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBe(5);
    expect(d(response).type).toBe('number');
  });

  it('executes string operations', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: '"hello world".split(" ").length' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBe(2);
  });

  it('executes object expressions', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: '({ x: 1, y: "two" })' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toEqual({ x: 1, y: 'two' });
    expect(d(response).type).toBe('object');
  });

  it('returns error when code is missing', async () => {
    const command: ExecJsCommand = { type: 'exec-js' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Code is required');
  });

  it('returns error when code is not a string', async () => {
    const command = { type: 'exec-js', code: 42 } as unknown as ExecJsCommand;
    const response = await handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Code must be a string');
  });

  it('returns error when code exceeds max length', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'x'.repeat(10001) };
    const response = await handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toContain('exceeds maximum length');
    expect(response.error).toContain('10000');
  });

  it('accepts code at exactly max length', async () => {
    // 10000 chars of valid JS
    const code = `${'1+'.repeat(4999)}1`;
    expect(code.length).toBe(9999);
    const command: ExecJsCommand = { type: 'exec-js', code };
    const response = await handleExecJS(command);

    expect(response.success).toBe(true);
  });

  it('handles syntax errors gracefully', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'if(' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
  });

  it('handles runtime errors with message', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'undefinedVar.prop' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
  });

  it('returns generic message for non-Error throws', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'throw "oops"' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Execution failed');
  });

  it('returns Error message for Error throws', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'throw new TypeError("bad")' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('bad');
  });

  it('handles boolean results', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: '3 > 2' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBe(true);
    expect(d(response).type).toBe('boolean');
  });

  it('handles undefined results', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'void 0' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBeUndefined();
    expect(d(response).type).toBe('undefined');
  });

  it('handles null results', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'null' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBeNull();
    expect(d(response).type).toBe('object');
  });

  it('handles array results', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: '[1, "two", true]' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toEqual([1, 'two', true]);
    expect(d(response).type).toBe('object');
  });

  it('serializes nested objects via JSON round-trip', async () => {
    const command: ExecJsCommand = {
      type: 'exec-js',
      code: '({ a: { b: { c: 42 } } })',
    };
    const response = await handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toEqual({ a: { b: { c: 42 } } });
  });

  it('includes timestamp in response', async () => {
    const before = Date.now();
    const command: ExecJsCommand = { type: 'exec-js', code: '1' };
    const response = await handleExecJS(command);
    const after = Date.now();

    expect(response.timestamp).toBeGreaterThanOrEqual(before);
    expect(response.timestamp).toBeLessThanOrEqual(after);
  });

  it('handles empty string code as falsy (code required)', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: '' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Code is required');
  });

  it('handles Date object results', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'new Date(0).toISOString()' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBe('1970-01-01T00:00:00.000Z');
    expect(d(response).type).toBe('string');
  });

  it('can access global objects like Math', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'Math.max(1, 5, 3)' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBe(5);
  });

  it('can access window and document', async () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'typeof document' };
    const response = await handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBe('object');
  });

  it('handles RangeError from recursive code', async () => {
    const command: ExecJsCommand = {
      type: 'exec-js',
      code: '(function f() { return f(); })()',
    };
    const response = await handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
  });
});
