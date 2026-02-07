/**
 * Demo content for testing devbar and Sweetlink features
 *
 * Provides various UI elements and interactive controls for testing:
 * - Screenshot capture
 * - Console log capture (info, warn, error)
 * - DOM queries
 * - Document outline extraction
 * - Schema extraction (JSON-LD, Open Graph)
 */

/**
 * Create the main demo content container
 */
export function createDemoContent(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'demo-container';

  // Header section
  container.appendChild(createHeader());

  // Main content grid
  const grid = document.createElement('div');
  grid.className = 'demo-grid';

  grid.appendChild(createConsoleTestSection());
  grid.appendChild(createDomQuerySection());
  grid.appendChild(createFormSection());
  grid.appendChild(createTableSection());

  container.appendChild(grid);

  // Footer
  container.appendChild(createFooter());

  return container;
}

/**
 * Create header with navigation for demo sections
 */
function createHeader(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'demo-header';

  // Navigation - text inset in horizontal line
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Demo navigation');

  const navLinks = ['Console Tests', 'DOM Queries', 'Forms', 'Tables'];
  navLinks.forEach((text, i) => {
    // Line segment before each link
    const line = document.createElement('div');
    line.className = 'nav-line';
    nav.appendChild(line);

    const link = document.createElement('a');
    link.href = `#section-${i + 1}`;
    link.textContent = text;
    nav.appendChild(link);
  });

  // Final line segment
  const endLine = document.createElement('div');
  endLine.className = 'nav-line';
  nav.appendChild(endLine);

  header.appendChild(nav);

  return header;
}

/**
 * Console test section - buttons to trigger various log levels
 */
function createConsoleTestSection(): HTMLElement {
  const { section, content } = createNotchedSection('section-1', 'Console Log Tests');

  const description = document.createElement('p');
  description.textContent =
    'Click buttons to trigger console messages. devbar captures these and shows badges for errors/warnings.';
  content.appendChild(description);

  const buttonGroup = document.createElement('div');
  buttonGroup.className = 'button-group';

  // Helper to log with timestamp
  const logMessage = (level: 'log' | 'info' | 'warn' | 'error', message: string) => {
    console[level](`[Test] ${message}`, { timestamp: Date.now() });
  };

  // Console test buttons
  const buttons: Array<{
    label: string;
    variant: 'info' | 'warning' | 'error' | 'secondary';
    action: () => void;
  }> = [
    {
      label: 'Log Info',
      variant: 'info',
      action: () => logMessage('info', 'This is an info message'),
    },
    {
      label: 'Log Warning',
      variant: 'warning',
      action: () => logMessage('warn', 'This is a warning message'),
    },
    {
      label: 'Log Error',
      variant: 'error',
      action: () => logMessage('error', 'This is an error message'),
    },
    {
      label: 'Log Multiple',
      variant: 'secondary',
      action: () => {
        logMessage('log', 'First log (debug)');
        logMessage('info', 'Second log (info)');
        logMessage('warn', 'Third log (warning)');
        logMessage('error', 'Fourth log (error)');
      },
    },
  ];

  for (const { label, variant, action } of buttons) {
    buttonGroup.appendChild(createButton(label, variant, action));
  }

  content.appendChild(buttonGroup);

  return section;
}

/**
 * DOM Query test section - elements with various selectors
 */
function createDomQuerySection(): HTMLElement {
  const { section, content } = createNotchedSection('section-2', 'DOM Query Tests');

  const description = document.createElement('p');
  description.textContent =
    'Elements with various IDs, classes, and data attributes for testing DOM queries.';
  content.appendChild(description);

  // Cards with different selectors
  const cardContainer = document.createElement('div');
  cardContainer.className = 'card-container';

  const cards = [
    { id: 'card-primary', class: 'card primary', text: 'Primary Card', data: 'primary' },
    { id: 'card-secondary', class: 'card secondary', text: 'Secondary Card', data: 'secondary' },
    { id: 'card-accent', class: 'card accent', text: 'Accent Card', data: 'accent' },
  ];

  cards.forEach(({ id, class: className, text, data }) => {
    const card = document.createElement('div');
    card.id = id;
    card.className = className;
    card.dataset.type = data;
    card.textContent = text;
    cardContainer.appendChild(card);
  });

  content.appendChild(cardContainer);

  // Test list
  const listContainer = document.createElement('div');
  listContainer.className = 'list-container';

  const h3 = document.createElement('h3');
  h3.textContent = 'Test List Items';
  listContainer.appendChild(h3);

  const ul = document.createElement('ul');
  ul.className = 'test-list';
  ul.id = 'query-test-list';

  for (let i = 1; i <= 5; i++) {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.dataset.index = String(i);
    li.textContent = `List item ${i}`;
    ul.appendChild(li);
  }

  listContainer.appendChild(ul);
  content.appendChild(listContainer);

  return section;
}

/**
 * Form section - various input types
 */
function createFormSection(): HTMLElement {
  const { section, content } = createNotchedSection('section-3', 'Form Elements');

  const description = document.createElement('p');
  description.textContent = 'Various form elements for testing interactions and screenshots.';
  content.appendChild(description);

  const form = document.createElement('form');
  form.className = 'demo-form';
  form.onsubmit = (e) => {
    e.preventDefault();
    console.log('[Form] Form submitted', Object.fromEntries(new FormData(form)));
  };

  // Text input
  const textGroup = createFormGroup('text-input', 'Text Input', 'text', 'Enter some text...');
  form.appendChild(textGroup);

  // Email input
  const emailGroup = createFormGroup('email-input', 'Email', 'email', 'user@example.com');
  form.appendChild(emailGroup);

  // Select
  const selectGroup = document.createElement('div');
  selectGroup.className = 'form-group';

  const selectLabel = document.createElement('label');
  selectLabel.htmlFor = 'select-input';
  selectLabel.textContent = 'Select Option';
  selectGroup.appendChild(selectLabel);

  const select = document.createElement('select');
  select.id = 'select-input';
  select.name = 'option';

  ['Option 1', 'Option 2', 'Option 3'].forEach((text, i) => {
    const option = document.createElement('option');
    option.value = `option-${i + 1}`;
    option.textContent = text;
    select.appendChild(option);
  });

  selectGroup.appendChild(select);
  form.appendChild(selectGroup);

  // Checkbox group
  const checkboxGroup = document.createElement('div');
  checkboxGroup.className = 'form-group checkbox-group';

  const checkboxLabel = document.createElement('span');
  checkboxLabel.className = 'group-label';
  checkboxLabel.textContent = 'Checkboxes';
  checkboxGroup.appendChild(checkboxLabel);

  ['Check A', 'Check B', 'Check C'].forEach((text, i) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'checkbox-wrapper';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'checks';
    checkbox.value = `check-${String.fromCharCode(65 + i).toLowerCase()}`;
    wrapper.appendChild(checkbox);

    const span = document.createElement('span');
    span.textContent = text;
    wrapper.appendChild(span);

    checkboxGroup.appendChild(wrapper);
  });

  form.appendChild(checkboxGroup);

  // Submit button
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn primary';
  submitBtn.textContent = 'Submit Form';
  form.appendChild(submitBtn);

  content.appendChild(form);

  return section;
}

/**
 * Table section - sample data table
 */
function createTableSection(): HTMLElement {
  const { section, content } = createNotchedSection('section-4', 'Data Table');

  const description = document.createElement('p');
  description.textContent = 'Sample data table for testing screenshot capture and DOM queries.';
  content.appendChild(description);

  const table = document.createElement('table');
  table.className = 'demo-table';
  table.id = 'data-table';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['ID', 'Name', 'Status', 'Value'].forEach((text) => {
    const th = document.createElement('th');
    th.textContent = text;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  const data = [
    { id: 1, name: 'Alpha', status: 'Active', value: 100 },
    { id: 2, name: 'Beta', status: 'Pending', value: 250 },
    { id: 3, name: 'Gamma', status: 'Active', value: 175 },
    { id: 4, name: 'Delta', status: 'Inactive', value: 50 },
    { id: 5, name: 'Epsilon', status: 'Active', value: 300 },
  ];

  data.forEach((row) => {
    const tr = document.createElement('tr');
    tr.dataset.id = String(row.id);

    Object.values(row).forEach((value, i) => {
      const td = document.createElement('td');
      if (i === 2) {
        // Status column with badge
        const badge = document.createElement('span');
        badge.className = `status-badge ${String(value).toLowerCase()}`;
        badge.textContent = String(value);
        td.appendChild(badge);
      } else {
        td.textContent = String(value);
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  content.appendChild(table);

  return section;
}

/**
 * Create footer
 */
function createFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'demo-footer';

  // Line — label — line  (mirrors the nav header pattern)
  const rule = document.createElement('div');
  rule.className = 'footer-rule';

  const lineL = document.createElement('div');
  lineL.className = 'footer-line';
  rule.appendChild(lineL);

  const label = document.createElement('span');
  label.className = 'footer-label';
  label.textContent = 'By ytspar';
  rule.appendChild(label);

  const lineR = document.createElement('div');
  lineR.className = 'footer-line';
  rule.appendChild(lineR);

  footer.appendChild(rule);

  // Social links row
  const links = document.createElement('div');
  links.className = 'footer-links';

  const ghLink = document.createElement('a');
  ghLink.href = 'https://github.com/ytspar';
  ghLink.target = '_blank';
  ghLink.rel = 'noopener noreferrer';
  ghLink.className = 'footer-handle';
  ghLink.appendChild(createPixelGithubIcon());
  ghLink.appendChild(document.createTextNode(' github'));
  links.appendChild(ghLink);

  const twLink = document.createElement('a');
  twLink.href = 'https://twitter.com/ytspar';
  twLink.target = '_blank';
  twLink.rel = 'noopener noreferrer';
  twLink.className = 'footer-handle';
  twLink.appendChild(createPixelTwitterIcon());
  twLink.appendChild(document.createTextNode(' twitter'));
  links.appendChild(twLink);

  footer.appendChild(links);

  return footer;
}

function createPixelSvg(viewBox: string, shapes: Array<{ tag: string; attrs: Record<string, string> }>): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.verticalAlign = 'middle';
  for (const shape of shapes) {
    const el = document.createElementNS(ns, shape.tag);
    for (const [k, v] of Object.entries(shape.attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
  }
  return svg;
}

function createPixelGithubIcon(): SVGSVGElement {
  // Pixel-art GitHub octocat from pixel-social-media-icons
  return createPixelSvg('0 0 24 24', [
    { tag: 'polygon', attrs: { points: '23 9 23 15 22 15 22 17 21 17 21 19 20 19 20 20 19 20 19 21 18 21 18 22 16 22 16 23 15 23 15 18 14 18 14 17 15 17 15 16 17 16 17 15 18 15 18 14 19 14 19 9 18 9 18 6 16 6 16 7 15 7 15 8 14 8 14 7 10 7 10 8 9 8 9 7 8 7 8 6 6 6 6 9 5 9 5 14 6 14 6 15 7 15 7 16 9 16 9 18 7 18 7 17 6 17 6 16 4 16 4 17 5 17 5 19 6 19 6 20 9 20 9 23 8 23 8 22 6 22 6 21 5 21 5 20 4 20 4 19 3 19 3 17 2 17 2 15 1 15 1 9 2 9 2 7 3 7 3 5 4 5 4 4 5 4 5 3 7 3 7 2 9 2 9 1 15 1 15 2 17 2 17 3 19 3 19 4 20 4 20 5 21 5 21 7 22 7 22 9 23 9' } },
  ]);
}

function createPixelTwitterIcon(): SVGSVGElement {
  // Pixel-art Twitter bird from pixel-social-media-icons
  return createPixelSvg('0 0 24 24', [
    { tag: 'rect', attrs: { x: '22', y: '5', width: '1', height: '1' } },
    { tag: 'rect', attrs: { x: '22', y: '3', width: '1', height: '1' } },
    { tag: 'polygon', attrs: { points: '21 5 21 6 22 6 22 7 21 7 21 12 20 12 20 14 19 14 19 16 18 16 18 17 17 17 17 18 16 18 16 19 14 19 14 20 11 20 11 21 4 21 4 20 2 20 2 19 1 19 1 18 3 18 3 19 6 19 6 18 7 18 7 17 5 17 5 16 4 16 4 15 3 15 3 14 5 14 5 13 3 13 3 12 2 12 2 10 4 10 4 9 3 9 3 8 2 8 2 4 3 4 3 5 4 5 4 6 5 6 5 7 7 7 7 8 10 8 10 9 12 9 12 5 13 5 13 4 14 4 14 3 19 3 19 4 22 4 22 5 21 5' } },
  ]);
}

// Helper functions

/**
 * Create a notched section with wing header
 */
function createNotchedSection(
  id: string,
  title: string
): {
  section: HTMLElement;
  content: HTMLElement;
} {
  const section = document.createElement('section');
  section.id = id;
  section.className = 'demo-section';

  // Header with wings
  const header = document.createElement('div');
  header.className = 'demo-section-header';

  const leftWing = document.createElement('div');
  leftWing.className = 'demo-section-wing demo-section-wing-left';

  const h2 = document.createElement('h2');
  h2.textContent = title;

  const rightWing = document.createElement('div');
  rightWing.className = 'demo-section-wing demo-section-wing-right';

  header.appendChild(leftWing);
  header.appendChild(h2);
  header.appendChild(rightWing);

  // Content area
  const content = document.createElement('div');
  content.className = 'demo-section-content';

  section.appendChild(header);
  section.appendChild(content);

  return { section, content };
}

function createButton(
  text: string,
  variant: 'info' | 'warning' | 'error' | 'secondary',
  onClick: () => void
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn ${variant}`;
  btn.textContent = text;
  btn.onclick = onClick;
  return btn;
}

function createFormGroup(
  id: string,
  label: string,
  type: string,
  placeholder: string
): HTMLDivElement {
  const group = document.createElement('div');
  group.className = 'form-group';

  const labelEl = document.createElement('label');
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  group.appendChild(labelEl);

  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  input.name = id;
  input.placeholder = placeholder;
  group.appendChild(input);

  return group;
}
