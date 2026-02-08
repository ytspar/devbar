/**
 * DOM Command Handlers
 *
 * Handles DOM query commands from the server.
 */

import type { QueryDomCommand, SweetlinkResponse } from '../../types.js';

/**
 * Handle query-dom command
 */
export function handleQueryDOM(command: QueryDomCommand): SweetlinkResponse {
  try {
    if (!command.selector) {
      return {
        success: false,
        error: 'Selector is required',
        timestamp: Date.now(),
      };
    }

    const elements = document.querySelectorAll(command.selector);

    if (elements.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          count: 0,
          elements: [],
        },
        timestamp: Date.now(),
      };
    }

    const results = Array.from(elements).map((el, index) => {
      const result: Record<string, unknown> = {
        index,
        tagName: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || null,
        textContent: el.textContent?.slice(0, 200) || null,
      };

      if (command.property) {
        const prop = command.property;
        if (prop === 'computedStyle') {
          const style = window.getComputedStyle(el);
          result.computedStyle = {
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            position: style.position,
          };
        } else if (prop === 'boundingRect') {
          result.boundingRect = el.getBoundingClientRect();
        } else if (prop === 'attributes') {
          result.attributes = Object.fromEntries(
            Array.from(el.attributes).map((attr) => [attr.name, attr.value])
          );
        } else {
          result[prop] = (el as unknown as Record<string, unknown>)[prop];
        }
      }

      return result;
    });

    return {
      success: true,
      data: {
        found: true,
        count: elements.length,
        elements: results,
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Query failed',
      timestamp: Date.now(),
    };
  }
}
