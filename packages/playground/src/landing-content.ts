/**
 * Landing Page Content for devbar
 *
 * Creates the hero section and documentation overview using devbar styling.
 */

import { PALETTE } from '@ytspar/devbar';
import releaseNotes from './release-notes.json';
import npmTimeline from 'virtual:npm-timeline';

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
    children[i]!.className = i < filled ? 'block-filled' : 'block-empty';
  }
}

/**
 * Fetch JSON with sessionStorage cache to avoid GitHub API rate limits (60/hr).
 * Cached values survive HMR reloads but expire with the browser tab.
 */
function cachedFetch<T>(url: string, key: string): Promise<T> {
  const cached = sessionStorage.getItem(key);
  if (cached) return Promise.resolve(JSON.parse(cached) as T);
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<T>;
  }).then((data) => {
    sessionStorage.setItem(key, JSON.stringify(data));
    return data;
  });
}

/**
 * Format a date string as relative time (e.g., "2 days ago")
 */
function formatRelativeDate(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

/**
 * Format a date string as "Feb 25, 2026"
 */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * npm package timeline data — bundled at build time by the npmTimeline Vite plugin.
 * Falls back to a runtime fetch if the build-time data is empty (e.g., offline build).
 */
interface NpmTimeline {
  'dist-tags': { latest: string };
  time: Record<string, string>;
}

function getNpmTimeline(pkg: string): Promise<NpmTimeline | null> {
  // Prefer build-time data (instant, no network request)
  const buildData = npmTimeline[pkg];
  if (buildData?.time && Object.keys(buildData.time).length > 0) {
    return Promise.resolve(buildData);
  }

  // Fallback: runtime fetch (only if build-time data is missing)
  const cacheKey = `timeline:${pkg}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return Promise.resolve(JSON.parse(cached) as NpmTimeline);

  return fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json() as Promise<NpmTimeline>;
    })
    .then((data) => {
      const slim: NpmTimeline = {
        'dist-tags': data['dist-tags'],
        time: data.time,
      };
      sessionStorage.setItem(cacheKey, JSON.stringify(slim));
      return slim;
    })
    .catch(() => null);
}

/**
 * Fetch live badge data from npm and GitHub APIs
 */
function fetchBadgeData(): void {
  cachedFetch<{ version: string }>(
    'https://registry.npmjs.org/@ytspar/devbar/latest', 'badge:devbar'
  ).then((d) => {
    const el = document.getElementById('badge-devbar-version');
    if (el) el.textContent = `v${d.version}`;
  }).catch(() => {});

  cachedFetch<{ version: string }>(
    'https://registry.npmjs.org/@ytspar/sweetlink/latest', 'badge:sweetlink'
  ).then((d) => {
    const el = document.getElementById('badge-sweetlink-version');
    if (el) el.textContent = `v${d.version}`;
  }).catch(() => {});

  cachedFetch<{ stargazers_count?: number }>(
    'https://api.github.com/repos/ytspar/devbar', 'badge:stars'
  ).then((d) => {
    const el = document.getElementById('badge-stars');
    if (el && typeof d.stargazers_count === 'number') {
      el.textContent = String(d.stargazers_count);
    }
  }).catch(() => {});

  cachedFetch<{ workflow_runs?: Array<{ conclusion: string }> }>(
    'https://api.github.com/repos/ytspar/devbar/actions/workflows/canary.yml/runs?per_page=1&status=completed',
    'badge:build'
  ).then((d) => {
    const el = document.getElementById('badge-build');
    if (el && d.workflow_runs?.[0]) {
      const conclusion = d.workflow_runs[0].conclusion;
      el.textContent = conclusion === 'success' ? 'passing' : conclusion;
    }
  }).catch(() => {});

  // Coverage data (generated during CI build, not cached — local file)
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

  // Logotype logo as h1 for SEO heading hierarchy
  const h1 = document.createElement('h1');
  h1.className = 'landing-logo';
  const logo = document.createElement('img');
  logo.src = `${import.meta.env.BASE_URL}logo/devbar-logo.svg`;
  logo.alt = 'devbar';
  logo.className = 'landing-logo-img';
  h1.appendChild(logo);
  hero.appendChild(h1);

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

  // Release info — "Last published 2d ago · v1.7.1  Changelog ↓"
  const releaseInfo = document.createElement('div');
  releaseInfo.className = 'landing-release-info';
  const releaseMeta = document.createElement('span');
  releaseMeta.className = 'release-meta';
  releaseMeta.id = 'release-meta';
  releaseMeta.textContent = '\u00B7 \u00B7 \u00B7'; // placeholder dots
  releaseInfo.appendChild(releaseMeta);

  const changelogLink = document.createElement('a');
  changelogLink.href = '#changelog';
  changelogLink.className = 'release-changelog-link';
  changelogLink.textContent = 'Changelog \u2193';
  releaseInfo.appendChild(changelogLink);
  hero.appendChild(releaseInfo);

  // Fetch live data for badges, coverage, and release date
  fetchBadgeData();
  fetchReleaseInfo();

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
 * Fetch and display release info in the hero section
 */
function fetchReleaseInfo(): void {
  getNpmTimeline('@ytspar/devbar').then((data) => {
    if (!data) return;
    const latest = data['dist-tags'].latest;
    const dateStr = data.time[latest];
    if (!dateStr) return;

    const el = document.getElementById('release-meta');
    if (el) {
      el.textContent = `Published ${formatRelativeDate(dateStr)} \u00B7 v${latest}`;
    }
  });
}

/**
 * Changelog entry for rendering
 */
interface ChangelogEntry {
  pkg: string;
  version: string;
  date: string;
}

/**
 * Human-curated release notes keyed by package → version.
 * Loaded from release-notes.json so the validation script can parse it without TS.
 */
const RELEASE_NOTES: Record<string, Record<string, string>> = releaseNotes;

/**
 * Create the changelog/releases section
 */
export function createChangelogSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'landing-changelog';
  section.id = 'changelog';

  const heading = createTextElement('h2', 'section-heading', 'Releases');
  section.appendChild(heading);

  // Release graph container (populated async)
  const graphWrap = document.createElement('div');
  graphWrap.className = 'release-graph-wrap';
  graphWrap.id = 'release-graph';
  section.appendChild(graphWrap);

  // Graph legend
  const legend = document.createElement('div');
  legend.className = 'release-graph-legend';
  for (const item of [
    { cls: 'legend-devbar-stable', label: 'devbar stable' },
    { cls: 'legend-devbar-canary', label: 'devbar canary' },
    { cls: 'legend-sweetlink-stable', label: 'sweetlink stable' },
    { cls: 'legend-sweetlink-canary', label: 'sweetlink canary' },
  ]) {
    const el = document.createElement('span');
    el.className = `release-graph-legend-item ${item.cls}`;
    el.textContent = item.label;
    legend.appendChild(el);
  }
  section.appendChild(legend);

  // Changelog list container (populated async)
  const list = document.createElement('div');
  list.className = 'changelog-list';
  list.id = 'changelog-list';

  const loading = document.createElement('div');
  loading.className = 'changelog-loading';
  loading.textContent = 'Loading release history\u2026';
  list.appendChild(loading);

  section.appendChild(list);

  // Footer link to GitHub
  const footer = document.createElement('div');
  footer.className = 'changelog-footer';
  const ghLink = document.createElement('a');
  ghLink.href = 'https://github.com/ytspar/devbar/commits/main';
  ghLink.target = '_blank';
  ghLink.rel = 'noopener noreferrer';
  ghLink.className = 'changelog-gh-link';
  ghLink.textContent = 'Full history on GitHub \u2192';
  footer.appendChild(ghLink);
  section.appendChild(footer);

  // Fetch release data from npm
  populateChangelog();

  return section;
}

/**
 * Classify a version string: stable, canary, or prerelease (alpha/beta/rc)
 */
function classifyVersion(version: string): 'stable' | 'canary' | 'prerelease' {
  if (version.includes('canary')) return 'canary';
  if (version.includes('-')) return 'prerelease';
  return 'stable';
}

/**
 * Parse semver major.minor.patch from a version string (ignores prerelease suffix)
 */
function parseSemver(version: string): number {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return 0;
  return parseInt(match[1]!) * 10000 + parseInt(match[2]!) * 100 + parseInt(match[3]!);
}

/**
 * Render an SVG release history graph into #release-graph.
 * X axis = time, Y axis = version (semver), dots = releases, color = type.
 */
function renderReleaseGraph(
  devbarTime: Record<string, string>,
  sweetlinkTime: Record<string, string>,
): void {
  const container = document.getElementById('release-graph');
  if (!container) return;

  interface Point {
    pkg: 'devbar' | 'sweetlink';
    version: string;
    kind: 'stable' | 'canary' | 'prerelease';
    date: Date;
    semver: number;
  }

  const points: Point[] = [];

  for (const [time, label] of [[devbarTime, 'devbar'], [sweetlinkTime, 'sweetlink']] as const) {
    for (const [ver, dateStr] of Object.entries(time)) {
      if (ver === 'created' || ver === 'modified') continue;
      // Skip v0.0.x — initial placeholder publishes that compress the Y scale
      if (ver.startsWith('0.0.')) continue;
      points.push({
        pkg: label,
        version: ver,
        kind: classifyVersion(ver),
        date: new Date(dateStr),
        semver: parseSemver(ver),
      });
    }
  }

  if (points.length === 0) return;

  // Dimensions
  const width = 1060;
  const height = 240;
  const pad = { top: 20, right: 30, bottom: 32, left: 50 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // Scales
  const dates = points.map((p) => p.date.getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const dateRange = maxDate - minDate || 1;
  const xScale = (d: Date) => pad.left + ((d.getTime() - minDate) / dateRange) * plotW;

  const semvers = points.map((p) => p.semver);
  const minSv = Math.min(...semvers);
  const maxSv = Math.max(...semvers);
  const svRange = maxSv - minSv || 1;
  const yScale = (sv: number) => pad.top + plotH - ((sv - minSv) / svRange) * plotH;

  // Colors
  const colors: Record<string, Record<string, string>> = {
    devbar: { stable: PALETTE.emerald, canary: 'rgba(16,185,129,0.35)', prerelease: 'rgba(16,185,129,0.5)' },
    sweetlink: { stable: PALETTE.purple, canary: 'rgba(168,85,247,0.35)', prerelease: 'rgba(168,85,247,0.5)' },
  };

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'release-graph-svg');

  // Grid lines (horizontal)
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(pad.left));
    line.setAttribute('x2', String(width - pad.right));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'release-graph-grid');
    svg.appendChild(line);
  }

  // X-axis date labels
  const labelCount = 6;
  for (let i = 0; i <= labelCount; i++) {
    const t = minDate + (dateRange / labelCount) * i;
    const x = xScale(new Date(t));
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(height - 6));
    text.setAttribute('class', 'release-graph-label');
    text.textContent = new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    svg.appendChild(text);
  }

  // Y-axis version labels — pick min, mid, max from unique sorted semvers
  const uniqueSv = Array.from(new Set(semvers)).sort((a, b) => a - b);
  const yLabelSvs = [
    uniqueSv[0]!,
    uniqueSv[Math.floor(uniqueSv.length / 2)]!,
    uniqueSv[uniqueSv.length - 1]!,
  ];
  for (const sv of yLabelSvs) {
    const major = Math.floor(sv / 10000);
    const minor = Math.floor((sv % 10000) / 100);
    const patch = sv % 100;
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(pad.left - 8));
    text.setAttribute('y', String(yScale(sv) + 3));
    text.setAttribute('class', 'release-graph-label release-graph-label-y');
    text.textContent = `v${major}.${minor}.${patch}`;
    svg.appendChild(text);
  }

  // Sort so canary/prerelease render behind stable
  const sortOrder = { canary: 0, prerelease: 1, stable: 2 };
  points.sort((a, b) => sortOrder[a.kind] - sortOrder[b.kind]);

  // Tooltip group (appended last so it renders on top)
  const tooltipGroup = document.createElementNS(NS, 'g');
  tooltipGroup.setAttribute('class', 'release-graph-tooltip-group');

  // Plot dots
  for (const p of points) {
    const cx = xScale(p.date);
    const cy = yScale(p.semver);
    const r = p.kind === 'stable' ? 4 : 2.5;
    const color = colors[p.pkg]?.[p.kind] ?? '#666';

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', color);
    if (p.kind === 'stable') {
      circle.setAttribute('class', 'release-graph-dot-stable');
    }
    svg.appendChild(circle);

    // Invisible hover target (larger)
    const hitArea = document.createElementNS(NS, 'circle');
    hitArea.setAttribute('cx', String(cx));
    hitArea.setAttribute('cy', String(cy));
    hitArea.setAttribute('r', '8');
    hitArea.setAttribute('fill', 'transparent');
    hitArea.setAttribute('class', 'release-graph-hit');

    // Tooltip on hover
    const tipBg = document.createElementNS(NS, 'rect');
    const tipText = document.createElementNS(NS, 'text');
    const label = `${p.pkg} v${p.version}`;
    tipText.textContent = label;
    tipText.setAttribute('x', String(cx));
    tipText.setAttribute('y', String(cy - 14));
    tipText.setAttribute('class', 'release-graph-tip-text');

    // Estimate text width (monospace ~7px per char at 10px font)
    const tw = label.length * 6.2 + 12;
    tipBg.setAttribute('x', String(cx - tw / 2));
    tipBg.setAttribute('y', String(cy - 26));
    tipBg.setAttribute('width', String(tw));
    tipBg.setAttribute('height', '16');
    tipBg.setAttribute('rx', '3');
    tipBg.setAttribute('class', 'release-graph-tip-bg');

    const tipGroup = document.createElementNS(NS, 'g');
    tipGroup.setAttribute('class', 'release-graph-tip');
    tipGroup.appendChild(tipBg);
    tipGroup.appendChild(tipText);
    tooltipGroup.appendChild(tipGroup);

    hitArea.addEventListener('mouseenter', () => {
      tipGroup.classList.add('visible');
    });
    hitArea.addEventListener('mouseleave', () => {
      tipGroup.classList.remove('visible');
    });
    svg.appendChild(hitArea);
  }

  svg.appendChild(tooltipGroup);
  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(svg);
}

/**
 * Fetch both packages' timelines and render the changelog
 */
function populateChangelog(): void {
  Promise.all([
    getNpmTimeline('@ytspar/devbar'),
    getNpmTimeline('@ytspar/sweetlink'),
  ]).then(([devbarData, sweetlinkData]) => {
    // Render the release graph (includes ALL versions — stable, canary, prerelease)
    renderReleaseGraph(
      devbarData?.time ?? {},
      sweetlinkData?.time ?? {},
    );

    // Extract curated stable entries for the table below
    const devbarEntries = devbarData ? extractEntries('devbar', devbarData.time) : [];
    const sweetlinkEntries = sweetlinkData ? extractEntries('sweetlink', sweetlinkData.time) : [];
    // Only show versions that have curated release notes
    const all = [...devbarEntries, ...sweetlinkEntries]
      .filter((e) => RELEASE_NOTES[e.pkg]?.[e.version])
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const container = document.getElementById('changelog-list');
    if (!container) return;

    // Clear loading state
    while (container.firstChild) container.removeChild(container.firstChild);

    if (all.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'changelog-loading';
      empty.textContent = 'No release data available';
      container.appendChild(empty);
      return;
    }

    for (const entry of all) {
      const row = document.createElement('div');
      row.className = 'changelog-entry';

      const version = document.createElement('a');
      version.className = 'changelog-version';
      version.href = `https://www.npmjs.com/package/@ytspar/${entry.pkg}/v/${entry.version}`;
      version.target = '_blank';
      version.rel = 'noopener noreferrer';
      version.textContent = `v${entry.version}`;

      const pkg = document.createElement('span');
      pkg.className = `changelog-pkg changelog-pkg-${entry.pkg}`;
      pkg.textContent = entry.pkg;

      const desc = document.createElement('span');
      desc.className = 'changelog-desc';
      desc.textContent = RELEASE_NOTES[entry.pkg]?.[entry.version] ?? '';

      const date = document.createElement('span');
      date.className = 'changelog-date';
      date.textContent = formatDate(entry.date);

      row.appendChild(version);
      row.appendChild(pkg);
      row.appendChild(desc);
      row.appendChild(date);
      container.appendChild(row);
    }
  });
}

/**
 * Extract version entries from npm time data.
 * Skips "created", "modified", and pre-release versions (canary, alpha, beta, rc).
 */
function extractEntries(pkg: string, time: Record<string, string>): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  for (const [key, dateStr] of Object.entries(time)) {
    if (key === 'created' || key === 'modified') continue;
    if (key.includes('-')) continue; // skip canary, alpha, beta, rc
    entries.push({ pkg, version: key, date: dateStr });
  }
  return entries;
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
function highlightCode(code: string, language: 'typescript' | 'bash' = 'typescript', label = 'Code example'): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'code-block';
  pre.setAttribute('tabindex', '0');
  pre.setAttribute('role', 'region');
  pre.setAttribute('aria-label', label);
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
    if (/\d/.test(code[i]!)) {
      let j = i;
      while (j < code.length && /[\d.]/.test(code[j]!)) j++;
      tokens.push({ type: 'number', value: code.slice(i, j) });
      i = j;
      continue;
    }

    // Words (keywords, identifiers)
    if (/[a-zA-Z_$]/.test(code[i]!)) {
      let j = i;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j]!)) j++;
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
    if (/[{}()[\];:,.<>=+\-*/&|!?]/.test(code[i]!)) {
      tokens.push({ type: 'operator', value: code[i]! });
      i++;
      continue;
    }

    // Whitespace and other
    tokens.push({ type: 'text', value: code[i]! });
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
  content1.appendChild(highlightCode(`pnpm add @ytspar/devbar @ytspar/sweetlink`, 'bash', 'Install command'));
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
      'typescript',
      'Vite configuration'
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
      'typescript',
      'DevBar initialization'
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
      'bash',
      'CLI commands'
    )
  );
  stepsContainer.appendChild(step4);

  section.appendChild(stepsContainer);
  return section;
}
