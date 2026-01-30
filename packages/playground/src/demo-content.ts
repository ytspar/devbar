/**
 * Demo content for testing DevBar and Sweetlink features
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

  const h2 = document.createElement('h2');
  h2.textContent = 'Test the DevBar below';
  h2.style.marginBottom = '1rem';
  header.appendChild(h2);

  // Navigation for testing outline extraction
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Demo navigation');

  const navLinks = ['Console Tests', 'DOM Queries', 'Forms', 'Tables'];
  navLinks.forEach((text, i) => {
    const link = document.createElement('a');
    link.href = `#section-${i + 1}`;
    link.textContent = text;
    nav.appendChild(link);
  });

  header.appendChild(nav);

  return header;
}

/**
 * Console test section - buttons to trigger various log levels
 */
function createConsoleTestSection(): HTMLElement {
  const section = document.createElement('section');
  section.id = 'section-1';
  section.className = 'demo-section';

  const h2 = document.createElement('h2');
  h2.textContent = 'Console Log Tests';
  section.appendChild(h2);

  const description = document.createElement('p');
  description.textContent =
    'Click buttons to trigger console messages. DevBar captures these and shows badges for errors/warnings.';
  section.appendChild(description);

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

  section.appendChild(buttonGroup);

  return section;
}

/**
 * DOM Query test section - elements with various selectors
 */
function createDomQuerySection(): HTMLElement {
  const section = document.createElement('section');
  section.id = 'section-2';
  section.className = 'demo-section';

  const h2 = document.createElement('h2');
  h2.textContent = 'DOM Query Tests';
  section.appendChild(h2);

  const description = document.createElement('p');
  description.textContent =
    'Elements with various IDs, classes, and data attributes for testing DOM queries.';
  section.appendChild(description);

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

  section.appendChild(cardContainer);

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
  section.appendChild(listContainer);

  return section;
}

/**
 * Form section - various input types
 */
function createFormSection(): HTMLElement {
  const section = document.createElement('section');
  section.id = 'section-3';
  section.className = 'demo-section';

  const h2 = document.createElement('h2');
  h2.textContent = 'Form Elements';
  section.appendChild(h2);

  const description = document.createElement('p');
  description.textContent = 'Various form elements for testing interactions and screenshots.';
  section.appendChild(description);

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

  section.appendChild(form);

  return section;
}

/**
 * Table section - sample data table
 */
function createTableSection(): HTMLElement {
  const section = document.createElement('section');
  section.id = 'section-4';
  section.className = 'demo-section';

  const h2 = document.createElement('h2');
  h2.textContent = 'Data Table';
  section.appendChild(h2);

  const description = document.createElement('p');
  description.textContent = 'Sample data table for testing screenshot capture and DOM queries.';
  section.appendChild(description);

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
  section.appendChild(table);

  return section;
}

/**
 * Create footer
 */
function createFooter(): HTMLElement {
  const footer = document.createElement('footer');
  footer.className = 'demo-footer';

  const text = document.createElement('p');
  text.textContent = 'DevTools Playground - Built with Vite';
  footer.appendChild(text);

  const links = document.createElement('div');
  links.className = 'footer-links';

  const githubLink = document.createElement('a');
  githubLink.href = 'https://github.com/ytspar/devtools';
  githubLink.target = '_blank';
  githubLink.rel = 'noopener noreferrer';
  githubLink.textContent = 'GitHub';
  links.appendChild(githubLink);

  footer.appendChild(links);

  return footer;
}

// Helper functions

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
