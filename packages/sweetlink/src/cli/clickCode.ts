/**
 * Click-code generation for the CLI `click` command.
 *
 * Extracted from sweetlink.ts so the generated code's DOM semantics are unit
 * testable against a real document (the CLI module runs its dispatch on
 * import, which makes importing helpers from it impractical in tests).
 */

/**
 * Elements considered click targets when resolving a bare `--text` match.
 * Used inside the generated code via `closest()`, so a text leaf inside a
 * button resolves to the button itself.
 */
export const INTERACTIVE_SELECTOR =
  'button, a[href], [role="button"], input, summary, label, [onclick]';

export type ClickStrategy =
  /** Explicit selector scoping for --text: the user chose the candidates. */
  | { type: 'text'; text: string; selector: string }
  /**
   * Bare `--text` (no selector). Naively filtering `*` by textContent
   * matches every ANCESTOR of the target too (html, body, main, …) and
   * index 0 clicks `<html>` — a no-op. This strategy is leaf-most and
   * clickable-preferred instead.
   */
  | { type: 'smart-text'; text: string }
  | { type: 'selector'; selector: string };

export function generateClickCode(strategy: ClickStrategy, index: number): string {
  // The element-finding expression differs, but the bounds-check + click + return is shared
  let findExpression: string;
  let notFoundMsg: string;

  if (strategy.type === 'smart-text') {
    const escapedText = JSON.stringify(strategy.text);
    // 1. Leaf-most: keep only matches with no child element that also
    //    matches — kills the ancestor chain (html/body/main/...).
    // 2. Clickable-preferred: for each leaf, click the nearest interactive
    //    element (closest() starts at the leaf itself), falling back to
    //    the leaf when no interactive ancestor exists.
    // 3. Dedupe in document order — several text leaves can share one
    //    button — then --index picks among the deduped targets.
    findExpression = `(() => {
          const matchesText = (el) => el.textContent && el.textContent.includes(${escapedText});
          const leaves = Array.from(document.querySelectorAll("*"))
            .filter(matchesText)
            .filter((el) => !Array.from(el.children).some(matchesText));
          const interactive = ${JSON.stringify(INTERACTIVE_SELECTOR)};
          const targets = [];
          for (const leaf of leaves) {
            const target = leaf.closest(interactive) || leaf;
            if (!targets.includes(target)) targets.push(target);
          }
          return targets;
        })()`;
    notFoundMsg = `"No element found with text: " + ${escapedText}`;
  } else if (strategy.type === 'text') {
    const escapedSelector = JSON.stringify(strategy.selector);
    const escapedText = JSON.stringify(strategy.text);
    findExpression = `Array.from(document.querySelectorAll(${escapedSelector})).filter(el => el.textContent?.includes(${escapedText}))`;
    notFoundMsg = `"No element found with text: " + ${escapedText}`;
  } else {
    const escapedSelector = JSON.stringify(strategy.selector);
    findExpression = `Array.from(document.querySelectorAll(${escapedSelector}))`;
    notFoundMsg = `"No element found matching: " + ${escapedSelector}`;
  }

  return `
      (() => {
        const elements = ${findExpression};
        if (elements.length === 0) {
          return { success: false, error: ${notFoundMsg} };
        }
        const target = elements[${index}];
        if (!target) {
          return { success: false, error: "Index ${index} out of bounds, found " + elements.length + " elements" };
        }
        target.click();
        return { success: true, clicked: target.tagName + (target.className ? "." + target.className.split(" ")[0] : ""), found: elements.length };
      })()
    `;
}
