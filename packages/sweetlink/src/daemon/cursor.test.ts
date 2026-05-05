// @vitest-environment node

/**
 * Cursor Highlight Installation Tests
 *
 * The cursor-highlight script is a string of in-page JS injected into the
 * daemon's headless browser via `addInitScript`. There are two contracts
 * worth testing without launching a real browser:
 *
 *  1. installCursorHighlight calls page.addInitScript exactly once with
 *     the cursor script — a regression where someone forgets to thread
 *     the call through would silently disable click visualization in
 *     every recording.
 *
 *  2. The script string itself contains the load-bearing pieces we
 *     promised consumers: the singleton guard (`window.__sweetlinkCursor__`),
 *     the click-ripple animation, and the persistent center dot. If
 *     someone refactors the script in a way that drops one of these,
 *     recordings get a degraded UX silently.
 */

import { describe, expect, it, vi } from 'vitest';
import { installCursorHighlight } from './cursor.js';

describe('installCursorHighlight', () => {
  it('calls page.addInitScript exactly once with a non-empty script', async () => {
    const addInitScript = vi.fn<(s: string) => Promise<void>>(async () => undefined);
    const evaluate = vi.fn<(s: string) => Promise<void>>(async () => undefined);
    const page = { addInitScript, evaluate };

    await installCursorHighlight(page as never);

    expect(addInitScript).toHaveBeenCalledTimes(1);
    const script = addInitScript.mock.calls[0]![0] as string;
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(100);
  });

  it('also evaluates the script immediately so the current page is covered', async () => {
    const addInitScript = vi.fn<(s: string) => Promise<void>>(async () => undefined);
    const evaluate = vi.fn<(s: string) => Promise<void>>(async () => undefined);
    const page = { addInitScript, evaluate };

    await installCursorHighlight(page as never);

    // addInitScript only runs on subsequent navigations — the immediate
    // evaluate() call ensures the current page also gets the cursor.
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate.mock.calls[0]![0]).toBe(addInitScript.mock.calls[0]![0]);
  });

  it('tolerates a failing immediate evaluate (page may not be ready yet)', async () => {
    const addInitScript = vi.fn(async () => undefined);
    const evaluate = vi.fn(async () => {
      throw new Error('Execution context was destroyed');
    });
    const page = { addInitScript, evaluate };

    // Must not throw — the install path is best-effort for the current page.
    await expect(installCursorHighlight(page as never)).resolves.toBeUndefined();
    expect(addInitScript).toHaveBeenCalledTimes(1);
  });

  it('script contains the singleton guard, ripple animation, and center dot', async () => {
    const addInitScript = vi.fn<(s: string) => Promise<void>>(async () => undefined);
    const evaluate = vi.fn<(s: string) => Promise<void>>(async () => undefined);
    const page = { addInitScript, evaluate };

    await installCursorHighlight(page as never);
    const calls = addInitScript.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const script = calls[0]![0];

    // Singleton guard so the script is safe to inject twice.
    expect(script).toContain('window.__sweetlinkCursor__');
    // Mouse-follow dot — the always-on cursor indicator.
    expect(script).toContain('mousemove');
    // Click ripple keyframe animation.
    expect(script).toContain('@keyframes sweetlink-ripple');
    // Persistent center dot keyframe (separate from the ripple) so the
    // click site stays visible after the ring fades.
    expect(script).toContain('@keyframes sweetlink-pulse');
    // Both fire on mousedown.
    expect(script).toContain('mousedown');
  });
});
