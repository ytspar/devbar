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
 * Chrome may throw EvalError, DOMException, or a generic Error depending on version.
 */
function isCspEvalBlocked(error: unknown): boolean {
  if (error instanceof EvalError) return true;
  if (
    error instanceof Error &&
    (error.message.includes('unsafe-eval') || error.message.includes('Content Security Policy'))
  ) {
    return true;
  }
  return false;
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
 * Check if code contains a bare `return` statement (not inside a function).
 * If so, wrap in an IIFE so the return is valid.
 */
function maybeWrapReturn(code: string): string {
  // Detect bare return: a line starting with `return` (ignoring leading whitespace)
  if (/^\s*return\b/m.test(code)) {
    return `(function(){ ${code} })()`;
  }
  return code;
}

/**
 * If the result is a thenable (Promise), await it with a timeout.
 */
async function maybeAwaitResult(result: unknown, timeoutMs = 10000): Promise<unknown> {
  if (
    result &&
    typeof result === 'object' &&
    'then' in result &&
    typeof (result as { then: unknown }).then === 'function'
  ) {
    return Promise.race([
      result as Promise<unknown>,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Async result timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }
  return result;
}

/**
 * Handle exec-js command with security guards
 */
export async function handleExecJS(command: ExecJsCommand): Promise<SweetlinkResponse> {
  // Security: Block in production environments
  const isNodeProd = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
  const isViteProd =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as Record<string, Record<string, unknown>>).env?.PROD === true;
  if (isNodeProd || isViteProd) {
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
    const code = maybeWrapReturn(command.code);
    let result: unknown;
    try {
      // eslint-disable-next-line no-eval
      result = (0, eval)(code);
    } catch (evalError) {
      if (isCspEvalBlocked(evalError)) {
        result = execViaScriptTag(code);
      } else {
        throw evalError;
      }
    }

    // Await Promises (e.g. fetch().then(...)) with a timeout
    result = await maybeAwaitResult(result);

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
