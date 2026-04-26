/**
 * Cursor Highlight Injection
 *
 * Injects a cursor highlight (red dot + click ripple) into the daemon's
 * headless Chromium via page.addInitScript(). Only affects the daemon browser,
 * not the user's real browser.
 */

type Page = import('playwright').Page;

const CURSOR_HIGHLIGHT_SCRIPT = `
(() => {
  if (window.__sweetlinkCursor__) return;
  window.__sweetlinkCursor__ = true;

  // Red semi-transparent dot follows cursor
  const dot = document.createElement('div');
  dot.style.cssText = [
    'position: fixed',
    'pointer-events: none',
    'z-index: 999999',
    'width: 40px',
    'height: 40px',
    'border-radius: 50%',
    'background: rgba(255, 0, 0, 0.3)',
    'border: 2px solid rgba(255, 255, 255, 0.8)',
    'transform: translate(-50%, -50%)',
    'transition: opacity 0.1s',
    'display: none',
  ].join(';');
  document.body.appendChild(dot);

  document.addEventListener('mousemove', (e) => {
    dot.style.display = 'block';
    dot.style.left = e.clientX + 'px';
    dot.style.top = e.clientY + 'px';
  });

  // Click ripple + persistent center mark — both are tuned to be highly
  // visible in recordings. The ripple expands to 8x over 1.2s; the center
  // dot stays fully opaque for the first frame and fades over 600ms so
  // viewers can clearly see WHERE the click landed even if they're not
  // watching the exact frame of mousedown.
  const style = document.createElement('style');
  style.textContent = \`
    @keyframes sweetlink-ripple {
      0%   { transform: translate(-50%, -50%) scale(1);   opacity: 0.95; }
      30%  { transform: translate(-50%, -50%) scale(3);   opacity: 0.7; }
      100% { transform: translate(-50%, -50%) scale(8);   opacity: 0; }
    }
    @keyframes sweetlink-pulse {
      0%   { opacity: 1; }
      100% { opacity: 0; }
    }
  \`;
  document.head.appendChild(style);

  document.addEventListener('mousedown', (e) => {
    // Expanding ring
    const ripple = document.createElement('div');
    ripple.style.cssText = [
      'position: fixed',
      'pointer-events: none',
      'z-index: 999998',
      'width: 24px',
      'height: 24px',
      'border-radius: 50%',
      'border: 4px solid rgba(255, 64, 32, 0.95)',
      'box-shadow: 0 0 12px rgba(255, 64, 32, 0.7)',
      'left: ' + e.clientX + 'px',
      'top: ' + e.clientY + 'px',
      'transform: translate(-50%, -50%) scale(1)',
      'animation: sweetlink-ripple 1200ms ease-out forwards',
    ].join(';');
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 1200);

    // Persistent center dot that fades over 600ms.
    const center = document.createElement('div');
    center.style.cssText = [
      'position: fixed',
      'pointer-events: none',
      'z-index: 999999',
      'width: 14px',
      'height: 14px',
      'border-radius: 50%',
      'background: rgba(255, 64, 32, 1)',
      'border: 2px solid #fff',
      'box-shadow: 0 0 0 2px rgba(255, 64, 32, 0.5)',
      'left: ' + e.clientX + 'px',
      'top: ' + e.clientY + 'px',
      'transform: translate(-50%, -50%)',
      'animation: sweetlink-pulse 600ms ease-out forwards',
    ].join(';');
    document.body.appendChild(center);
    setTimeout(() => center.remove(), 600);
  });
})();
`;

/**
 * Install cursor highlight script via page.addInitScript().
 * This runs before any page JavaScript, so it persists across navigations.
 */
export async function installCursorHighlight(page: Page): Promise<void> {
  await page.addInitScript(CURSOR_HIGHLIGHT_SCRIPT);
  // Also evaluate immediately for the current page
  await page.evaluate(CURSOR_HIGHLIGHT_SCRIPT).catch(() => {});
  console.error('[Daemon] Cursor highlight installed.');
}
