/**
 * Pixel Ruler Tool
 *
 * Injects measurement overlays onto a webpage for visual verification.
 * Used with Playwright to measure and verify element positioning.
 *
 * @module ruler
 */

import * as fs from 'fs';
import { getBrowser } from './playwright.js';

export interface MeasurementOptions {
  /** CSS selectors for elements to measure */
  selectors: string[];
  /** Show center lines (horizontal and vertical) */
  showCenterLines?: boolean;
  /** Show dimension labels (width x height) */
  showDimensions?: boolean;
  /** Show position labels (top, left) */
  showPosition?: boolean;
  /** Colors for different elements (cycles through) */
  colors?: string[];
  /** Limit number of elements per selector (default: 5) */
  limit?: number;
  /** Show alignment comparison between first two selectors */
  showAlignment?: boolean;
}

export interface ElementMeasurement {
  index: number;
  rect: { top: number; left: number; width: number; height: number };
  centerX: number;
  centerY: number;
}

export interface MeasurementResult {
  selector: string;
  elements: ElementMeasurement[];
}

export interface RulerOutput {
  results: MeasurementResult[];
  summary: string;
  alignment?: {
    verticalOffset: number;
    horizontalOffset: number;
    aligned: boolean;
  };
}

/**
 * JavaScript function to inject into the page.
 * Creates visual measurement overlays on elements.
 */
export const measureElementsScript = `
(function(options) {
  const {
    selectors = [],
    showCenterLines = true,
    showDimensions = true,
    showPosition = false,
    colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
    limit = 5,
    showAlignment = true
  } = options || {};

  // Remove any existing measurement overlay
  const existingOverlay = document.getElementById('pixel-ruler-overlay');
  if (existingOverlay) existingOverlay.remove();

  // Create SVG overlay
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'pixel-ruler-overlay';
  svg.style.cssText = \`
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 999999;
  \`;
  document.body.appendChild(svg);

  const results = [];
  let allRects = [];

  // Process each selector
  selectors.forEach((selector, selectorIndex) => {
    const color = colors[selectorIndex % colors.length];
    const elements = document.querySelectorAll(selector);
    const selectorResult = { selector, elements: [] };

    Array.from(elements).slice(0, limit).forEach((element, elementIndex) => {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      selectorResult.elements.push({
        index: elementIndex,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        centerX,
        centerY
      });

      allRects.push({ rect, centerX, centerY, color, selector, elementIndex });

      // Draw bounding box
      const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      box.setAttribute('x', rect.left);
      box.setAttribute('y', rect.top);
      box.setAttribute('width', rect.width);
      box.setAttribute('height', rect.height);
      box.setAttribute('fill', 'none');
      box.setAttribute('stroke', color);
      box.setAttribute('stroke-width', '2');
      box.setAttribute('stroke-dasharray', '4,2');
      svg.appendChild(box);

      // Draw center lines
      if (showCenterLines) {
        // Horizontal center line
        const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        hLine.setAttribute('x1', rect.left);
        hLine.setAttribute('y1', centerY);
        hLine.setAttribute('x2', rect.left + rect.width);
        hLine.setAttribute('y2', centerY);
        hLine.setAttribute('stroke', color);
        hLine.setAttribute('stroke-width', '1');
        hLine.setAttribute('stroke-dasharray', '2,2');
        svg.appendChild(hLine);

        // Vertical center line
        const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        vLine.setAttribute('x1', centerX);
        vLine.setAttribute('y1', rect.top);
        vLine.setAttribute('x2', centerX);
        vLine.setAttribute('y2', rect.top + rect.height);
        vLine.setAttribute('stroke', color);
        vLine.setAttribute('stroke-width', '1');
        vLine.setAttribute('stroke-dasharray', '2,2');
        svg.appendChild(vLine);

        // Center point
        const centerDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        centerDot.setAttribute('cx', centerX);
        centerDot.setAttribute('cy', centerY);
        centerDot.setAttribute('r', '4');
        centerDot.setAttribute('fill', color);
        svg.appendChild(centerDot);
      }

      // Draw dimension labels
      if (showDimensions) {
        // Position the label OUTSIDE the bbox so it doesn't overlap
        // page content. Default: above the bbox (top); fall back below
        // when the element is at the very top of the page.
        const dimLabel = \`\${Math.round(rect.width)}×\${Math.round(rect.height)}\`;
        const labelHeight = 22;
        const labelW = Math.max(70, dimLabel.length * 9);
        const goAbove = rect.top >= labelHeight + 4;
        const ly = goAbove ? rect.top - labelHeight - 2 : rect.top + rect.height + 2;
        const lx = rect.left;

        const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        labelBg.setAttribute('x', lx);
        labelBg.setAttribute('y', ly);
        labelBg.setAttribute('width', String(labelW));
        labelBg.setAttribute('height', String(labelHeight));
        labelBg.setAttribute('fill', color);
        labelBg.setAttribute('rx', '3');
        svg.appendChild(labelBg);

        const dimText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        dimText.setAttribute('x', lx + labelW / 2);
        dimText.setAttribute('y', ly + 15);
        dimText.setAttribute('fill', '#ffffff');
        dimText.setAttribute('font-family', 'system-ui, sans-serif');
        dimText.setAttribute('font-size', '13');
        dimText.setAttribute('font-weight', '700');
        dimText.setAttribute('text-anchor', 'middle');
        dimText.textContent = dimLabel;
        svg.appendChild(dimText);
      }

      // Draw position labels (separate, opposite side of dim label)
      if (showPosition) {
        const posText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        // Position label below-right outside the bbox.
        posText.setAttribute('x', rect.left + rect.width + 4);
        posText.setAttribute('y', rect.top + 14);
        posText.setAttribute('fill', color);
        posText.setAttribute('font-family', 'system-ui, sans-serif');
        posText.setAttribute('font-size', '12');
        posText.textContent = \`(\${Math.round(rect.left)}, \${Math.round(rect.top)})\`;
        svg.appendChild(posText);
      }
    });

    results.push(selectorResult);
  });

  // Show alignment comparison between elements
  let alignment = null;
  if (showAlignment && allRects.length >= 2) {
    const first = allRects[0];
    const second = allRects[1];

    // Draw alignment line between centers
    const alignLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    alignLine.setAttribute('x1', first.centerX);
    alignLine.setAttribute('y1', first.centerY);
    alignLine.setAttribute('x2', second.centerX);
    alignLine.setAttribute('y2', second.centerY);
    alignLine.setAttribute('stroke', '#ffffff');
    alignLine.setAttribute('stroke-width', '2');
    svg.appendChild(alignLine);

    // Calculate vertical offset
    const verticalOffset = Math.round(first.centerY - second.centerY);
    const horizontalOffset = Math.round(first.centerX - second.centerX);

    // Offset label
    const midX = (first.centerX + second.centerX) / 2;
    const midY = (first.centerY + second.centerY) / 2;

    const offsetLabel = \`Δy=\${verticalOffset}px  Δx=\${horizontalOffset}px\`;
    const offsetW = Math.max(140, offsetLabel.length * 9);
    const offsetH = 28;
    const offsetBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    offsetBg.setAttribute('x', midX - offsetW / 2);
    offsetBg.setAttribute('y', midY - offsetH / 2);
    offsetBg.setAttribute('width', String(offsetW));
    offsetBg.setAttribute('height', String(offsetH));
    offsetBg.setAttribute('fill', 'rgba(20,20,20,0.95)');
    offsetBg.setAttribute('rx', '4');
    svg.appendChild(offsetBg);

    const offsetText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    offsetText.setAttribute('x', midX);
    offsetText.setAttribute('y', midY + 6);
    offsetText.setAttribute('fill', '#ffffff');
    offsetText.setAttribute('font-family', 'system-ui, sans-serif');
    offsetText.setAttribute('font-size', '14');
    offsetText.setAttribute('font-weight', '700');
    offsetText.setAttribute('text-anchor', 'middle');
    offsetText.textContent = offsetLabel;
    svg.appendChild(offsetText);

    alignment = {
      verticalOffset,
      horizontalOffset,
      aligned: Math.abs(verticalOffset) <= 2 && Math.abs(horizontalOffset) <= 2
    };
  }

  return {
    results,
    summary: results.map(r => \`\${r.selector}: \${r.elements.length} elements\`).join(', '),
    alignment
  };
})
`;

/**
 * Measure elements and inject visual overlay using Playwright
 */
export async function measureViaPlaywright(options: {
  selectors: string[];
  url?: string;
  output?: string;
  showCenterLines?: boolean;
  showDimensions?: boolean;
  showPosition?: boolean;
  showAlignment?: boolean;
  limit?: number;
  colors?: string[];
  verbose?: boolean;
}): Promise<RulerOutput & { screenshotPath?: string }> {
  const { browser, page } = await getBrowser(options.url);

  try {
    // Inject the measurement overlay
    if (options.verbose) console.log('[Sweetlink Ruler] Injecting measurement overlay...');

    const measureOptions: MeasurementOptions = {
      selectors: options.selectors,
      showCenterLines: options.showCenterLines ?? true,
      showDimensions: options.showDimensions ?? true,
      showPosition: options.showPosition ?? false,
      showAlignment: options.showAlignment ?? true,
      limit: options.limit ?? 5,
      colors: options.colors,
    };

    const result = (await page.evaluate(
      `(${measureElementsScript})(${JSON.stringify(measureOptions)})`
    )) as RulerOutput;

    if (options.verbose) console.log(`[Sweetlink Ruler] Measured: ${result.summary}`);

    if (result.alignment) {
      const { verticalOffset, horizontalOffset, aligned } = result.alignment;
      if (options.verbose)
        console.log(
          `[Sweetlink Ruler] Alignment: Δy=${verticalOffset}px, Δx=${horizontalOffset}px ${aligned ? '✓ ALIGNED' : '✗ NOT ALIGNED'}`
        );
    }

    // Take screenshot if output path provided
    let screenshotPath: string | undefined;
    if (options.output) {
      // Ensure directory exists
      const dir = options.output.substring(0, options.output.lastIndexOf('/'));
      if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // If any measured element extends below the viewport, capture the
      // full page so all overlays are visible — otherwise users see
      // half their highlights cut off. (page.viewportSize is missing
      // from some test doubles, hence the typeof guard.)
      const vp = typeof page.viewportSize === 'function' ? page.viewportSize() : null;
      const extendsBelow = vp
        ? result.results.some((r) => r.elements.some((e) => e.rect.top + e.rect.height > vp.height))
        : false;
      await page.screenshot({ path: options.output, fullPage: extendsBelow });
      screenshotPath = options.output;
      if (options.verbose) {
        console.log(
          `[Sweetlink Ruler] Screenshot saved to: ${options.output}` +
            (extendsBelow ? ' (full page — measured elements extend below viewport)' : '')
        );
      }
    }

    return { ...result, screenshotPath };
  } finally {
    if (options.verbose) console.log('[Sweetlink Ruler] Closing browser...');
    await browser.close();
  }
}

/**
 * Preset measurement for card headers (title + wing alignment)
 */
export function getCardHeaderPreset(): MeasurementOptions {
  return {
    selectors: [
      'article h2', // Card title text
      'article header > div:first-child', // Left wing (border line)
    ],
    showCenterLines: true,
    showDimensions: true,
    showAlignment: true,
    limit: 3,
  };
}

/**
 * Preset measurement for navigation items
 */
export function getNavigationPreset(): MeasurementOptions {
  return {
    selectors: ['nav a', 'nav button'],
    showCenterLines: true,
    showDimensions: true,
    showAlignment: true,
    limit: 10,
  };
}
