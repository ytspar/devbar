/**
 * Exec Command Handlers
 *
 * Handles JavaScript execution commands.
 *
 * SECURITY WARNING: This module executes arbitrary JavaScript for debugging.
 * It is restricted to localhost connections and development environments only.
 */

import type { ExecJsCommand, SweetlinkResponse } from '../../types.js';

const MAX_CODE_LENGTH = 10000;
const SCRIPT_RESULT_KEY = '__sweetlink_exec_result__';

function errorResponse(error: string): SweetlinkResponse {
  return { success: false, error, timestamp: Date.now() };
}

/**
 * Check whether an error was caused by CSP blocking `unsafe-eval`.
 */
function isCspEvalBlocked(error: unknown): boolean {
  return (
    error instanceof EvalError ||
    (error instanceof DOMException && error.message.includes('unsafe-eval'))
  );
}

/**
 * Execute code via inline `<script>` tag injection.
 * Works on pages where CSP allows 'unsafe-inline' but not 'unsafe-eval'.
 */
function execViaScriptTag(code: string): unknown {
  const global = window as unknown as Record<string, unknown>;
  delete global[SCRIPT_RESULT_KEY];

  const script = document.createElement('script');
  script.textContent = `window["${SCRIPT_RESULT_KEY}"] = (function(){ return (${code}); })()`;
  document.documentElement.appendChild(script);
  script.remove();

  const result = global[SCRIPT_RESULT_KEY];
  delete global[SCRIPT_RESULT_KEY];
  return result;
}

/**
 * Handle exec-js command with security guards
 */
export function handleExecJS(command: ExecJsCommand): SweetlinkResponse {
  // Security: Block in production environments
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    return errorResponse('exec-js is disabled in production for security reasons');
  }

  if (!command.code) {
    return errorResponse('Code is required');
  }

  if (typeof command.code !== 'string') {
    return errorResponse('Code must be a string');
  }

  if (command.code.length > MAX_CODE_LENGTH) {
    return errorResponse(`Code exceeds maximum length of ${MAX_CODE_LENGTH} characters`);
  }

  try {
    let result: unknown;
    try {
      // eslint-disable-next-line no-eval
      result = (0, eval)(command.code);
    } catch (evalError) {
      if (isCspEvalBlocked(evalError)) {
        result = execViaScriptTag(command.code);
      } else {
        throw evalError;
      }
    }

    return {
      success: true,
      data: {
        result: typeof result === 'object' ? JSON.parse(JSON.stringify(result)) : result,
        type: typeof result,
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Execution failed');
  }
}
