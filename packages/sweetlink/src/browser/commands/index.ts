/**
 * Browser Command Handlers
 *
 * Re-exports all command handler functions.
 */

export { handleGetA11y } from './a11y.js';
export { handleQueryDOM } from './dom.js';
export { handleExecJS } from './exec.js';
export { handleGetLogs } from './logs.js';
export { handleGetOutline, extractDocumentOutline, outlineToMarkdown } from './outline.js';
export { handleGetSchema, extractPageSchema, schemaToMarkdown } from './schema.js';
export { handleRequestScreenshot, handleScreenshot } from './screenshot.js';
export { handleGetVitals } from './vitals.js';
