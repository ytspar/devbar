/**
 * Generate OG image for social media unfurls (Slack, Twitter, Facebook).
 *
 * Composes a 1200×630 SVG using the devbar logo wordmark and Departure Mono
 * font, then rasterises it to PNG via @resvg/resvg-js.
 *
 * Usage:  node scripts/generate-og-image.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const playgroundDir = join(__dirname, '..');

// ── Read assets ──────────────────────────────────────────────────────────────

const logoSvg = readFileSync(
  join(playgroundDir, 'public/logo/devbar-logo.svg'),
  'utf-8',
);

// Extract the inner content of <g id="devbar-wordmark" ...> ... </g>
const wordmarkMatch = logoSvg.match(
  /<g\s+id="devbar-wordmark"[^>]*>([\s\S]*?)<\/g>\s*<\/svg>/,
);
if (!wordmarkMatch) throw new Error('Could not extract wordmark paths from logo SVG');
const wordmarkPaths = wordmarkMatch[1];

// Logo viewBox: 0 0 580.43 167.62
const logoW = 580.43;

const fontBuffer = readFileSync(
  join(playgroundDir, 'public/fonts/DepartureMono-Regular.woff'),
);

// ── Image parameters ─────────────────────────────────────────────────────────

const W = 1200;
const H = 630;
const BG = '#0a0f1a';
const ACCENT = '#10b981';
const TAGLINE = 'Development toolbar and AI debugging toolkit';
const FOOTER = 'github.com/ytspar/devbar';

// Centre the logo horizontally and place it in the upper third
const logoScale = 1.0;
const logoX = (W - logoW * logoScale) / 2;
const logoY = 160;

// ── Compose SVG ──────────────────────────────────────────────────────────────

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>.counter { fill: none; }</style>
    <!-- Scanline pattern -->
    <pattern id="scanlines" width="${W}" height="4" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="${W}" y2="0" stroke="${ACCENT}" stroke-width="0.5" opacity="0.05"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <!-- Subtle radial glow behind logo -->
  <radialGradient id="glow" cx="50%" cy="38%" r="35%">
    <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.08"/>
    <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
  </radialGradient>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- Scanlines overlay -->
  <rect width="${W}" height="${H}" fill="url(#scanlines)"/>

  <!-- Corner brackets (pixel-art frame) -->
  <g stroke="${ACCENT}" stroke-width="3" fill="none" opacity="0.35">
    <polyline points="50,90 50,50 90,50"/>
    <polyline points="${W - 90},50 ${W - 50},50 ${W - 50},90"/>
    <polyline points="50,${H - 90} 50,${H - 50} 90,${H - 50}"/>
    <polyline points="${W - 90},${H - 50} ${W - 50},${H - 50} ${W - 50},${H - 90}"/>
  </g>

  <!-- Logo wordmark -->
  <g transform="translate(${logoX}, ${logoY}) scale(${logoScale})" fill="${ACCENT}">
    ${wordmarkPaths}
  </g>

  <!-- Tagline -->
  <text x="${W / 2}" y="430"
        text-anchor="middle"
        font-family="Departure Mono, monospace"
        font-size="26"
        fill="${ACCENT}"
        opacity="0.8">
    ${TAGLINE}
  </text>

  <!-- Footer URL -->
  <text x="${W / 2}" y="${H - 55}"
        text-anchor="middle"
        font-family="Departure Mono, monospace"
        font-size="18"
        fill="${ACCENT}"
        opacity="0.35">
    ${FOOTER}
  </text>
</svg>`;

// ── Render to PNG ────────────────────────────────────────────────────────────

const resvg = new Resvg(svg, {
  fitTo: { mode: 'original' },
  font: {
    fontBuffers: [fontBuffer],
    loadSystemFonts: false,
  },
});

const pngData = resvg.render();
const pngBuffer = pngData.asPng();

const outPath = join(playgroundDir, 'public/og-image.png');
writeFileSync(outPath, pngBuffer);

const sizeKB = (pngBuffer.length / 1024).toFixed(1);
console.log(`✓ Generated ${outPath} (${W}×${H}, ${sizeKB} KB)`);
