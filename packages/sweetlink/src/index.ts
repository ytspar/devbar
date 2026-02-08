/**
 * @ytspar/sweetlink
 *
 * Autonomous development toolkit for AI agents
 */

// Browser utilities (for use by devbar and other packages)
export {
  ConsoleCapture,
  type ConsoleCaptureConfig,
  type ConsoleCaptureState,
  createErrorHandler,
  createRejectionHandler,
  formatArg,
  formatArgs,
  type LogChangeListener,
  MAX_CONSOLE_LOGS,
  type OriginalConsoleMethods,
} from './browser/consoleCapture.js';
export { EARLY_CONSOLE_CAPTURE_SCRIPT } from './browser/earlyConsoleCapture.js';
// Browser client component (vanilla JS - no React dependency)
export { SweetlinkBridge, type SweetlinkBridgeConfig } from './browser/SweetlinkBridge.js';
export {
  canvasToDataUrl,
  copyCanvasToClipboard,
  DEFAULT_SCREENSHOT_QUALITY,
  DEFAULT_SCREENSHOT_SCALE,
  DESIGN_REVIEW_SCALE,
  DEVBAR_SCREENSHOT_QUALITY,
  delay,
  extractBase64FromDataUrl,
  gatherScreenshotMetadata,
  getMediaTypeFromDataUrl,
  prepareForCapture,
  type ScaleCanvasOptions,
  type ScreenshotMetadata,
  scaleCanvas,
  type ToDataUrlOptions,
} from './browser/screenshotUtils.js';
// CDP integration
export {
  detectCDP,
  execJSViaCDP,
  findLocalDevPage,
  getCDPBrowser,
  getConsoleLogsViaCDP,
  getNetworkRequestsViaCDP,
  getPerformanceMetricsViaCDP,
  queryDOMViaCDP,
  screenshotViaCDP,
  testCDPConnection,
} from './cdp.js';
export type {
  ElementMeasurement,
  MeasurementOptions,
  MeasurementResult,
  RulerOutput,
} from './ruler.js';
// Pixel Ruler for visual measurement
export {
  getCardHeaderPreset,
  getNavigationPreset,
  measureElementsScript,
  measureViaPlaywright,
  removeRulerScript,
} from './ruler.js';
export type { InitSweetlinkOptions } from './server.js';
// Server infrastructure
export { closeSweetlink, getAssociatedAppPort, getSweetlinkPort, initSweetlink } from './server.js';
// Shared types
export type {
  ApiKeyStatusCommand,
  BrowserClientReadyCommand,
  ChannelSubscribeCommand,
  ChannelSubscription,
  ChannelUnsubscribeCommand,
  CheckApiKeyCommand,
  ConsoleLog,
  DesignReviewErrorCommand,
  DesignReviewSavedCommand,
  DesignReviewScreenshotCommand,
  ExecJsCommand,
  GetLogsCommand,
  GetNetworkCommand,
  HmrScreenshotCommand,
  HmrScreenshotData,
  LoadSettingsCommand,
  LogEventCommand,
  LogSubscribeCommand,
  LogSubscription,
  LogUnsubscribeCommand,
  OutlineErrorCommand,
  OutlineNode,
  OutlineSavedCommand,
  PageSchema,
  QueryDomCommand,
  RefreshCommand,
  RequestScreenshotCommand,
  SaveOutlineCommand,
  SaveSchemaCommand,
  SaveScreenshotCommand,
  SaveSettingsCommand,
  SchemaErrorCommand,
  SchemaSavedCommand,
  ScreenshotCommand,
  ScreenshotResponseCommand,
  ScreenshotSavedCommand,
  ServerInfo,
  SettingsErrorCommand,
  SettingsLoadedCommand,
  SettingsSavedCommand,
  SweetlinkCommand,
  SweetlinkResponse,
} from './types.js';
// URL utilities
export {
  formatTimestampForFilename,
  generateBaseFilename,
  generateSlugFromUrl,
  HMR_SCREENSHOT_DIR,
  MAX_LOG_MESSAGE_LENGTH,
  MAX_SLUG_LENGTH,
  SCREENSHOT_DIR,
  truncateMessage,
} from './urlUtils.js';
// Viewport utilities (shared by CDP and Playwright)
export {
  DEFAULT_VIEWPORT,
  parseViewport,
  VIEWPORT_PRESETS,
  type ViewportConfig,
} from './viewportUtils.js';
