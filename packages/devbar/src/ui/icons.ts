/**
 * DevBar Icons
 *
 * SVG icon creation utilities for the DevBar UI.
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
// DevBar Logo
// ============================================================================

/**
 * DevBar logo SVG path data.
 * ViewBox: 0 0 1420 1419
 */
export const DEVBAR_LOGO_PATH =
  'M45 22V44H22.5H0V709.5V1375H22H44V1397V1419H710H1376V1397.02V1375.04L1398.25 1374.77L1420.5 1374.5L1420.51 708.5C1420.52 342.2 1420.4 65.563 1420.25 93.75L1419.98 145H1397.99H1376V119.5V94L1350.75 93.998L1325.5 93.997L1325.58 68.498L1325.67 43H1300.44H1275.21L1274.67 41.594C1274.38 40.821 1274.14 32.383 1274.15 22.844C1274.16 13.305 1274.12 4.15 1274.07 2.5L1273.97 -0.5L1273 1C1272.35 2 1272.03 2.083 1272.02 1.25L1272 0H1195.5H1119V21.5V43L1093.75 43.001L1068.5 43.002L1068.81 21.501L1069.12 0H685.06H301V22V44H249H197V22V0H121H45V22ZM0.497 709.5C0.497 1075.8 0.611 1225.5 0.75 1042.17C0.889 858.835 0.889 559.135 0.75 376.168C0.611 193.201 0.497 343.2 0.497 709.5ZM45 709V1374H95.75H146.5V1015.75V657.5L172.25 657.233L198 656.966V631.483V606H710H1222L1222.17 616.75C1222.26 622.663 1222.35 634.138 1222.36 642.25L1222.39 657H1247.69H1273L1273.01 723.75C1273.02 795.81 1273.73 1290.06 1273.9 1342.25L1274 1374H1324.5H1375V760V146H1349.5H1324V120.5V95H1298.5H1273V69.5V44H1196.5H1120V69.5V95H1094.5H1069V274V453L1058.75 453.089C1053.11 453.139 1041.52 453.251 1033 453.339L1017.5 453.5L1017.23 479.25L1016.97 505H607.483H198V479V453L266.75 452.997C304.563 452.995 362.05 452.883 394.5 452.747L453.5 452.5L453.567 427.25L453.634 402H428.067H402.5V223V44H351.75H301V69.5V95H249.571H198.142L198.16 273.578C198.169 371.796 197.951 452.382 197.676 452.658C197.031 453.302 147.81 453.144 147.161 452.495C146.893 452.226 146.634 360.205 146.586 248.003L146.5 44H95.75H45V709ZM813 248V401L820.75 401.051C827.801 401.098 845.353 401.093 936.25 401.023L966 401V248V95H889.5H813V248ZM348.666 812.75C348.417 813.163 348.143 830.135 348.056 850.468C347.969 870.8 347.709 887.624 347.478 887.855C347.247 888.086 342.432 888.466 336.779 888.698C331.126 888.93 326.042 889.264 325.482 889.44C324.893 889.625 324.337 894.645 324.161 901.379L323.858 913H335.929H348L348.101 914.25C348.415 918.151 347.749 964.576 347.373 964.955C347.126 965.206 341.878 965.431 335.711 965.455L324.5 965.5V977.5V989.5L336 990L347.5 990.5L347.78 1003.28L348.06 1016.06L360.274 1015.78L372.488 1015.5L372.32 924.5C372.228 874.45 372.118 828.663 372.076 822.75L372 812H360.559C354.266 812 348.915 812.337 348.666 812.75ZM746 914.07V1016.14L757.073 1015.83C763.162 1015.67 768.461 1015.3 768.848 1015.01C769.235 1014.73 769.598 1011.35 769.655 1007.5C769.712 1003.65 769.813 998.138 769.879 995.25L770 990H782H794V977.441V964.883L784.75 965.005C779.663 965.073 774.263 965.099 772.75 965.064L770 965V939V913H782H794V900.6V888.2L784.75 888.19C779.663 888.184 774.263 888.139 772.75 888.09L770 888V850V812H758H746V914.07ZM274.811 874.602C274.64 880.984 274.79 886.672 275.145 887.242C275.575 887.933 281.907 888.075 294.145 887.666C304.24 887.329 315.016 887.041 318.092 887.027L323.684 887L323.878 875L324.072 863H299.596H275.121L274.811 874.602ZM441 875.34V887.68L477.247 887.59L513.494 887.5L513.546 875.25L513.598 863H477.299H441V875.34ZM582 901V939H593.999H605.997L605.909 901L605.821 863H593.911H582V901ZM680 901.032V939.063L691.75 938.782L703.5 938.5L703.762 900.75L704.024 863H692.012H680V901.032ZM794.821 871.75C794.644 876.563 794.641 882.204 794.812 884.286L795.125 888.071L819.061 887.786L842.997 887.5L842.999 875.25L843 863H819.071H795.142L794.821 871.75ZM936 874.883V886.767L938.239 887.352C940.857 888.037 996.269 887.969 1003.25 887.273L1008 886.799V874.899V863H972H936V874.883ZM1075 939.397V1015.79L1087.25 1015.49L1099.5 1015.19L1099.65 964.844C1099.73 937.155 1099.85 914.201 1099.9 913.835C1099.96 913.469 1105.17 913.244 1111.5 913.335L1123 913.5V900.647L1123 887.794L1111.25 888.147L1099.5 888.5L1099.59 875.75L1099.69 863H1087.34H1075V939.397ZM1124.33 875.232L1124.5 887.5L1147 887.278C1159.38 887.155 1169.72 887.042 1170 887.027C1170.28 887.011 1170.45 881.711 1170.39 875.249L1170.28 863.5L1147.22 863.232L1124.15 862.964L1124.33 875.232ZM249.596 888.738C249.439 888.895 249.458 910.055 249.64 935.762C249.821 961.468 249.976 984.188 249.985 986.25L250 990H262.009H274.018L273.759 939.25L273.5 888.5L261.69 888.476C255.195 888.463 249.753 888.581 249.596 888.738ZM416.667 888.667C416.3 889.033 416 911.998 416 939.698V990.063L427.75 989.782L439.5 989.5V964.25V939H488.75H538V914V889L534.25 888.901C532.188 888.846 526.9 888.733 522.5 888.651L514.5 888.5L514.412 900.5C514.364 907.1 514.252 913.091 514.162 913.813L514 915.127L506.25 914.63C501.988 914.357 485.337 914.104 469.25 914.067L440 914V902.582C440 896.302 439.727 890.452 439.393 889.582L438.786 888H428.06C422.16 888 417.033 888.3 416.667 888.667ZM845.018 888.989C844.464 889.331 843.964 910.046 843.791 939.784L843.5 990.001L855.523 990H867.547L867.784 939.5C867.915 911.725 867.679 888.948 867.261 888.883C864.344 888.436 845.769 888.525 845.018 888.989ZM1011.85 888.806L1009.21 889.113L1009.06 901.265C1008.98 907.948 1008.7 913.632 1008.44 913.896C1008.17 914.16 991.712 914.404 971.856 914.438L935.754 914.5L935.934 925.938C936.033 932.229 936.35 937.757 936.637 938.222C936.925 938.688 953.212 939.02 972.83 938.96L1008.5 938.851L1008.78 951.895L1009.06 964.938L996.779 965.219L984.5 965.5L984.615 977.5L984.729 989.5L996.865 989.781L1009 990.062V1002.53C1009 1009.39 1009.34 1015.03 1009.75 1015.06C1010.16 1015.09 1015.56 1015.24 1021.75 1015.39L1033 1015.67V952.333V889L1031.75 888.895C1028.25 888.602 1014.16 888.539 1011.85 888.806ZM606.248 965L606.381 990H618.19H630V965V940H618.058H606.116L606.248 965ZM655.035 965L654.945 990H666.972H679V965V940H667.062H655.125L655.035 965ZM911 965V990H923H935V965V940H923H911V965ZM514.48 966.032C513.796 967.14 514.051 986.669 514.778 988.75L515.214 990H526.545H537.875L538.188 979.121C538.359 973.137 538.355 967.512 538.177 966.621L537.853 965H526.486C519.75 965 514.858 965.421 514.48 966.032ZM274.21 1003.25L274.559 1015.5H299.029H323.5L323.543 1005C323.567 999.225 323.402 993.712 323.177 992.75L322.767 991H298.314H273.861L274.21 1003.25ZM440.5 1002.98V1014.99L447 1015.05C450.575 1015.08 456.2 1015.36 459.5 1015.67C462.8 1015.98 476.384 1015.9 489.686 1015.5L513.872 1014.78L513.686 1003.14L513.5 991.5L477 991.237L440.5 990.974V1002.98ZM630.93 991.75C630.892 992.163 630.779 997.562 630.68 1003.75L630.5 1015L642.25 1015L654 1015V1007.64C654 1003.59 654.286 998.191 654.636 995.64L655.272 991H643.136C636.461 991 630.969 991.337 630.93 991.75ZM794.873 997.25C794.803 1000.69 794.691 1006.2 794.623 1009.5L794.5 1015.5L818.75 1015.66L843 1015.83V1003.41V991H819H795L794.873 997.25ZM936 1002.88V1014.77L937.798 1015.24C938.787 1015.5 949.475 1015.66 961.548 1015.6L983.5 1015.5L983.781 1003.25L984.062 991H960.031H936V1002.88ZM69.919 1272.73C69.826 1273.62 69.843 1319.6 69.937 1322.27L70 1324.03L95.682 1323.77L121.365 1323.5L121.218 1298L121.071 1272.5L95.535 1272.23C81.491 1272.09 69.964 1272.31 69.919 1272.73ZM1298 1298V1324H1323.83C1338.04 1324 1349.85 1323.81 1350.08 1323.58C1350.31 1323.36 1350.37 1311.66 1350.22 1297.58L1349.93 1272H1323.97H1298V1298Z';

/** DevBar logo viewBox dimensions */
export const DEVBAR_LOGO_VIEWBOX = '0 0 1420 1419';

/** DevBar logo colors */
export const DEVBAR_LOGO_COLORS = {
  /** Emerald green for dark mode */
  dark: '#10b981',
  /** Darker emerald for light mode */
  light: '#047857',
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
 * Create a DevBar logo SVG element.
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
  svg.setAttribute('aria-label', 'DevBar Logo');

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

  const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clipPath.setAttribute('id', 'devbar-logo-clip');
  const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  clipRect.setAttribute('width', '1420');
  clipRect.setAttribute('height', '1419');
  clipRect.setAttribute('fill', 'white');
  clipPath.appendChild(clipRect);

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.appendChild(clipPath);
  svg.appendChild(defs);

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('clip-path', 'url(#devbar-logo-clip)');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('clip-rule', 'evenodd');
  path.setAttribute('d', DEVBAR_LOGO_PATH);

  if (fill) {
    path.setAttribute('fill', fill);
  } else if (themed) {
    path.setAttribute('class', 'devbar-logo-fill');
  } else {
    path.setAttribute('fill', DEVBAR_LOGO_COLORS.dark);
  }

  g.appendChild(path);
  svg.appendChild(g);

  return svg;
}

/**
 * Get the DevBar logo as an SVG string.
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

  const fillAttr = fill
    ? `fill="${fill}"`
    : themed
      ? 'class="devbar-logo-fill"'
      : `fill="${DEVBAR_LOGO_COLORS.dark}"`;

  return `<svg width="${width}" height="${height}" viewBox="${DEVBAR_LOGO_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="DevBar Logo">
${styleBlock}
<defs>
<clipPath id="devbar-logo-clip">
<rect width="1420" height="1419" fill="white"/>
</clipPath>
</defs>
<g clip-path="url(#devbar-logo-clip)">
<path fill-rule="evenodd" clip-rule="evenodd" ${fillAttr} d="${DEVBAR_LOGO_PATH}"/>
</g>
</svg>`;
}
