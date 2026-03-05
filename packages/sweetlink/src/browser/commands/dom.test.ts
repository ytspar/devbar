/**
 * DOM Command Handler Tests
 *
 * Tests for handleQueryDOM with focus on edge cases not covered
 * by commands.test.ts: error handling, property extraction branches,
 * and DOM structure edge cases.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { QueryDomCommand, SweetlinkResponse } from '../../types.js';
import { handleQueryDOM } from './dom.js';

// biome-ignore lint/suspicious/noExplicitAny: test helper - SweetlinkResponse.data is unknown
const d = (r: SweetlinkResponse): any => r.data;

describe('handleQueryDOM', () => {
  beforeEach(() => {
    document.body.textContent = '';
  });

  afterEach(() => {
    document.body.textContent = '';
  });

  it('returns error when selector is missing', () => {
    const command: QueryDomCommand = { type: 'query-dom' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Selector is required');
  });

  it('returns found:false for no matches', () => {
    const command: QueryDomCommand = { type: 'query-dom', selector: '#nonexistent' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(d(response).found).toBe(false);
    expect(d(response).count).toBe(0);
    expect(d(response).elements).toEqual([]);
  });

  it('returns element basic info including index', () => {
    const div = document.createElement('div');
    div.id = 'test';
    div.className = 'cls';
    div.textContent = 'Content';
    document.body.appendChild(div);

    const command: QueryDomCommand = { type: 'query-dom', selector: '#test' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(d(response).found).toBe(true);
    expect(d(response).count).toBe(1);
    const el = d(response).elements[0];
    expect(el.index).toBe(0);
    expect(el.tagName).toBe('div');
    expect(el.id).toBe('test');
    expect(el.className).toBe('cls');
    expect(el.textContent).toBe('Content');
  });

  it('returns null for missing id and className', () => {
    const span = document.createElement('span');
    document.body.appendChild(span);

    const command: QueryDomCommand = { type: 'query-dom', selector: 'span' };
    const response = handleQueryDOM(command);

    const el = d(response).elements[0];
    expect(el.id).toBeNull();
    expect(el.className).toBeNull();
  });

  it('truncates textContent at 200 characters', () => {
    const div = document.createElement('div');
    div.textContent = 'A'.repeat(300);
    document.body.appendChild(div);

    const command: QueryDomCommand = { type: 'query-dom', selector: 'div' };
    const response = handleQueryDOM(command);

    expect(d(response).elements[0].textContent.length).toBe(200);
  });

  it('returns null textContent for empty elements', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const command: QueryDomCommand = { type: 'query-dom', selector: 'div' };
    const response = handleQueryDOM(command);

    // textContent is "" which is falsy, so slice returns "" and || null returns null
    expect(d(response).elements[0].textContent).toBeNull();
  });

  it('handles computedStyle property', () => {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.visibility = 'hidden';
    document.body.appendChild(div);

    const command: QueryDomCommand = {
      type: 'query-dom',
      selector: 'div',
      property: 'computedStyle',
    };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    const cs = d(response).elements[0].computedStyle;
    expect(cs).toBeDefined();
    expect(cs).toHaveProperty('display');
    expect(cs).toHaveProperty('visibility');
    expect(cs).toHaveProperty('opacity');
    expect(cs).toHaveProperty('position');
  });

  it('handles boundingRect property', () => {
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

  it('handles attributes property', () => {
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'my-el');
    div.setAttribute('role', 'button');
    div.setAttribute('aria-label', 'Click me');
    document.body.appendChild(div);

    const command: QueryDomCommand = {
      type: 'query-dom',
      selector: 'div',
      property: 'attributes',
    };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    const attrs = d(response).elements[0].attributes;
    expect(attrs['data-testid']).toBe('my-el');
    expect(attrs.role).toBe('button');
    expect(attrs['aria-label']).toBe('Click me');
  });

  it('handles arbitrary property lookup on elements', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'hello';
    document.body.appendChild(input);

    const command: QueryDomCommand = {
      type: 'query-dom',
      selector: 'input',
      property: 'value',
    };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(d(response).elements[0].value).toBe('hello');
  });

  it('returns correct index for multiple elements', () => {
    for (let i = 0; i < 3; i++) {
      const span = document.createElement('span');
      span.className = 'item';
      span.textContent = `Item ${i}`;
      document.body.appendChild(span);
    }

    const command: QueryDomCommand = { type: 'query-dom', selector: '.item' };
    const response = handleQueryDOM(command);

    expect(d(response).count).toBe(3);
    expect(d(response).elements[0].index).toBe(0);
    expect(d(response).elements[1].index).toBe(1);
    expect(d(response).elements[2].index).toBe(2);
  });

  it('handles invalid CSS selector gracefully', () => {
    const command: QueryDomCommand = { type: 'query-dom', selector: '[[[invalid' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
    expect(response.timestamp).toBeGreaterThan(0);
  });

  it('includes timestamp in all responses', () => {
    const before = Date.now();

    const command: QueryDomCommand = { type: 'query-dom', selector: 'body' };
    const response = handleQueryDOM(command);

    const after = Date.now();
    expect(response.timestamp).toBeGreaterThanOrEqual(before);
    expect(response.timestamp).toBeLessThanOrEqual(after);
  });

  it('returns generic error message for non-Error throws', () => {
    // Mock querySelectorAll to throw a non-Error
    const originalQSA = document.querySelectorAll.bind(document);
    document.querySelectorAll = () => {
      throw 'string error';
    };

    const command: QueryDomCommand = { type: 'query-dom', selector: 'div' };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Query failed');

    document.querySelectorAll = originalQSA;
  });

  it('handles property that does not exist on element', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const command: QueryDomCommand = {
      type: 'query-dom',
      selector: 'div',
      property: 'nonExistentProperty',
    };
    const response = handleQueryDOM(command);

    expect(response.success).toBe(true);
    expect(d(response).elements[0].nonExistentProperty).toBeUndefined();
  });

  it('handles selector with undefined value (same as missing)', () => {
    const command = { type: 'query-dom', selector: undefined } as unknown as QueryDomCommand;
    const response = handleQueryDOM(command);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Selector is required');
  });

  it('handles empty string selector', () => {
    const command: QueryDomCommand = { type: 'query-dom', selector: '' };
    const response = handleQueryDOM(command);

    // Empty string is falsy, so returns "Selector is required"
    expect(response.success).toBe(false);
    expect(response.error).toBe('Selector is required');
  });

  it('returns correct tagName in lowercase', () => {
    const h1 = document.createElement('h1');
    h1.textContent = 'Title';
    document.body.appendChild(h1);

    const command: QueryDomCommand = { type: 'query-dom', selector: 'h1' };
    const response = handleQueryDOM(command);

    expect(d(response).elements[0].tagName).toBe('h1');
  });
});
