/**
 * devbar Icons
 *
 * SVG icon creation utilities for the devbar UI.
 */

/**
 * Create an SVG icon element with the given path data
 */
export function createSvgIcon(
  pathData: string,
  options: {
    viewBox?: string;
    fill?: boolean;
    stroke?: boolean;
  }
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', options.viewBox || '0 0 24 24');

  if (options.fill) {
    svg.style.fill = 'currentColor';
  }
  if (options.stroke) {
    svg.style.stroke = 'currentColor';
    svg.style.fill = 'none';
  }

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);

  return svg;
}

// ============================================================================
// devbar Logo — Pixel-art wordmark
// ============================================================================

/** devbar wordmark viewBox dimensions */
export const DEVBAR_LOGO_VIEWBOX = '0 0 580.43 167.62';

/** devbar logo colors */
export const DEVBAR_LOGO_COLORS = {
  /** Emerald green for dark mode */
  dark: '#10b981',
  /** Darker emerald for light mode */
  light: '#047857',
} as const;

/** devbar wordmark letter path data */
export const DEVBAR_LOGO_PATHS = {
  d: 'M73.46,161.67l-6.41-.16-.1-7.56-5.52-.09v-21.54s6.94-.1,6.94-.1l.03-29.61,7.14-.19.25-22.45,9.06-.26.22-8.19,8.82-.08.32-5.87,30.1-.03.26,5.83,7.76-.07.08-20.29,6.17-.14-.02-21.58h26.12s.03,11.73.03,11.73l-3.46.3-.05,22.8-6.68.14-.05,32.83-6.94.1-.04,34.47-7.86.33-.05,34.45h-26.66s-.13-6.81-.13-6.81l-3.2.08-.05,1.8-5.88.18-.27,5.94h-29.79s-.13-5.95-.13-5.95ZM109.74,139.54l6.11-.13.07-19.02,6.12-.26.16-12.27,2.82-.52v-12.89s-3.8-.49-3.8-.49l-.37-8.03-15.85.03-.2,6.24-6.19.14-.04,22.21-8.52.15v24.28s3.28.13,3.28.13l.05,7.83,16.17.05.19-7.45Z',
  e: 'M200.68,148.2l.13-8.62,7.57-.15.25-5.78,26.28-.19.04,5.66-4.84.24-.1,11.5-4.74.06-.15,7.09-4.52.16-.33,4.81-9.7.28-.07,4.36-41.06.02-.18-6.21-8.02-.24-.27-7.17-6.21-.21.13-17.79,4.92-.37.02-32.36,8.3-.13.09-19.13,5.63-.15.36-6.19,5.74-.28.27-5.76,6.21-.22.18-5.85h45.06s.35,5.93.35,5.93l5.5.23.31,5.65,6.41.14v28.86s-5.29.2-5.29.2l-.09,15.01h-54.52s-.17,15.16-.17,15.16l-2.48.57v10.93M188.1,106.02l28.63-.03.07-22.28-21.6-.03-.33,10.73-6.93.27.16,11.34Z',
  v: 'M325.06,99.7l-7.88.15-.03,14.96-7.72.07-.04,16.62-6.64.14-.12,16.18-5.95.06-.16,7.13-4.53.12-.29,11.35-30.22-.07v-29.09s-4.87-.31-4.87-.31l-.02-44.28-4.87-.18v-26.98s25.36,0,25.36,0l.17,63.22c3.26.33,6.23.24,9.58-.06l.02-14.7,6.71-.23.05-17.25,7.87-.42.2-16.13,6.28-.32.07-14.13,26.57-.03.18,5.94-2.99.18-.12,11.36-6.39.34-.23,16.35Z',
  b: 'M390.29,158.27l-.23,8.17h-28.6s.2-5.07.2-5.07l-8.04-.22.02-1.68-7.02.08-.19,6.91-21.06-.08-.14-26.82,5.48-.22.27-21.16,5.39-.31.08-21.12,5.46-.18.22-26.59,6.2-.41.26-21.44,4.93-.15.2-18.51,24.28-.18v22.97s-6.52.12-6.52.12l.06,19.15,7.37-.12.16-5.88h28.13s.25,5.77.25,5.77l4.95.13.18,5.76,5.04.45-.07,30.61-4.86.44-.17,22.83-7.23.34-.11,16.6-6.12.39-.19,9.31-8.57.09ZM387.51,93.06l-.14-7.17c-3.48,0-15.85.05-19.09-.09l-.09,8-5.99.29-.02,28.81-6.95.14.03,16.09,4.11.23.12,7.77h16.31s0-7.6,0-7.6l6.41-.11.06-15.85,5.2-.06',
  a: 'M417.64,131.33l5.08-.1.2-9.47,7.45-.4.08-9.51,11.77-.12.21-5.99c3.64-.42,13.39,1.12,16.29-1.73l11.65-.23.32-6.23,8.81-.24.09-15.84-19.56-.04-.18,5.74-5.19.25v7.51s-23.11.1-23.11.1l-.32-7.21,2.65-.48.06-9.69,8.57-.15.22-8.1,7.93-.09.21-5.92h42.51s.43,5.82.43,5.82l5.32.19.4,5.74,5.9.32.16,29.4-7.26.25v30.71s-6.5.14-6.5.14v19.98s5.11.32,5.11.32v8.03s-26.37.03-26.37.03l-.24-9.44-5.85-.1-.2,4.78-6.35.1-.16,5.78-29.43-.02-.09-4.57-5-.14-.15-5.88-5.51-.19.03-23.34ZM461.97,145.81l.23-3.91,5.51-.09.05-8.29,6.01-.1-.04-17.33-10,.04-.12,4.69-10.87.13-.39,6.02-5.98.34v18.47s15.61.04,15.61.04Z',
  r: 'M506.46,149.81l5.3-.22.03-28.17,6.48-.13.15-25.67,6.65-.35.02-29.71,22.63.18c-.07,2.81-.13,8.82-.04,11.59l7.1.1.27-4.36,6.49-.41.17-7.1,18.69-.02.04,24.62-27.68.06-.14,6.53-7.65.21-.14,22.22-6,.42-.06,23.2-5.78.25-.02,23.4-26.5-.03',
  dLeftEdge:
    'M59.47,37.37l.06,5.59-8.51.05-.12,6.47-7.89-.1v2.81s-2.22.06-2.22.06l-.1,6.93-9.9.25-.11,6.27-7.16.17-.05,7.97-5.32.18v21.01s11.16.19,11.16.19l.19,6.35,9.28.08.16,6.01,20.67.19.13,6.5-46.46-.14-.48-7.41-7.36-.44-.24-6.74-5.19-.23.13-21.7,6.84-.44.06-8.58,6.33-.23.09-7.19h6.27s.12-5.64.12-5.64l6.01-.1.52-4.41,5.36-.32.34-3.85,5.9-.31.46-3.45,7.54-.18.14-5.53,9.44-.07',
} as const;

/** devbar wordmark polyline/polygon data */
export const DEVBAR_LOGO_SHAPES = {
  topBar:
    '214.17 22.67 204.58 22.7 204.66 15.98 196.08 15.68 195.86 7.9 148.96 7.93 148.81 13.79 114.91 13.79 114.94 7.24 143.91 7.19 144.14 0 214.17 0',
  dStep1: '114.43 21.6 92.3 21.3 92.17 14.42 114.63 14.43 114.43 21.6',
  dStep2: '91.89 29.07 73.29 29.04 73.34 21.96 91.87 21.65 91.89 29.07',
  dStep3: '72.95 35.82 59.81 35.85 59.8 29.34 72.79 29.46 72.95 35.82',
  dCounter:
    '109.74 139.54 109.55 146.99 93.38 146.94 93.33 139.12 90.04 138.99 90.04 114.71 98.57 114.55 98.61 92.35 104.8 92.21 105 85.97 120.85 85.93 121.22 93.96 125.02 94.45 125.03 107.34 122.21 107.86 122.05 120.14 115.92 120.4 115.85 139.42 109.74 139.54',
  eCounter:
    '188.1 106.02 187.94 94.68 194.87 94.41 195.2 83.68 216.81 83.71 216.73 105.99 188.1 106.02',
} as const;

export interface CreateLogoOptions {
  /** Width in pixels (default: 32) */
  width?: number;
  /** Height in pixels (default: 32) */
  height?: number;
  /** Fill color or 'currentColor' (default: uses theme-aware colors) */
  fill?: string;
  /** CSS class name for the SVG element */
  className?: string;
  /** Whether to include CSS for theme-aware colors (default: true) */
  themed?: boolean;
}

/**
 * Create a devbar logo SVG element.
 *
 * @example
 * ```ts
 * // Theme-aware logo (default)
 * const logo = createDevBarLogo({ width: 48, height: 48 });
 * document.body.appendChild(logo);
 *
 * // Custom color
 * const customLogo = createDevBarLogo({ fill: '#ff0000' });
 *
 * // Use currentColor (inherits from parent)
 * const inheritLogo = createDevBarLogo({ fill: 'currentColor' });
 * ```
 */
export function createDevBarLogo(options: CreateLogoOptions = {}): SVGSVGElement {
  const { width = 32, height = 32, fill, className, themed = true } = options;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', DEVBAR_LOGO_VIEWBOX);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-label', 'devbar logo');

  if (className) {
    svg.setAttribute('class', className);
  }

  // Add style element for themed colors if not using a custom fill
  if (themed && !fill) {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
      .devbar-logo-fill { fill: ${DEVBAR_LOGO_COLORS.dark}; }
      @media (prefers-color-scheme: light) {
        .devbar-logo-fill { fill: ${DEVBAR_LOGO_COLORS.light}; }
      }
    `;
    svg.appendChild(style);
  }

  const fillValue = fill || (themed ? undefined : DEVBAR_LOGO_COLORS.dark);
  const fillClass = !fill && themed ? 'devbar-logo-fill' : undefined;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  if (fillValue) {
    g.setAttribute('fill', fillValue);
  } else if (fillClass) {
    g.setAttribute('class', fillClass);
  }

  // Letter paths
  for (const d of Object.values(DEVBAR_LOGO_PATHS)) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    g.appendChild(path);
  }

  // Top bar (polyline)
  const topBar = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  topBar.setAttribute('points', DEVBAR_LOGO_SHAPES.topBar);
  g.appendChild(topBar);

  // Staircase steps
  for (const key of ['dStep1', 'dStep2', 'dStep3'] as const) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', DEVBAR_LOGO_SHAPES[key]);
    g.appendChild(poly);
  }

  // Letter counters (transparent holes)
  for (const key of ['dCounter', 'eCounter'] as const) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', DEVBAR_LOGO_SHAPES[key]);
    poly.setAttribute('fill', 'none');
    g.appendChild(poly);
  }

  svg.appendChild(g);

  return svg;
}

/**
 * Get the devbar logo as an SVG string.
 * Useful for SSR or when you need the raw SVG markup.
 *
 * @example
 * ```ts
 * const svgString = getDevBarLogoSvg({ width: 64 });
 * // Use with a templating system or set via outerHTML
 * ```
 */
export function getDevBarLogoSvg(options: CreateLogoOptions = {}): string {
  const { width = 32, height = 32, fill, themed = true } = options;

  const styleBlock =
    themed && !fill
      ? `<style>
      .devbar-logo-fill { fill: ${DEVBAR_LOGO_COLORS.dark}; }
      @media (prefers-color-scheme: light) {
        .devbar-logo-fill { fill: ${DEVBAR_LOGO_COLORS.light}; }
      }
    </style>`
      : '';

  const gFillAttr = fill
    ? `fill="${fill}"`
    : themed
      ? 'class="devbar-logo-fill"'
      : `fill="${DEVBAR_LOGO_COLORS.dark}"`;

  const paths = Object.values(DEVBAR_LOGO_PATHS)
    .map((d) => `<path d="${d}"/>`)
    .join('\n');

  return `<svg width="${width}" height="${height}" viewBox="${DEVBAR_LOGO_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="devbar logo">
${styleBlock}
<g ${gFillAttr}>
${paths}
<polyline points="${DEVBAR_LOGO_SHAPES.topBar}"/>
<polygon points="${DEVBAR_LOGO_SHAPES.dStep1}"/>
<polygon points="${DEVBAR_LOGO_SHAPES.dStep2}"/>
<polygon points="${DEVBAR_LOGO_SHAPES.dStep3}"/>
<polygon points="${DEVBAR_LOGO_SHAPES.dCounter}" fill="none"/>
<polygon points="${DEVBAR_LOGO_SHAPES.eCounter}" fill="none"/>
</g>
</svg>`;
}
