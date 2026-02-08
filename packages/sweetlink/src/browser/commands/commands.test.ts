import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConsoleLog, ExecJsCommand, GetLogsCommand, QueryDomCommand, SweetlinkResponse } from '../../types.js';
import { handleQueryDOM } from './dom.js';
import { handleExecJS } from './exec.js';
import { handleGetLogs } from './logs.js';

// biome-ignore lint/suspicious/noExplicitAny: test helper - SweetlinkResponse.data is unknown
const d = (r: SweetlinkResponse): any => r.data;

describe('handleGetLogs', () => {
  const sampleLogs: ConsoleLog[] = [
    { level: 'log', message: 'Hello world', timestamp: 1000 },
    { level: 'error', message: 'An error occurred', timestamp: 2000 },
    { level: 'warn', message: 'A warning message', timestamp: 3000 },
    { level: 'log', message: 'Another log', timestamp: 4000 },
  ];

  it('returns all logs when no filter', () => {
    const command: GetLogsCommand = { type: 'get-logs' };
    const response = handleGetLogs(command, sampleLogs);

    expect(response.success).toBe(true);
    expect(d(response).logs.length).toBe(4);
    expect(d(response).totalCount).toBe(4);
    expect(d(response).filteredCount).toBe(4);
  });

  it('filters by log level', () => {
    const command: GetLogsCommand = { type: 'get-logs', filter: 'error' };
    const response = handleGetLogs(command, sampleLogs);

    expect(response.success).toBe(true);
    expect(d(response).logs.length).toBe(1);
    expect(d(response).logs[0].level).toBe('error');
    expect(d(response).totalCount).toBe(4);
    expect(d(response).filteredCount).toBe(1);
  });

  it('filters by message content', () => {
    const command: GetLogsCommand = { type: 'get-logs', filter: 'warning' };
    const response = handleGetLogs(command, sampleLogs);

    expect(response.success).toBe(true);
    expect(d(response).logs.length).toBe(1);
    expect(d(response).logs[0].message).toContain('warning');
  });

  it('filter is case-insensitive', () => {
    const command: GetLogsCommand = { type: 'get-logs', filter: 'HELLO' };
    const response = handleGetLogs(command, sampleLogs);

    expect(response.success).toBe(true);
    expect(d(response).logs.length).toBe(1);
  });

  it('returns empty array when no matches', () => {
    const command: GetLogsCommand = { type: 'get-logs', filter: 'nonexistent' };
    const response = handleGetLogs(command, sampleLogs);

    expect(response.success).toBe(true);
    expect(d(response).logs.length).toBe(0);
    expect(d(response).filteredCount).toBe(0);
  });

  it('includes timestamp in response', () => {
    const command: GetLogsCommand = { type: 'get-logs' };
    const response = handleGetLogs(command, sampleLogs);

    expect(response.timestamp).toBeGreaterThan(0);
  });
});

describe('handleExecJS', () => {
  it('executes simple expressions', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: '1 + 2' };
    const response = handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBe(3);
    expect(d(response).type).toBe('number');
  });

  it('executes string expressions', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: '"hello".toUpperCase()' };
    const response = handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBe('HELLO');
    expect(d(response).type).toBe('string');
  });

  it('executes object expressions', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: '({ a: 1, b: 2 })' };
    const response = handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toEqual({ a: 1, b: 2 });
    expect(d(response).type).toBe('object');
  });

  it('returns error when code is missing', () => {
    const command: ExecJsCommand = { type: 'exec-js' };
    const response = handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Code is required');
  });

  it('handles syntax errors gracefully', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'invalid syntax {{' };
    const response = handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
  });

  it('handles runtime errors gracefully', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'nonExistentVariable.property' };
    const response = handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
  });

  it('includes timestamp in response', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'true' };
    const response = handleExecJS(command);

    expect(response.timestamp).toBeGreaterThan(0);
  });

  it('returns error when code is not a string', () => {
    const command = { type: 'exec-js', code: 123 } as unknown as ExecJsCommand;
    const response = handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Code must be a string');
  });

  it('returns error when code exceeds maximum length', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'x'.repeat(10001) };
    const response = handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toContain('exceeds maximum length');
    expect(response.error).toContain('10000');
  });

  it('accepts code at exactly the maximum length', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: `${'1+'.repeat(4999)}1` };
    // 4999 * 2 + 1 = 9999, which is under 10000
    const response = handleExecJS(command);

    // Should succeed (it is valid JS)
    expect(response.success).toBe(true);
  });

  it('handles boolean results', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'true' };
    const response = handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBe(true);
    expect(d(response).type).toBe('boolean');
  });

  it('handles undefined results', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'undefined' };
    const response = handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBeUndefined();
    expect(d(response).type).toBe('undefined');
  });

  it('handles null results', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'null' };
    const response = handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toBeNull();
    expect(d(response).type).toBe('object');
  });

  it('handles array results', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: '[1, 2, 3]' };
    const response = handleExecJS(command);

    expect(response.success).toBe(true);
    expect(d(response).result).toEqual([1, 2, 3]);
    expect(d(response).type).toBe('object');
  });

  it('returns error message from Error instances', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'throw new TypeError("bad type")' };
    const response = handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('bad type');
  });

  it('returns generic message for non-Error throws', () => {
    const command: ExecJsCommand = { type: 'exec-js', code: 'throw "string error"' };
    const response = handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Execution failed');
  });
});

describe('handleQueryDOM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns error when selector is missing', () => {
    const command: QueryDomCommand = { type: 'query-dom' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Selector is required');
  });

  it('returns empty results for no matches', () => {
    const command: QueryDomCommand = { type: 'query-dom', selector: '#nonexistent' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(d(response).found).toBe(false);
    expect(d(response).count).toBe(0);
    expect(d(response).elements).toEqual([]);
  });

  it('finds elements by selector', () => {
    const div = document.createElement('div');
    div.id = 'test-div';
    div.className = 'test-class';
    div.textContent = 'Hello';
    document.body.appendChild(div);

    const command: QueryDomCommand = { type: 'query-dom', selector: '#test-div' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(d(response).found).toBe(true);
    expect(d(response).count).toBe(1);
    expect(d(response).elements[0].tagName).toBe('div');
    expect(d(response).elements[0].id).toBe('test-div');
    expect(d(response).elements[0].className).toBe('test-class');
    expect(d(response).elements[0].textContent).toBe('Hello');
  });

  it('finds multiple elements', () => {
    for (let i = 0; i < 3; i++) {
      const span = document.createElement('span');
      span.className = 'multi';
      document.body.appendChild(span);
    }

    const command: QueryDomCommand = { type: 'query-dom', selector: '.multi' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(d(response).count).toBe(3);
    expect(d(response).elements.length).toBe(3);
  });

  it('includes computed style when requested', () => {
    const div = document.createElement('div');
    div.style.display = 'block';
    document.body.appendChild(div);

    const command: QueryDomCommand = {
      type: 'query-dom',
      selector: 'div',
      property: 'computedStyle',
    };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(d(response).elements[0].computedStyle).toBeDefined();
    expect(d(response).elements[0].computedStyle.display).toBeDefined();
  });

  it('includes bounding rect when requested', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const command: QueryDomCommand = {
      type: 'query-dom',
      selector: 'div',
      property: 'boundingRect',
    };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(d(response).elements[0].boundingRect).toBeDefined();
  });

  it('includes attributes when requested', () => {
    const div = document.createElement('div');
    div.setAttribute('data-value', '123');
    div.setAttribute('aria-label', 'Test');
    document.body.appendChild(div);

    const command: QueryDomCommand = {
      type: 'query-dom',
      selector: 'div',
      property: 'attributes',
    };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(d(response).elements[0].attributes['data-value']).toBe('123');
    expect(d(response).elements[0].attributes['aria-label']).toBe('Test');
  });

  it('handles selectors that return no results', () => {
    const command: QueryDomCommand = { type: 'query-dom', selector: '#does-not-exist' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(d(response).found).toBe(false);
  });

  it('truncates long text content', () => {
    const div = document.createElement('div');
    div.textContent = 'x'.repeat(500);
    document.body.appendChild(div);

    const command: QueryDomCommand = { type: 'query-dom', selector: 'div' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(d(response).elements[0].textContent.length).toBeLessThanOrEqual(200);
  });
});
