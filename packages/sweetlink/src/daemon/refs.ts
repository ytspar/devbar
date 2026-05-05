/**
 * Ref System
 *
 * Uses Playwright's ariaSnapshot API to assign sequential @e refs to interactive elements.
 * No DOM mutation — works through Shadow DOM and CSP-restricted pages.
 *
 * ariaSnapshot() returns YAML-like lines:
 *   - heading "Hello" [level=1]
 *   - button "Click me"
 *   - textbox "Search"
 *   - link "Home"
 */

type Page = import('playwright').Page;
type Locator = import('playwright').Locator;

// ============================================================================
// Types
// ============================================================================

export interface RefEntry {
  ref: string;
  role: string;
  name: string;
  attrs: Record<string, string>;
}

export interface RefMap {
  entries: RefEntry[];
  byRef: Map<string, RefEntry>;
  rawSnapshot: string;
  timestamp: number;
}

// ============================================================================
// State
// ============================================================================

let currentRefMap: RefMap | null = null;
let baselineRefMap: RefMap | null = null;

// Roles that are interactive and worth assigning refs to
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem',
]);

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse ariaSnapshot YAML output into RefEntry objects.
 *
 * Format examples:
 *   - heading "Dashboard" [level=1]
 *   - button "Submit"
 *   - textbox "Email" [disabled]
 *   - link "Settings":
 *       - /url: /settings
 */
export function parseAriaSnapshot(
  snapshot: string,
  options?: { interactive?: boolean }
): RefEntry[] {
  const entries: RefEntry[] = [];
  let counter = 1;

  for (const line of snapshot.split('\n')) {
    // Match lines like: - role "name" [attr=value, ...]
    const match = line.match(/^\s*-\s+(\w+)\s+"([^"]*)"(?:\s+\[([^\]]*)\])?/);
    if (!match) continue;

    const role = match[1]!;
    const name = match[2]!;
    const attrStr = match[3];

    // Filter by role if interactive-only mode
    if (options?.interactive && !INTERACTIVE_ROLES.has(role)) continue;

    // Skip elements without names (they're structural, not actionable)
    if (!name.trim()) continue;

    const attrs: Record<string, string> = {};
    if (attrStr) {
      // Parse attrs like "level=1, disabled, checked=true"
      for (const part of attrStr.split(',')) {
        const trimmed = part.trim();
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          attrs[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
        } else {
          attrs[trimmed] = 'true';
        }
      }
    }

    entries.push({
      ref: `@e${counter++}`,
      role,
      name,
      attrs,
    });
  }

  return entries;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Build a ref map from the page's accessibility tree.
 * Uses locator.ariaSnapshot() (Playwright 1.49+).
 */
export async function buildRefMap(
  page: Page,
  options?: { interactive?: boolean }
): Promise<RefMap> {
  const snapshot = await page.locator('body').ariaSnapshot();

  const entries = parseAriaSnapshot(snapshot, options);
  const byRef = new Map<string, RefEntry>();
  for (const entry of entries) {
    byRef.set(entry.ref, entry);
  }

  const refMap: RefMap = { entries, byRef, rawSnapshot: snapshot, timestamp: Date.now() };
  currentRefMap = refMap;
  return refMap;
}

/**
 * Resolve a @ref to a Playwright Locator.
 * Uses getByRole with name matching for robustness.
 */
export function resolveRef(page: Page, ref: string): Locator {
  if (!currentRefMap) {
    throw new Error('No snapshot taken yet. Run `sweetlink snapshot` first to populate refs.');
  }

  const entry = currentRefMap.byRef.get(ref);
  if (!entry) {
    const available = Array.from(currentRefMap.byRef.keys());
    const preview =
      available.length <= 10
        ? available.join(', ')
        : `${available.slice(0, 8).join(', ')} ... (${available.length - 8} more)`;
    throw new Error(
      `Ref ${ref} is not in the current snapshot (have ${available.length}: ${preview}). ` +
        `If the page changed, re-run \`sweetlink snapshot\` to refresh refs.`
    );
  }

  // Build locator from role + name. Use exact match: a substring match
  // (`exact: false`) returns the FIRST element whose accessible name
  // *contains* the snapshot name, which silently picks the wrong element
  // after the page adds another button starting with the same prefix.
  // checkRefStale only verifies count > 0, so it gives a false negative.
  const locator = page.getByRole(entry.role as Parameters<Page['getByRole']>[0], {
    name: entry.name,
    exact: true,
  });

  return locator;
}

/**
 * Check if a ref is still valid (element exists in DOM).
 * ~5ms overhead vs 30s Playwright timeout on stale refs.
 */
export async function checkRefStale(page: Page, ref: string): Promise<boolean> {
  try {
    const locator = resolveRef(page, ref);
    const count = await locator.count();
    return count === 0;
  } catch {
    return true;
  }
}

/**
 * Format a ref map as human-readable text.
 */
export function formatRefMap(refMap: RefMap): string {
  if (refMap.entries.length === 0) {
    return '(no elements found)';
  }

  const lines: string[] = [];
  for (const entry of refMap.entries) {
    let line = `  ${entry.ref} [${entry.role}] "${entry.name}"`;

    const attrParts: string[] = [];
    for (const [key, value] of Object.entries(entry.attrs)) {
      attrParts.push(value === 'true' ? key : `${key}=${value}`);
    }
    if (attrParts.length > 0) {
      line += ` [${attrParts.join(', ')}]`;
    }

    lines.push(line);
  }

  return lines.join('\n');
}

// ============================================================================
// Baseline / Diff
// ============================================================================

/** Store current snapshot as baseline for future diffs. */
export function setBaseline(): void {
  if (!currentRefMap) throw new Error('No snapshot taken yet. Run `snapshot` first.');
  baselineRefMap = currentRefMap;
}

/** Get the current baseline ref map. */
export function getBaseline(): RefMap | null {
  return baselineRefMap;
}

/** Get the current ref map. */
export function getCurrentRefMap(): RefMap | null {
  return currentRefMap;
}

/** Clear both current and baseline ref maps. */
export function clearRefMaps(): void {
  currentRefMap = null;
  baselineRefMap = null;
}
