// DevBar - Development toolbar and utilities
// Pure vanilla JavaScript - no framework dependencies

// Main vanilla JS devbar
export {
  GlobalDevBar,
  initGlobalDevBar,
  getGlobalDevBar,
  destroyGlobalDevBar,
  earlyConsoleCapture,
} from './GlobalDevBar.js';

// Re-export types
export type {
  GlobalDevBarOptions,
  DevBarControl,
  ConsoleLog,
  SweetlinkCommand,
  OutlineNode,
  PageSchema,
} from './types.js';

// Re-export utilities for external use
export {
  formatArg,
  formatArgs,
  canvasToDataUrl,
  prepareForCapture,
  delay,
  copyCanvasToClipboard,
} from './utils.js';

// Re-export outline/schema functions
export { extractDocumentOutline, outlineToMarkdown } from './outline.js';
export { extractPageSchema, schemaToMarkdown } from './schema.js';

// Re-export constants and theme utilities
export {
  TAILWIND_BREAKPOINTS,
  BUTTON_COLORS,
  CATEGORY_COLORS,
  DEVBAR_THEME,
  COLORS,
  FONT_MONO,
  generateThemeCSSVars,
  injectThemeCSS,
  generateBreakpointCSS,
  type TailwindBreakpoint,
  type DevBarTheme,
  type DevBarThemeInput,
} from './constants.js';

// Early console capture script for injection
export { EARLY_CONSOLE_CAPTURE_SCRIPT } from './earlyConsoleCapture.js';
