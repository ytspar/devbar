import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleGetLogs } from './logs.js';
import { handleExecJS } from './exec.js';
import { handleQueryDOM } from './dom.js';
import type { ConsoleLog, SweetlinkCommand } from '../../types.js';

describe('handleGetLogs', () => {
  const sampleLogs: ConsoleLog[] = [
    { level: 'log', message: 'Hello world', timestamp: 1000 },
    { level: 'error', message: 'An error occurred', timestamp: 2000 },
    { level: 'warn', message: 'A warning message', timestamp: 3000 },
    { level: 'log', message: 'Another log', timestamp: 4000 },
  ];

  it('returns all logs when no filter', () => {
    const command: SweetlinkCommand = { type: 'get-logs' };
    const response = handleGetLogs(command, sampleLogs);

    expect(response.success).toBe(true);
    expect(response.data.logs.length).toBe(4);
    expect(response.data.totalCount).toBe(4);
    expect(response.data.filteredCount).toBe(4);
  });

  it('filters by log level', () => {
    const command: SweetlinkCommand = { type: 'get-logs', filter: 'error' };
    const response = handleGetLogs(command, sampleLogs);

    expect(response.success).toBe(true);
    expect(response.data.logs.length).toBe(1);
    expect(response.data.logs[0].level).toBe('error');
    expect(response.data.totalCount).toBe(4);
    expect(response.data.filteredCount).toBe(1);
  });

  it('filters by message content', () => {
    const command: SweetlinkCommand = { type: 'get-logs', filter: 'warning' };
    const response = handleGetLogs(command, sampleLogs);

    expect(response.success).toBe(true);
    expect(response.data.logs.length).toBe(1);
    expect(response.data.logs[0].message).toContain('warning');
  });

  it('filter is case-insensitive', () => {
    const command: SweetlinkCommand = { type: 'get-logs', filter: 'HELLO' };
    const response = handleGetLogs(command, sampleLogs);

    expect(response.success).toBe(true);
    expect(response.data.logs.length).toBe(1);
  });

  it('returns empty array when no matches', () => {
    const command: SweetlinkCommand = { type: 'get-logs', filter: 'nonexistent' };
    const response = handleGetLogs(command, sampleLogs);

    expect(response.success).toBe(true);
    expect(response.data.logs.length).toBe(0);
    expect(response.data.filteredCount).toBe(0);
  });

  it('includes timestamp in response', () => {
    const command: SweetlinkCommand = { type: 'get-logs' };
    const response = handleGetLogs(command, sampleLogs);

    expect(response.timestamp).toBeGreaterThan(0);
  });
});

describe('handleExecJS', () => {
  it('executes simple expressions', () => {
    const command: SweetlinkCommand = { type: 'exec-js', code: '1 + 2' };
    const response = handleExecJS(command);

    expect(response.success).toBe(true);
    expect(response.data.result).toBe(3);
    expect(response.data.type).toBe('number');
  });

  it('executes string expressions', () => {
    const command: SweetlinkCommand = { type: 'exec-js', code: '"hello".toUpperCase()' };
    const response = handleExecJS(command);

    expect(response.success).toBe(true);
    expect(response.data.result).toBe('HELLO');
    expect(response.data.type).toBe('string');
  });

  it('executes object expressions', () => {
    const command: SweetlinkCommand = { type: 'exec-js', code: '({ a: 1, b: 2 })' };
    const response = handleExecJS(command);

    expect(response.success).toBe(true);
    expect(response.data.result).toEqual({ a: 1, b: 2 });
    expect(response.data.type).toBe('object');
  });

  it('returns error when code is missing', () => {
    const command: SweetlinkCommand = { type: 'exec-js' };
    const response = handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Code is required');
  });

  it('handles syntax errors gracefully', () => {
    const command: SweetlinkCommand = { type: 'exec-js', code: 'invalid syntax {{' };
    const response = handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
  });

  it('handles runtime errors gracefully', () => {
    const command: SweetlinkCommand = { type: 'exec-js', code: 'nonExistentVariable.property' };
    const response = handleExecJS(command);

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
  });

  it('includes timestamp in response', () => {
    const command: SweetlinkCommand = { type: 'exec-js', code: 'true' };
    const response = handleExecJS(command);

    expect(response.timestamp).toBeGreaterThan(0);
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
    const command: SweetlinkCommand = { type: 'query-dom' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Selector is required');
  });

  it('returns empty results for no matches', () => {
    const command: SweetlinkCommand = { type: 'query-dom', selector: '#nonexistent' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(response.data.found).toBe(false);
    expect(response.data.count).toBe(0);
    expect(response.data.elements).toEqual([]);
  });

  it('finds elements by selector', () => {
    const div = document.createElement('div');
    div.id = 'test-div';
    div.className = 'test-class';
    div.textContent = 'Hello';
    document.body.appendChild(div);

    const command: SweetlinkCommand = { type: 'query-dom', selector: '#test-div' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(response.data.found).toBe(true);
    expect(response.data.count).toBe(1);
    expect(response.data.elements[0].tagName).toBe('div');
    expect(response.data.elements[0].id).toBe('test-div');
    expect(response.data.elements[0].className).toBe('test-class');
    expect(response.data.elements[0].textContent).toBe('Hello');
  });

  it('finds multiple elements', () => {
    for (let i = 0; i < 3; i++) {
      const span = document.createElement('span');
      span.className = 'multi';
      document.body.appendChild(span);
    }

    const command: SweetlinkCommand = { type: 'query-dom', selector: '.multi' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(response.data.count).toBe(3);
    expect(response.data.elements.length).toBe(3);
  });

  it('includes computed style when requested', () => {
    const div = document.createElement('div');
    div.style.display = 'block';
    document.body.appendChild(div);

    const command: SweetlinkCommand = {
      type: 'query-dom',
      selector: 'div',
      property: 'computedStyle'
    };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(response.data.elements[0].computedStyle).toBeDefined();
    expect(response.data.elements[0].computedStyle.display).toBeDefined();
  });

  it('includes bounding rect when requested', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const command: SweetlinkCommand = {
      type: 'query-dom',
      selector: 'div',
      property: 'boundingRect'
    };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(response.data.elements[0].boundingRect).toBeDefined();
  });

  it('includes attributes when requested', () => {
    const div = document.createElement('div');
    div.setAttribute('data-value', '123');
    div.setAttribute('aria-label', 'Test');
    document.body.appendChild(div);

    const command: SweetlinkCommand = {
      type: 'query-dom',
      selector: 'div',
      property: 'attributes'
    };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(response.data.elements[0].attributes['data-value']).toBe('123');
    expect(response.data.elements[0].attributes['aria-label']).toBe('Test');
  });

  it('handles selectors that return no results', () => {
    const command: SweetlinkCommand = { type: 'query-dom', selector: '#does-not-exist' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(response.data.found).toBe(false);
  });

  it('truncates long text content', () => {
    const div = document.createElement('div');
    div.textContent = 'x'.repeat(500);
    document.body.appendChild(div);

    const command: SweetlinkCommand = { type: 'query-dom', selector: 'div' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(response.data.elements[0].textContent.length).toBeLessThanOrEqual(200);
  });
});
