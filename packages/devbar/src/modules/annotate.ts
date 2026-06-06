/**
 * Annotate mode (DEV-4516) — live, in-context visual feedback.
 *
 * The companion surface to the `el-visual-evidence` review UI: instead of
 * annotating captured screenshots after the fact, the devbar lets you pin
 * region comments directly onto the *running* page during local authoring.
 * Each pin is POSTed to the `el-visual-evidence review-ui --listen` server,
 * which merges it into the same `feedback.json` the active Claude Code session
 * reads on its next capture→fix cycle.
 *
 * Pin shape matches the visual-evidence `FeedbackPin` contract (source:"devbar")
 * documented in `tools/cli/el-visual-evidence/README.md`. We don't import the
 * type (separate repo) — we construct JSON matching the documented shape.
 *
 * Transport: the devbar runs on the host app's origin (e.g. localhost:3003) and
 * the listener is on another port, so the POST is cross-origin. We send it
 * fire-and-forget with `mode: "no-cors"` + a `text/plain` body — a "simple"
 * request that needs no CORS preflight; the review-ui server `JSON.parse`s the
 * body regardless of content-type. The response is opaque (unreadable), which is
 * fine for a one-way pin submission.
 *
 * Overlay nodes carry `data-devbar` / `data-devbar-overlay` so the
 * visual-evidence capture pipeline's `HIDE_DEVBAR_CSS` still suppresses them.
 */

import type { DevBarControl } from '../types.js';

export type DevbarPinKind = 'fix' | 'question' | 'praise';

export interface DevbarPin {
  id: string;
  source: 'devbar';
  kind: DevbarPinKind;
  comment: string;
  route?: string;
  domSelector?: string;
  viewport?: 'mobile' | 'tablet' | 'desktop';
  region?: { x: number; y: number; w?: number; h?: number };
  createdAt?: string;
}

export interface AnnotateOptions {
  /** review-ui --listen feedback endpoint. Default: http://localhost:3846/api/feedback. */
  endpoint?: string;
  /**
   * Called when annotate mode exits from *inside* the overlay (Escape key), so
   * the owner (e.g. the toolbar control) can resync its state. Not called when
   * the owner drives the returned cleanup itself.
   */
  onExit?: () => void;
}

const DEFAULT_ENDPOINT = 'http://localhost:3846/api/feedback';
const KINDS: DevbarPinKind[] = ['fix', 'question', 'praise'];

/**
 * Build a reasonably-stable CSS selector for an element: prefer `#id`, else a
 * tag(.class) + `:nth-of-type` path walked up to a capped depth or the nearest
 * id'd ancestor. Good enough to point a human/Claude at the element; not
 * guaranteed unique across dynamic re-renders.
 */
export function buildSelector(el: Element, maxDepth = 5): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && node.nodeType === 1 && depth < maxDepth) {
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    let part = node.tagName.toLowerCase();
    const cls = (node.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((c) => c && !c.startsWith('data-'))
      .slice(0, 1)
      .map((c) => `.${CSS.escape(c)}`)
      .join('');
    part += cls;
    const parent = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === node?.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = node.parentElement;
    depth += 1;
  }
  return parts.join(' > ');
}

/** Viewport bucket from the current window width — mirrors the capture viewports. */
export function viewportBucket(width: number): DevbarPin['viewport'] {
  if (width <= 600) return 'mobile';
  if (width <= 1024) return 'tablet';
  return 'desktop';
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `pin_${crypto.randomUUID()}`;
  return `pin_${Math.floor(Math.random() * 1e9).toString(16)}`;
}

/** POST a pin fire-and-forget to the review-ui listener (no-cors, text/plain). */
export async function submitPin(pin: DevbarPin, endpoint: string): Promise<void> {
  try {
    await fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ pins: [pin] }),
    });
  } catch {
    // Opaque/no-cors responses never reject for HTTP status; this only fires on
    // network failure (listener not running). Swallow — annotate is best-effort.
  }
}

const NS = 'http://www.w3.org/1999/xhtml';

/**
 * Activate annotate mode: hover-highlight elements, click to drop a pin, fill a
 * comment popover, submit to the listener. Returns a cleanup function that
 * removes all overlays + listeners. Mirrors `activateRulerMode`'s lifecycle.
 */
export function activateAnnotateMode(opts: AnnotateOptions = {}): () => void {
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;

  const overlay = document.createElementNS(NS, 'div') as HTMLDivElement;
  overlay.setAttribute('data-devbar', 'annotate-overlay');
  overlay.setAttribute('data-devbar-overlay', '');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  const hover = document.createElement('div');
  hover.setAttribute('data-devbar-overlay', '');
  Object.assign(hover.style, {
    position: 'fixed',
    border: '2px solid #2f81f7',
    background: 'rgba(47,129,247,0.12)',
    borderRadius: '3px',
    pointerEvents: 'none',
    transition: 'all 60ms ease-out',
    display: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  overlay.appendChild(hover);

  const markers = document.createElement('div');
  markers.setAttribute('data-devbar-overlay', '');
  Object.assign(markers.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
  overlay.appendChild(markers);

  document.body.appendChild(overlay);
  document.body.style.cursor = 'crosshair';

  let popoverOpen = false;
  // Short-circuit hover work when the pointer stays within the same element —
  // avoids a forced layout (getBoundingClientRect) on every mousemove pixel.
  let lastTarget: Element | null = null;

  function isDevbarEl(el: Element): boolean {
    return !!el.closest(
      '[data-devbar], [data-devbar-overlay], [data-devbar-tooltip], [data-devbar-ruler]'
    );
  }

  function onMove(e: MouseEvent) {
    if (popoverOpen) return;
    const target = e.target as Element;
    if (!target || isDevbarEl(target)) {
      hover.style.display = 'none';
      lastTarget = null;
      return;
    }
    if (target === lastTarget) return;
    lastTarget = target;
    const r = target.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      hover.style.display = 'none';
      return;
    }
    Object.assign(hover.style, {
      display: 'block',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  }

  function onClick(e: MouseEvent) {
    if (popoverOpen) return;
    const target = e.target as Element;
    if (!target || isDevbarEl(target)) return;
    e.preventDefault();
    e.stopPropagation();
    const r = target.getBoundingClientRect();
    // Normalized position of the click within the element.
    const rx = r.width ? (e.clientX - r.left) / r.width : 0.5;
    const ry = r.height ? (e.clientY - r.top) / r.height : 0.5;
    openPopover(target, e.clientX, e.clientY, rx, ry);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
      // Exit came from inside the overlay — let the owner (toolbar control)
      // resync, so the Annotate button doesn't stay stuck in the active state.
      opts.onExit?.();
    }
  }

  function openPopover(target: Element, px: number, py: number, rx: number, ry: number) {
    popoverOpen = true;
    hover.style.display = 'none';
    let kind: DevbarPinKind = 'fix';

    const pop = document.createElement('div');
    pop.setAttribute('data-devbar-overlay', '');
    Object.assign(pop.style, {
      position: 'fixed',
      left: `${Math.min(px, window.innerWidth - 300)}px`,
      top: `${Math.min(py, window.innerHeight - 200)}px`,
      zIndex: '2147483647',
      width: '288px',
      background: '#161b22',
      color: '#e6edf3',
      border: '1px solid #2f81f7',
      borderRadius: '8px',
      padding: '10px',
      pointerEvents: 'auto',
      font: '12px ui-monospace, monospace',
      boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
    } satisfies Partial<CSSStyleDeclaration>);

    const kindRow = document.createElement('div');
    Object.assign(kindRow.style, { display: 'flex', gap: '6px', marginBottom: '8px' });
    const kindBtns = KINDS.map((k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = k;
      Object.assign(b.style, {
        flex: '1',
        padding: '5px',
        borderRadius: '5px',
        border: `1px solid ${k === kind ? '#2f81f7' : '#2d333b'}`,
        background: k === kind ? 'rgba(47,129,247,0.25)' : '#1c2230',
        color: 'inherit',
        cursor: 'pointer',
        font: 'inherit',
      });
      b.onclick = () => {
        kind = k;
        for (const [i, btn] of kindBtns.entries()) {
          const active = KINDS[i] === kind;
          btn.style.borderColor = active ? '#2f81f7' : '#2d333b';
          btn.style.background = active ? 'rgba(47,129,247,0.25)' : '#1c2230';
        }
      };
      kindRow.appendChild(b);
      return b;
    });

    const ta = document.createElement('textarea');
    ta.placeholder = "Comment for Claude — e.g. 'this gap should be 16px'";
    Object.assign(ta.style, {
      width: '100%',
      minHeight: '56px',
      background: '#0d1117',
      color: 'inherit',
      border: '1px solid #2d333b',
      borderRadius: '5px',
      padding: '7px',
      font: 'inherit',
      resize: 'vertical',
      boxSizing: 'border-box',
    } satisfies Partial<CSSStyleDeclaration>);

    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', gap: '6px', marginTop: '8px' });
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Pin';
    Object.assign(save.style, {
      padding: '5px 12px',
      borderRadius: '5px',
      border: '1px solid #2f81f7',
      background: '#2f81f7',
      color: '#fff',
      cursor: 'pointer',
      fontWeight: '600',
      font: 'inherit',
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    Object.assign(cancel.style, {
      padding: '5px 12px',
      borderRadius: '5px',
      border: '1px solid #2d333b',
      background: '#1c2230',
      color: 'inherit',
      cursor: 'pointer',
      font: 'inherit',
    });

    function closePopover() {
      pop.remove();
      popoverOpen = false;
    }
    cancel.onclick = closePopover;
    save.onclick = () => {
      const comment = ta.value.trim();
      if (!comment) return;
      const pin: DevbarPin = {
        id: randomId(),
        source: 'devbar',
        kind,
        comment,
        route: window.location.pathname,
        domSelector: buildSelector(target),
        viewport: viewportBucket(window.innerWidth),
        region: { x: Number(rx.toFixed(4)), y: Number(ry.toFixed(4)) },
        createdAt: new Date().toISOString(),
      };
      void submitPin(pin, endpoint);
      dropMarker(px, py, kind);
      closePopover();
    };

    actions.append(save, cancel);
    pop.append(kindRow, ta, actions);
    overlay.appendChild(pop);
    ta.focus();
  }

  function dropMarker(px: number, py: number, kind: DevbarPinKind) {
    const m = document.createElement('div');
    m.setAttribute('data-devbar-overlay', '');
    const color = kind === 'fix' ? '#f85149' : kind === 'question' ? '#a371f7' : '#3fb950';
    Object.assign(m.style, {
      position: 'fixed',
      left: `${px}px`,
      top: `${py}px`,
      width: '14px',
      height: '14px',
      marginLeft: '-7px',
      marginTop: '-7px',
      borderRadius: '999px',
      background: color,
      border: '2px solid #fff',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    markers.appendChild(m);
  }

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);

  function cleanup() {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    document.body.style.cursor = '';
  }
  return cleanup;
}

/**
 * Register the "Annotate" toolbar control. `register` is injected (typically
 * `GlobalDevBar.registerControl`) so this module stays free of a GlobalDevBar
 * import (no cycle). Clicking toggles annotate mode; the control re-registers
 * itself to flip its `active` highlight. Press Esc (or click again) to exit.
 */
export function registerAnnotateControl(
  register: (control: DevBarControl) => void,
  opts: AnnotateOptions = {}
): void {
  let cleanup: (() => void) | null = null;
  function build(): DevBarControl {
    return {
      id: 'annotate',
      label: 'Annotate',
      tooltip: 'Pin visual feedback for Claude (Esc to exit)',
      active: cleanup !== null,
      variant: 'info',
      onClick: () => {
        if (cleanup) {
          cleanup();
          cleanup = null;
        } else {
          // onExit fires when the user presses Esc inside the overlay; resync the
          // control so its active highlight clears without a wasted extra click.
          cleanup = activateAnnotateMode({
            ...opts,
            onExit: () => {
              cleanup = null;
              register(build());
            },
          });
        }
        register(build());
      },
    };
  }
  register(build());
}
