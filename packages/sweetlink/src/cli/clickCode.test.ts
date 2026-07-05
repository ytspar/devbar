/**
 * Click-Code Generation Tests
 *
 * Executes the generated click code against a real (happy-dom) document to
 * lock in the bare `--text` semantics: leaf-most matching (never the
 * ancestor chain — html/body/main all "contain" the text too) with
 * clickable-preferred resolution (the button around a text span, not the
 * span), deduped targets, and --index over the deduped list.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateClickCode } from './clickCode.js';

interface ClickResult {
  success: boolean;
  clicked?: string;
  found?: number;
  error?: string;
}

function runClickCode(code: string): ClickResult {
  // Indirect eval, same as the browser-side exec-js handler.
  // biome-ignore lint/security/noGlobalEval: executing generated browser code under test
  const indirectEval = eval;
  return indirectEval(code) as ClickResult;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('generateClickCode — smart-text (bare --text)', () => {
  it('clicks the button around a nested text span, not html/body', () => {
    // Real-world shape: text sits in a span inside a button inside cards.
    // Every ancestor's textContent includes "Save list" — the old naive
    // `*` filter clicked <html> (index 0) and nothing happened.
    document.body.innerHTML = `
      <main>
        <div class="card">
          <h2>My list</h2>
          <button id="save" class="btn"><span>Save list</span></button>
        </div>
      </main>
    `;
    const button = document.getElementById('save') as HTMLButtonElement;
    const clicked = vi.fn();
    button.addEventListener('click', clicked);

    const result = runClickCode(generateClickCode({ type: 'smart-text', text: 'Save list' }, 0));

    expect(result.success).toBe(true);
    expect(result.clicked).toBe('BUTTON.btn');
    expect(result.found).toBe(1); // deduped: one target, not 12 ancestors
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('applies --index across deduped targets when two buttons share the text', () => {
    document.body.innerHTML = `
      <div class="card"><button id="first"><span>Save list</span></button></div>
      <div class="card"><button id="second"><span>Save list</span></button></div>
    `;
    const first = vi.fn();
    const second = vi.fn();
    document.getElementById('first')!.addEventListener('click', first);
    document.getElementById('second')!.addEventListener('click', second);

    const result = runClickCode(generateClickCode({ type: 'smart-text', text: 'Save list' }, 1));

    expect(result.success).toBe(true);
    expect(result.found).toBe(2);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('clicks the text leaf itself when it has no interactive ancestor', () => {
    document.body.innerHTML = `
      <section>
        <div id="plain" class="note">Standalone text</div>
      </section>
    `;
    const clicked = vi.fn();
    document.getElementById('plain')!.addEventListener('click', clicked);

    const result = runClickCode(
      generateClickCode({ type: 'smart-text', text: 'Standalone text' }, 0)
    );

    expect(result.success).toBe(true);
    expect(result.clicked).toBe('DIV.note');
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('resolves role="button" and a[href] hosts as click targets', () => {
    document.body.innerHTML = `
      <div id="fake" role="button"><span>Toggle thing</span></div>
    `;
    const clicked = vi.fn();
    document.getElementById('fake')!.addEventListener('click', clicked);

    const result = runClickCode(generateClickCode({ type: 'smart-text', text: 'Toggle thing' }, 0));

    expect(result.success).toBe(true);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('returns a not-found error when no element contains the text', () => {
    document.body.innerHTML = '<div>Something else</div>';

    const result = runClickCode(generateClickCode({ type: 'smart-text', text: 'Missing' }, 0));

    expect(result.success).toBe(false);
    expect(result.error).toContain('No element found with text: Missing');
  });

  it('returns an out-of-bounds error for --index past the deduped targets', () => {
    document.body.innerHTML = '<button><span>Only one</span></button>';

    const result = runClickCode(generateClickCode({ type: 'smart-text', text: 'Only one' }, 3));

    expect(result.success).toBe(false);
    expect(result.error).toContain('out of bounds');
    expect(result.error).toContain('found 1');
  });
});

describe('generateClickCode — explicit selector scoping (unchanged)', () => {
  it('keeps the user-scoped text filter without leaf/interactive rewriting', () => {
    document.body.innerHTML = `
      <button id="save"><span>Save list</span></button>
    `;
    const clicked = vi.fn();
    document.getElementById('save')!.addEventListener('click', clicked);

    const result = runClickCode(
      generateClickCode({ type: 'text', text: 'Save list', selector: 'button' }, 0)
    );

    expect(result.success).toBe(true);
    expect(result.clicked).toBe('BUTTON');
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('clicks by plain selector', () => {
    document.body.innerHTML = '<button class="primary">Go</button>';

    const result = runClickCode(generateClickCode({ type: 'selector', selector: '.primary' }, 0));

    expect(result.success).toBe(true);
    expect(result.clicked).toBe('BUTTON.primary');
  });
});
