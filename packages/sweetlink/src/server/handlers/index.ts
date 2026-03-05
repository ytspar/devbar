/**
 * Server Handlers
 *
 * Re-exports all handler functions.
 */

export { type A11ySaveResult, handleSaveA11y } from './a11y.js';
export { type ConsoleLogsSaveResult, handleSaveConsoleLogs } from './consoleLogs.js';
export {
  DESIGN_REVIEW_PROMPT,
  type DesignReviewResult,
  handleDesignReviewScreenshot,
} from './designReview.js';
export { type HmrScreenshotResult, handleHmrScreenshot } from './hmr.js';
export { handleSaveOutline, type OutlineSaveResult } from './outline.js';
export { saveMarkdownArtifact } from './saveMarkdown.js';
export { handleSaveSchema, type SchemaSaveResult } from './schema.js';
export { handleSaveScreenshot } from './screenshot.js';
export {
  type DevBarSettings,
  handleLoadSettings,
  handleSaveSettings,
  type SettingsSaveResult,
} from './settings.js';
