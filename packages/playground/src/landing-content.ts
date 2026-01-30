/**
 * Landing Page Content for DevTools
 *
 * Creates the hero section and documentation overview using DevBar styling.
 */

/**
 * Helper to create a text element
 */
function createTextElement(tag: string, className: string, text: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

/**
 * Helper to create an anchor element
 */
function createLink(href: string, child: HTMLElement): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.appendChild(child);
  return a;
}

/**
 * Helper to create an image element
 */
function createImage(src: string, alt: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  return img;
}

/**
 * Create the landing page hero section
 */
export function createLandingHero(): HTMLElement {
  const hero = document.createElement('section');
  hero.className = 'landing-hero';

  // Logo/Title
  const title = document.createElement('h1');
  title.className = 'landing-title';
  const devSpan = document.createElement('span');
  devSpan.className = 'title-dev';
  devSpan.textContent = 'Dev';
  const toolsSpan = document.createElement('span');
  toolsSpan.className = 'title-tools';
  toolsSpan.textContent = 'Tools';
  title.appendChild(devSpan);
  title.appendChild(toolsSpan);
  hero.appendChild(title);

  // Tagline
  hero.appendChild(
    createTextElement(
      'p',
      'landing-tagline',
      'Autonomous AI development toolkit for browser debugging'
    )
  );

  // Badges
  const badges = document.createElement('div');
  badges.className = 'landing-badges';
  badges.appendChild(
    createLink(
      'https://www.npmjs.com/package/@ytspar/devbar',
      createImage(
        'https://img.shields.io/npm/v/@ytspar/devbar?style=flat-square&color=10b981',
        'devbar npm'
      )
    )
  );
  badges.appendChild(
    createLink(
      'https://www.npmjs.com/package/@ytspar/sweetlink',
      createImage(
        'https://img.shields.io/npm/v/@ytspar/sweetlink?style=flat-square&color=10b981',
        'sweetlink npm'
      )
    )
  );
  badges.appendChild(
    createLink(
      'https://github.com/ytspar/devtools',
      createImage(
        'https://img.shields.io/github/stars/ytspar/devtools?style=flat-square&color=10b981',
        'GitHub stars'
      )
    )
  );
  hero.appendChild(badges);

  // Quick install
  const install = document.createElement('div');
  install.className = 'landing-install';
  const code = document.createElement('code');
  code.textContent = 'pnpm add @ytspar/devbar @ytspar/sweetlink';
  install.appendChild(code);
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText('pnpm add @ytspar/devbar @ytspar/sweetlink');
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
    }, 2000);
  });
  install.appendChild(copyBtn);
  hero.appendChild(install);

  return hero;
}

/**
 * Create the features overview section
 */
export function createFeaturesSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'landing-features';

  section.appendChild(createTextElement('h2', 'section-heading', 'Features'));

  const features = [
    {
      icon: '📸',
      title: 'Screenshots',
      description:
        'Capture full page or element screenshots. Token-efficient (~1000 tokens vs ~5000).',
    },
    {
      icon: '🔍',
      title: 'DOM Queries',
      description: 'Query and inspect DOM elements with CSS selectors from CLI.',
    },
    {
      icon: '📊',
      title: 'Console Logs',
      description: 'Capture and filter browser console output with deduplication.',
    },
    {
      icon: '⚡',
      title: 'JS Execution',
      description: 'Run arbitrary JavaScript in browser context for debugging.',
    },
    {
      icon: '🖱️',
      title: 'Click Elements',
      description: 'Click elements by selector, text content, or both.',
    },
    {
      icon: '🔄',
      title: 'Auto Reconnect',
      description: 'Browser client automatically reconnects on disconnect.',
    },
  ];

  const grid = document.createElement('div');
  grid.className = 'features-grid';

  for (const feature of features) {
    const card = document.createElement('div');
    card.className = 'feature-card';

    const icon = document.createElement('span');
    icon.className = 'feature-icon';
    icon.textContent = feature.icon;
    card.appendChild(icon);

    card.appendChild(createTextElement('h3', 'feature-title', feature.title));
    card.appendChild(createTextElement('p', 'feature-description', feature.description));

    grid.appendChild(card);
  }

  section.appendChild(grid);
  return section;
}

/**
 * Create the packages overview section
 */
export function createPackagesSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'landing-packages';

  section.appendChild(createTextElement('h2', 'section-heading', 'Packages'));

  const packages = [
    {
      name: '@ytspar/devbar',
      description:
        'Development toolbar with breakpoint indicator, performance stats, console badges, and screenshot capture.',
      features: [
        'Tailwind breakpoint indicator',
        'FCP/LCP metrics',
        'Console error badges',
        'One-click screenshots',
      ],
    },
    {
      name: '@ytspar/sweetlink',
      description:
        'WebSocket bridge enabling AI agents to capture screenshots, query DOM, execute JavaScript, and monitor console logs.',
      features: ['CLI commands', 'Vite plugin', 'Auto-start server', 'CDP support'],
    },
  ];

  const grid = document.createElement('div');
  grid.className = 'packages-grid';

  for (const pkg of packages) {
    const card = document.createElement('div');
    card.className = 'package-card';

    card.appendChild(createTextElement('h3', 'package-name', pkg.name));
    card.appendChild(createTextElement('p', 'package-description', pkg.description));

    const list = document.createElement('ul');
    list.className = 'package-features';
    for (const feature of pkg.features) {
      const li = document.createElement('li');
      li.textContent = feature;
      list.appendChild(li);
    }
    card.appendChild(list);

    grid.appendChild(card);
  }

  section.appendChild(grid);
  return section;
}

/**
 * Create a code block element
 */
function createCodeBlock(code: string): HTMLPreElement {
  const pre = document.createElement('pre');
  const codeEl = document.createElement('code');
  codeEl.textContent = code;
  pre.appendChild(codeEl);
  return pre;
}

/**
 * Create the quick start section
 */
export function createQuickStartSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'landing-quickstart';

  section.appendChild(createTextElement('h2', 'section-heading', 'Quick Start'));

  const steps = document.createElement('div');
  steps.className = 'quickstart-steps';

  // Vite setup
  const viteStep = document.createElement('div');
  viteStep.className = 'quickstart-step';
  viteStep.appendChild(createTextElement('h3', '', '1. Add Sweetlink Plugin (Vite)'));
  viteStep.appendChild(
    createCodeBlock(`// vite.config.ts
import { sweetlink } from '@ytspar/sweetlink/vite';

export default defineConfig({
  plugins: [sweetlink()]
});`)
  );
  steps.appendChild(viteStep);

  // DevBar setup
  const devbarStep = document.createElement('div');
  devbarStep.className = 'quickstart-step';
  devbarStep.appendChild(createTextElement('h3', '', '2. Initialize DevBar'));
  devbarStep.appendChild(
    createCodeBlock(`// main.ts or App.tsx
import { initGlobalDevBar } from '@ytspar/devbar';

if (import.meta.env.DEV) {
  initGlobalDevBar();
}`)
  );
  steps.appendChild(devbarStep);

  // CLI usage
  const cliStep = document.createElement('div');
  cliStep.className = 'quickstart-step';
  cliStep.appendChild(createTextElement('h3', '', '3. Use CLI Commands'));
  cliStep.appendChild(
    createCodeBlock(`pnpm sweetlink screenshot          # Full page screenshot
pnpm sweetlink logs                 # Get console logs
pnpm sweetlink query --selector h1  # Query DOM
pnpm sweetlink click --text Submit  # Click element`)
  );
  steps.appendChild(cliStep);

  section.appendChild(steps);
  return section;
}

/**
 * Create the demo section divider
 */
export function createDemoSectionDivider(): HTMLElement {
  const divider = document.createElement('div');
  divider.className = 'demo-divider';

  const line1 = document.createElement('div');
  line1.className = 'divider-line';
  divider.appendChild(line1);

  divider.appendChild(createTextElement('span', 'divider-text', 'Interactive Demo'));

  const line2 = document.createElement('div');
  line2.className = 'divider-line';
  divider.appendChild(line2);

  return divider;
}
