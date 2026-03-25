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

  // Click ripple animation
  const style = document.createElement('style');
  style.textContent = \`
    @keyframes sweetlink-ripple {
      0% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
      100% { transform: translate(-50%, -50%) scale(5); opacity: 0; }
    }
  \`;
  document.head.appendChild(style);

  document.addEventListener('mousedown', (e) => {
    const ripple = document.createElement('div');
    ripple.style.cssText = [
      'position: fixed',
      'pointer-events: none',
      'z-index: 999998',
      'width: 20px',
      'height: 20px',
      'border-radius: 50%',
      'border: 3px solid rgba(255, 0, 0, 0.6)',
      'left: ' + e.clientX + 'px',
      'top: ' + e.clientY + 'px',
      'transform: translate(-50%, -50%) scale(1)',
      'animation: sweetlink-ripple 500ms ease-out forwards',
    ].join(';');
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
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
