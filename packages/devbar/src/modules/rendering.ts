/**
 * Rendering barrel - re-exports from sub-modules under rendering/.
 *
 * This file exists so that existing import paths
 *   import { render } from './rendering.js'
 * continue to work without changes.
 *
 * The actual implementation is split across:
 *   rendering/collapsed.ts  - collapsed bar rendering
 *   rendering/compact.ts    - compact mode
 *   rendering/expanded.ts   - expanded bar, info section, metrics, custom controls
 *   rendering/buttons.ts    - button creators (screenshot, a11y, schema, etc.)
 *   rendering/console.ts    - console popup
 *   rendering/modals.ts     - outline, schema, a11y, design review modals
 *   rendering/settings.ts   - settings popover
 *   rendering/common.ts     - shared helpers (connection indicator, dot position)
 */
export { render } from './rendering/index.js';
