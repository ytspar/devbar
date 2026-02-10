/**
 * Landing Page Content for devbar
 *
 * Creates the hero section and documentation overview using devbar styling.
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
 * Helper to create a notched card with wing header
 */
function createNotchedCard(
  prefix: string,
  title: string,
  titleTag: string = 'h3'
): { card: HTMLElement; content: HTMLElement } {
  const card = document.createElement('div');
  card.className = `${prefix}-card`;

  // Header with wings
  const header = document.createElement('div');
  header.className = `${prefix}-card-header`;

  const leftWing = document.createElement('div');
  leftWing.className = `${prefix}-card-wing ${prefix}-card-wing-left`;

  const titleEl = document.createElement(titleTag);
  const titleClassMap: Record<string, string> = {
    'quickstart-step': 'step-title',
    package: 'package-name',
  };
  titleEl.className = titleClassMap[prefix] ?? 'feature-title';
  titleEl.textContent = title;

  const rightWing = document.createElement('div');
  rightWing.className = `${prefix}-card-wing ${prefix}-card-wing-right`;

  header.appendChild(leftWing);
  header.appendChild(titleEl);
  header.appendChild(rightWing);

  // Content
  const content = document.createElement('div');
  content.className = `${prefix}-card-content`;

  card.appendChild(header);
  card.appendChild(content);

  return { card, content };
}

/**
 * Helper to create an anchor element
 */
/**
 * Helper to create a custom badge element with label + value
 */
function createBadge(
  href: string,
  label: string,
  value: string,
  valueId?: string
): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.className = 'landing-badge';

  const labelSpan = document.createElement('span');
  labelSpan.className = 'landing-badge-label';
  labelSpan.textContent = label;

  const valueSpan = document.createElement('span');
  valueSpan.className = 'landing-badge-value';
  valueSpan.textContent = value;
  if (valueId) valueSpan.id = valueId;

  a.appendChild(labelSpan);
  a.appendChild(valueSpan);
  return a;
}

/**
 * Create a coverage badge with block characters (each block = 10%)
 */
function createCoverageBadge(): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'landing-badge';

  const label = document.createElement('span');
  label.className = 'landing-badge-label';
  label.textContent = 'coverage';

  const blocks = document.createElement('span');
  blocks.className = 'landing-badge-blocks';
  blocks.id = 'coverage-blocks';
  // Start with all empty blocks
  for (let i = 0; i < 10; i++) {
    const b = document.createElement('span');
    b.className = 'block-empty';
    b.textContent = '\u2588';
    blocks.appendChild(b);
  }

  badge.appendChild(label);
  badge.appendChild(blocks);
  return badge;
}

/**
 * Update coverage blocks to reflect a percentage
 */
function setCoverageBlocks(pct: number): void {
  const container = document.getElementById('coverage-blocks');
  if (!container) return;
  const filled = Math.round(pct / 10);
  const children = container.children;
  for (let i = 0; i < children.length; i++) {
    children[i].className = i < filled ? 'block-filled' : 'block-empty';
  }
}

/**
 * Fetch live badge data from npm and GitHub APIs
 */
function fetchBadgeData(): void {
  fetch('https://registry.npmjs.org/@ytspar/devbar/latest')
    .then((r) => r.json())
    .then((d) => {
      const el = document.getElementById('badge-devbar-version');
      if (el) el.textContent = `v${d.version}`;
    })
    .catch(() => {});

  fetch('https://registry.npmjs.org/@ytspar/sweetlink/latest')
    .then((r) => r.json())
    .then((d) => {
      const el = document.getElementById('badge-sweetlink-version');
      if (el) el.textContent = `v${d.version}`;
    })
    .catch(() => {});

  fetch('https://api.github.com/repos/ytspar/devbar')
    .then((r) => r.json())
    .then((d) => {
      const el = document.getElementById('badge-stars');
      if (el && typeof d.stargazers_count === 'number') {
        el.textContent = String(d.stargazers_count);
      }
    })
    .catch(() => {});

  fetch(
    'https://api.github.com/repos/ytspar/devbar/actions/workflows/canary.yml/runs?per_page=1&status=completed'
  )
    .then((r) => r.json())
    .then((d) => {
      const el = document.getElementById('badge-build');
      if (el && d.workflow_runs?.[0]) {
        const conclusion = d.workflow_runs[0].conclusion;
        el.textContent = conclusion === 'success' ? 'passing' : conclusion;
      }
    })
    .catch(() => {});

  // Coverage data (generated during CI build)
  fetch(`${import.meta.env.BASE_URL}coverage.json`)
    .then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then((d: { statements: number }) => {
      setCoverageBlocks(d.statements);
    })
    .catch(() => {});
}

/**
 * Create the landing page hero section
 */
export function createLandingHero(): HTMLElement {
  const hero = document.createElement('section');
  hero.className = 'landing-hero';

  // Logotype logo
  const logoContainer = document.createElement('div');
  logoContainer.className = 'landing-logo';
  const logo = document.createElement('img');
  logo.src = `${import.meta.env.BASE_URL}logo/devbar-logo.svg`;
  logo.alt = 'devbar';
  logo.className = 'landing-logo-img';
  logoContainer.appendChild(logo);
  hero.appendChild(logoContainer);

  // Tagline
  hero.appendChild(
    createTextElement('p', 'landing-tagline', 'Development toolbar and AI debugging toolkit')
  );

  // Badges
  const badges = document.createElement('div');
  badges.className = 'landing-badges';
  badges.appendChild(
    createBadge(
      'https://www.npmjs.com/package/@ytspar/devbar',
      'devbar', '...', 'badge-devbar-version'
    )
  );
  badges.appendChild(
    createBadge(
      'https://www.npmjs.com/package/@ytspar/sweetlink',
      'sweetlink', '...', 'badge-sweetlink-version'
    )
  );
  badges.appendChild(
    createBadge(
      'https://github.com/ytspar/devbar/actions/workflows/canary.yml',
      'build', '...', 'badge-build'
    )
  );
  badges.appendChild(
    createBadge(
      'https://github.com/ytspar/devbar',
      'stars', '...', 'badge-stars'
    )
  );
  badges.appendChild(
    createBadge(
      'https://github.com/ytspar/devbar/blob/main/LICENSE',
      'license', 'MIT'
    )
  );
  badges.appendChild(createCoverageBadge());
  hero.appendChild(badges);

  // Fetch live data for badges and coverage
  fetchBadgeData();

  // Quick install — entire card is clickable to copy
  const install = document.createElement('div');
  install.className = 'landing-install';
  install.setAttribute('role', 'button');
  install.setAttribute('tabindex', '0');
  install.setAttribute('aria-label', 'Copy install command');
  const code = document.createElement('code');
  code.textContent = 'pnpm add @ytspar/devbar @ytspar/sweetlink';
  install.appendChild(code);
  const copyLabel = document.createElement('span');
  copyLabel.className = 'copy-btn';
  copyLabel.textContent = 'Copy';
  install.appendChild(copyLabel);

  const doCopy = () => {
    navigator.clipboard.writeText('pnpm add @ytspar/devbar @ytspar/sweetlink').then(
      () => {
        copyLabel.textContent = 'Copied!';
        setTimeout(() => {
          copyLabel.textContent = 'Copy';
        }, 2000);
      },
      () => {
        copyLabel.textContent = 'Failed';
        setTimeout(() => {
          copyLabel.textContent = 'Copy';
        }, 2000);
      }
    );
  };
  install.addEventListener('click', doCopy);
  install.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      doCopy();
    }
  });
  hero.appendChild(install);

  return hero;
}

/**
 * Syntax highlighting tokens for code blocks
 */
interface Token {
  type: 'keyword' | 'string' | 'comment' | 'function' | 'property' | 'operator' | 'number' | 'text';
  value: string;
}

/**
 * Simple syntax highlighter for TypeScript/JavaScript
 */
function highlightCode(code: string, language: 'typescript' | 'bash' = 'typescript'): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'code-block';
  const codeEl = document.createElement('code');
  codeEl.className = `language-${language}`;

  if (language === 'bash') {
    // Simple bash highlighting
    const lines = code.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('#')) {
        // Comment
        const span = document.createElement('span');
        span.className = 'token-comment';
        span.textContent = line;
        codeEl.appendChild(span);
      } else {
        // Highlight command and flags
        const parts = line.split(/(\s+)/);
        let isFirst = true;
        for (const part of parts) {
          if (part.trim() === '') {
            codeEl.appendChild(document.createTextNode(part));
            continue;
          }
          const span = document.createElement('span');
          if (isFirst && part.trim()) {
            span.className = 'token-function';
            isFirst = false;
          } else if (part.startsWith('--') || part.startsWith('-')) {
            span.className = 'token-property';
          } else if (part.startsWith('"') || part.startsWith("'")) {
            span.className = 'token-string';
          } else {
            span.className = 'token-text';
          }
          span.textContent = part;
          codeEl.appendChild(span);
        }
      }
      codeEl.appendChild(document.createTextNode('\n'));
    }
  } else {
    // TypeScript highlighting
    const tokens = tokenizeTS(code);
    for (const token of tokens) {
      const span = document.createElement('span');
      span.className = `token-${token.type}`;
      span.textContent = token.value;
      codeEl.appendChild(span);
    }
  }

  pre.appendChild(codeEl);
  return pre;
}

/**
 * Tokenize TypeScript code for syntax highlighting
 */
function tokenizeTS(code: string): Token[] {
  const tokens: Token[] = [];
  const keywords = [
    'import',
    'export',
    'from',
    'const',
    'let',
    'var',
    'if',
    'else',
    'return',
    'function',
    'default',
    'async',
    'await',
  ];

  let i = 0;
  while (i < code.length) {
    // Comments
    if (code.slice(i, i + 2) === '//') {
      let end = code.indexOf('\n', i);
      if (end === -1) end = code.length;
      tokens.push({ type: 'comment', value: code.slice(i, end) });
      i = end;
      continue;
    }

    // Strings
    if (code[i] === "'" || code[i] === '"' || code[i] === '`') {
      const quote = code[i];
      let j = i + 1;
      while (j < code.length && code[j] !== quote) {
        if (code[j] === '\\') j++;
        j++;
      }
      tokens.push({ type: 'string', value: code.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Numbers
    if (/\d/.test(code[i])) {
      let j = i;
      while (j < code.length && /[\d.]/.test(code[j])) j++;
      tokens.push({ type: 'number', value: code.slice(i, j) });
      i = j;
      continue;
    }

    // Words (keywords, identifiers)
    if (/[a-zA-Z_$]/.test(code[i])) {
      let j = i;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);

      // Check if followed by ( for function calls
      let nextNonSpace = j;
      while (nextNonSpace < code.length && code[nextNonSpace] === ' ') nextNonSpace++;

      if (keywords.includes(word)) {
        tokens.push({ type: 'keyword', value: word });
      } else if (code[nextNonSpace] === '(') {
        tokens.push({ type: 'function', value: word });
      } else if (code[i - 1] === '.') {
        tokens.push({ type: 'property', value: word });
      } else {
        tokens.push({ type: 'text', value: word });
      }
      i = j;
      continue;
    }

    // Operators
    if (/[{}()[\];:,.<>=+\-*/&|!?]/.test(code[i])) {
      tokens.push({ type: 'operator', value: code[i] });
      i++;
      continue;
    }

    // Whitespace and other
    tokens.push({ type: 'text', value: code[i] });
    i++;
  }

  return tokens;
}

/**
 * Create the features overview section - devbar toolbar features
 */
export function createFeaturesSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'landing-features';

  section.appendChild(createTextElement('h2', 'section-heading', 'devbar toolbar'));

  const features = [
    {
      title: 'Breakpoint Indicator',
      description:
        'Shows current Tailwind CSS breakpoint (sm, md, lg, xl, 2xl) with viewport dimensions.',
    },
    {
      title: 'Core Web Vitals',
      description:
        'Real-time FCP, LCP, CLS, and INP metrics. Monitor performance without opening DevTools.',
    },
    {
      title: 'Console Badges',
      description:
        'Visual error and warning counts. Quickly spot issues without checking the console.',
    },
    {
      title: 'One-Click Screenshots',
      description:
        'Capture full page or element screenshots. Copies to clipboard or saves to disk.',
    },
    {
      title: 'Custom Controls',
      description:
        'Register app-specific debug buttons. Add "Clear Cache", "Reset State", or any action.',
    },
    {
      title: 'Theme System',
      description: 'Dark/light modes with system preference detection. Multiple accent colors.',
    },
  ];

  const grid = document.createElement('div');
  grid.className = 'features-grid';

  for (const feature of features) {
    const { card, content } = createNotchedCard('feature', feature.title);
    content.appendChild(createTextElement('p', 'feature-description', feature.description));
    grid.appendChild(card);
  }

  section.appendChild(grid);
  return section;
}

/**
 * Create the Sweetlink features section - AI agent toolkit
 */
export function createSweetlinkSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'landing-features sweetlink-features';

  section.appendChild(createTextElement('h2', 'section-heading', 'sweetlink AI bridge'));

  const features = [
    {
      title: 'Token-Efficient Screenshots',
      description:
        'Compressed images via WebSocket. ~1,000 tokens vs ~15,000 for CDP. Saves context window.',
    },
    {
      title: 'Console Log Streaming',
      description:
        'Real-time log capture with filtering. Errors, warnings, and info with timestamps.',
    },
    {
      title: 'HMR Auto-Capture',
      description:
        'Automatic screenshots on hot reload. AI sees changes immediately after code edits.',
    },
    {
      title: 'Design Review',
      description:
        'Claude Vision integration for automated UI analysis. Catches visual bugs and accessibility issues.',
    },
    {
      title: 'CLI for AI Agents',
      description:
        'Commands that AI assistants can run: screenshot, logs, query, refresh. Built for automation.',
    },
    {
      title: 'WebSocket Bridge',
      description:
        'Real-time bidirectional communication. Auto-reconnect with exponential backoff.',
    },
  ];

  const grid = document.createElement('div');
  grid.className = 'features-grid';

  for (const feature of features) {
    const { card, content } = createNotchedCard('feature', feature.title);
    content.appendChild(createTextElement('p', 'feature-description', feature.description));
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
      description: 'Compact development toolbar. Framework-agnostic vanilla JS.',
      features: [
        'Tailwind breakpoint + viewport size',
        'Core Web Vitals (FCP, LCP, CLS, INP)',
        'Console error/warning badges',
        'Screenshot capture to clipboard',
        'Extensible custom controls',
        'Dark/light theme with accents',
      ],
    },
    {
      name: '@ytspar/sweetlink',
      description: 'WebSocket bridge for AI agent browser debugging.',
      features: [
        'Token-efficient screenshots (~1k tokens)',
        'Console log capture + streaming',
        'HMR auto-screenshot on code changes',
        'Claude Vision design review',
        'CLI commands for automation',
        'Vite plugin for zero-config setup',
      ],
    },
  ];

  const grid = document.createElement('div');
  grid.className = 'packages-grid';

  for (const pkg of packages) {
    const { card, content } = createNotchedCard('package', pkg.name);
    content.appendChild(createTextElement('p', 'package-description', pkg.description));

    const list = document.createElement('ul');
    list.className = 'package-features';
    for (const feature of pkg.features) {
      const li = document.createElement('li');
      li.textContent = feature;
      list.appendChild(li);
    }
    content.appendChild(list);

    grid.appendChild(card);
  }

  section.appendChild(grid);
  return section;
}

/**
 * Create the quick start section with syntax-highlighted code
 */
export function createQuickStartSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'landing-quickstart';

  section.appendChild(createTextElement('h2', 'section-heading', 'Quick Start'));

  const stepsContainer = document.createElement('div');
  stepsContainer.className = 'quickstart-steps';

  // Step 1: Install
  const { card: step1, content: content1 } = createNotchedCard('quickstart-step', '1. Install');
  content1.appendChild(highlightCode(`pnpm add @ytspar/devbar @ytspar/sweetlink`, 'bash'));
  stepsContainer.appendChild(step1);

  // Step 2: Vite setup
  const { card: step2, content: content2 } = createNotchedCard(
    'quickstart-step',
    '2. Add Vite Plugin'
  );
  content2.appendChild(
    highlightCode(
      `// vite.config.ts
import { sweetlink } from '@ytspar/sweetlink/vite'

export default defineConfig({
  plugins: [sweetlink()]
})`,
      'typescript'
    )
  );
  stepsContainer.appendChild(step2);

  // Step 3: devbar setup
  const { card: step3, content: content3 } = createNotchedCard(
    'quickstart-step',
    '3. Initialize devbar'
  );
  content3.appendChild(
    highlightCode(
      `// main.ts
import { initGlobalDevBar } from '@ytspar/devbar'

if (import.meta.env.DEV) {
  initGlobalDevBar()
}`,
      'typescript'
    )
  );
  stepsContainer.appendChild(step3);

  // Step 4: CLI usage
  const { card: step4, content: content4 } = createNotchedCard('quickstart-step', '4. Use CLI');
  content4.appendChild(
    highlightCode(
      `pnpm sweetlink screenshot   # Capture page
pnpm sweetlink logs         # Get console output
pnpm sweetlink refresh      # Reload browser`,
      'bash'
    )
  );
  stepsContainer.appendChild(step4);

  section.appendChild(stepsContainer);
  return section;
}
