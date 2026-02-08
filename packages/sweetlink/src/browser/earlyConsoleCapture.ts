/**
 * Early Console Capture Script
 *
 * This script captures console logs BEFORE the application initializes, which is critical
 * for catching early-stage errors. It must be injected into the HTML <head> as an inline script.
 *
 * The script creates `window.__sweetlinkEarlyLogs` which ConsoleCapture will pick up
 * via `importEarlyLogs()`, merging these early logs with subsequent console output.
 *
 * @example
 * ```typescript
 * import { EARLY_CONSOLE_CAPTURE_SCRIPT } from '@ytspar/sweetlink';
 * // Inject as inline script in HTML head
 * ```
 */
export const EARLY_CONSOLE_CAPTURE_SCRIPT = `
(function() {
  if (window.__sweetlinkEarlyLogs) return;
  window.__sweetlinkEarlyLogs = [];
  var orig = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info
  };
  function formatArg(a) {
    if (a instanceof Error) {
      return a.name + ': ' + a.message + (a.stack ? '\\n' + a.stack : '');
    }
    if (typeof a === 'object' && a !== null) {
      try {
        return JSON.stringify(a, function(key, val) {
          if (val instanceof Error) {
            return val.name + ': ' + val.message;
          }
          return val;
        });
      } catch(e) {
        return String(a);
      }
    }
    return String(a);
  }
  function capture(level, args) {
    window.__sweetlinkEarlyLogs.push({
      level: level,
      message: Array.from(args).map(formatArg).join(' '),
      timestamp: new Date().toISOString()
    });
  }
  console.log = function() { capture('log', arguments); orig.log.apply(console, arguments); };
  console.error = function() { capture('error', arguments); orig.error.apply(console, arguments); };
  console.warn = function() { capture('warn', arguments); orig.warn.apply(console, arguments); };
  console.info = function() { capture('info', arguments); orig.info.apply(console, arguments); };
  window.addEventListener('error', function(e) {
    window.__sweetlinkEarlyLogs.push({
      level: 'error',
      message: 'Uncaught ' + (e.error ? formatArg(e.error) : e.message) + ' at ' + e.filename + ':' + e.lineno + ':' + e.colno,
      timestamp: new Date().toISOString()
    });
  });
  window.addEventListener('unhandledrejection', function(e) {
    window.__sweetlinkEarlyLogs.push({
      level: 'error',
      message: 'Unhandled Promise Rejection: ' + formatArg(e.reason),
      timestamp: new Date().toISOString()
    });
  });
})();
`;

/**
 * Type declaration for the window object with early logs
 * Use this to type-check access to early logs in your app
 */
declare global {
  interface Window {
    __sweetlinkEarlyLogs?: Array<{
      level: string;
      message: string;
      timestamp: string;
    }>;
  }
}
