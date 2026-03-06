import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OutlineNode } from '@ytspar/sweetlink/types';
import { extractDocumentOutline, outlineToMarkdown } from './outline.js';

// ============================================================================
// extractDocumentOutline
// ============================================================================

describe('extractDocumentOutline', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns empty array for empty body', () => {
    expect(extractDocumentOutline()).toEqual([]);
  });

  it('extracts heading elements with correct levels', () => {
    document.body.innerHTML = `
      <h1>Title</h1>
      <h2>Subtitle</h2>
      <h3>Sub-subtitle</h3>
      <h4>Level 4</h4>
      <h5>Level 5</h5>
      <h6>Level 6</h6>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(6);
    expect(outline[0]).toMatchObject({ tagName: 'h1', level: 1, text: 'Title', category: 'heading' });
    expect(outline[1]).toMatchObject({ tagName: 'h2', level: 2, text: 'Subtitle' });
    expect(outline[2]).toMatchObject({ tagName: 'h3', level: 3 });
    expect(outline[3]).toMatchObject({ tagName: 'h4', level: 4 });
    expect(outline[4]).toMatchObject({ tagName: 'h5', level: 5 });
    expect(outline[5]).toMatchObject({ tagName: 'h6', level: 6 });
  });

  it('extracts landmark elements (main, header, footer)', () => {
    document.body.innerHTML = `
      <header><h1>Site Header</h1></header>
      <main><p>Content</p></main>
      <footer><p>Footer</p></footer>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(3);
    expect(outline[0]).toMatchObject({ tagName: 'header', category: 'landmark' });
    expect(outline[1]).toMatchObject({ tagName: 'main', category: 'landmark' });
    expect(outline[2]).toMatchObject({ tagName: 'footer', category: 'landmark' });
  });

  it('extracts nav with heading text', () => {
    document.body.innerHTML = `
      <nav>
        <h2>Site Navigation</h2>
        <a href="/">Home</a>
      </nav>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].tagName).toBe('nav');
    expect(outline[0].text).toBe('Site Navigation');
    expect(outline[0].category).toBe('sectioning');
  });

  it('extracts nav with first link fallback when no heading', () => {
    document.body.innerHTML = `
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
      </nav>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].text).toContain('Navigation');
    expect(outline[0].text).toContain('Home');
  });

  it('uses aria-label for element text', () => {
    document.body.innerHTML = `
      <nav aria-label="Primary">
        <a href="/">Home</a>
      </nav>
    `;
    const outline = extractDocumentOutline();

    expect(outline[0].text).toBe('Primary');
  });

  it('uses aria-labelledby for element text', () => {
    document.body.innerHTML = `
      <h2 id="nav-label">Main Navigation</h2>
      <nav aria-labelledby="nav-label">
        <a href="/">Home</a>
      </nav>
    `;
    const outline = extractDocumentOutline();

    const navNode = outline.find((n) => n.tagName === 'nav');
    expect(navNode).toBeDefined();
    expect(navNode!.text).toBe('Main Navigation');
  });

  it('extracts form with name attribute', () => {
    document.body.innerHTML = `
      <form name="signup">
        <input type="text" />
      </form>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0]).toMatchObject({ tagName: 'form', text: 'signup', category: 'form' });
  });

  it('extracts form with id when no name', () => {
    document.body.innerHTML = `
      <form id="contact-form">
        <input type="text" />
      </form>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].text).toBe('contact-form');
    expect(outline[0].id).toBe('contact-form');
  });

  it('extracts fieldset with legend', () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Account Details</legend>
        <input type="text" />
      </fieldset>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0]).toMatchObject({ tagName: 'fieldset', text: 'Account Details', category: 'form' });
  });

  it('extracts figure with figcaption', () => {
    document.body.innerHTML = `
      <figure>
        <img src="test.png" alt="test" />
        <figcaption>A test image</figcaption>
      </figure>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0]).toMatchObject({ tagName: 'figure', text: 'A test image', category: 'grouping' });
  });

  it('extracts details with summary', () => {
    document.body.innerHTML = `
      <details>
        <summary>Click to expand</summary>
        <p>Content</p>
      </details>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0]).toMatchObject({ tagName: 'details', text: 'Click to expand', category: 'grouping' });
  });

  it('extracts table with caption', () => {
    document.body.innerHTML = `
      <table>
        <caption>Sales Data</caption>
        <tr><th>Month</th><th>Revenue</th></tr>
      </table>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0]).toMatchObject({ tagName: 'table', text: 'Sales Data', category: 'table' });
  });

  it('extracts unordered list with item count', () => {
    document.body.innerHTML = `
      <ul>
        <li>A</li>
        <li>B</li>
        <li>C</li>
      </ul>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].tagName).toBe('ul');
    expect(outline[0].text).toMatch(/\d+ items/);
    expect(outline[0].category).toBe('list');
  });

  it('extracts ordered list', () => {
    document.body.innerHTML = `
      <ol>
        <li>First</li>
        <li>Second</li>
      </ol>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].tagName).toBe('ol');
    expect(outline[0].text).toMatch(/\d+ items/);
  });

  it('extracts definition list with term count', () => {
    document.body.innerHTML = `
      <dl>
        <dt>Term 1</dt>
        <dd>Def 1</dd>
        <dt>Term 2</dt>
        <dd>Def 2</dd>
      </dl>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].tagName).toBe('dl');
    expect(outline[0].text).toMatch(/\d+ terms/);
  });

  it('captures element id', () => {
    document.body.innerHTML = `<section id="intro"><h2>Intro</h2></section>`;
    const outline = extractDocumentOutline();

    expect(outline[0].id).toBe('intro');
  });

  it('id is undefined when element has no id', () => {
    document.body.innerHTML = `<h1>No ID</h1>`;
    const outline = extractDocumentOutline();

    expect(outline[0].id).toBeUndefined();
  });

  it('skips hidden elements (display: none)', () => {
    document.body.innerHTML = `
      <h1>Visible</h1>
      <h2 style="display: none">Hidden</h2>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].text).toBe('Visible');
  });

  it('skips hidden elements (visibility: hidden)', () => {
    document.body.innerHTML = `
      <h1>Visible</h1>
      <h2 style="visibility: hidden">Invisible</h2>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].text).toBe('Visible');
  });

  it('skips elements with data-devbar attribute', () => {
    document.body.innerHTML = `
      <h1>Content</h1>
      <div data-devbar="true"><h2>Devbar UI</h2></div>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].text).toBe('Content');
  });

  it('recurses through non-semantic elements', () => {
    document.body.innerHTML = `
      <div>
        <span>
          <h1>Deeply Nested</h1>
        </span>
      </div>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].text).toBe('Deeply Nested');
  });

  it('headings do not have children', () => {
    document.body.innerHTML = `
      <h1>Title <span>extra</span></h1>
    `;
    const outline = extractDocumentOutline();

    expect(outline[0].children).toEqual([]);
  });

  it('non-heading semantic elements have children', () => {
    document.body.innerHTML = `
      <main>
        <h1>Title</h1>
        <section>
          <h2>Section</h2>
        </section>
      </main>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].tagName).toBe('main');
    expect(outline[0].children.length).toBeGreaterThan(0);
  });

  it('section without heading falls back to class name', () => {
    document.body.innerHTML = `
      <section class="hero-banner">
        <p>Some content</p>
      </section>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].text).toBe('hero-banner');
  });

  it('article with direct child heading uses heading text', () => {
    document.body.innerHTML = `
      <article>
        <h2>Article Title</h2>
        <p>Content</p>
      </article>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].tagName).toBe('article');
    expect(outline[0].text).toBe('Article Title');
  });

  it('element with role attribute uses role as fallback text', () => {
    document.body.innerHTML = `
      <section role="banner">
        <p>No heading here</p>
      </section>
    `;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].text).toContain('banner');
  });

  it('semantic element without text uses tag name fallback', () => {
    document.body.innerHTML = `<main></main>`;
    const outline = extractDocumentOutline();

    expect(outline).toHaveLength(1);
    expect(outline[0].text).toBe('<main>');
  });

  it('semantic element without text and not landmark/heading is skipped, children extracted', () => {
    document.body.innerHTML = `
      <form>
        <fieldset>
          <legend>Details</legend>
        </fieldset>
      </form>
    `;
    const outline = extractDocumentOutline();

    const fieldset = outline.find((n) => n.tagName === 'fieldset');
    expect(fieldset).toBeDefined();
    expect(fieldset!.text).toBe('Details');
  });

  it('handles complex nested document structure', () => {
    document.body.innerHTML = `
      <header>
        <nav aria-label="Main">
          <a href="/">Home</a>
        </nav>
      </header>
      <main>
        <h1>Page Title</h1>
        <article>
          <h2>Article One</h2>
          <section>
            <h3>Section A</h3>
          </section>
        </article>
        <aside class="sidebar">
          <h2>Related</h2>
        </aside>
      </main>
      <footer>
        <p>Footer content</p>
      </footer>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBeGreaterThanOrEqual(3);
    const mainNode = outline.find((n) => n.tagName === 'main');
    expect(mainNode).toBeDefined();
    expect(mainNode!.children.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// outlineToMarkdown
// ============================================================================

describe('outlineToMarkdown', () => {
  it('generates header for empty outline', () => {
    const md = outlineToMarkdown([]);

    expect(md).toContain('# Document Outline');
    expect(md).toContain('**Semantic Categories:**');
    expect(md).toContain('`heading` - h1-h6 elements');
    expect(md).toContain('`sectioning`');
    expect(md).toContain('`landmark`');
    expect(md).toContain('`grouping`');
    expect(md).toContain('`form`');
    expect(md).toContain('`table`');
    expect(md).toContain('`list`');
    expect(md).toContain('---');
  });

  it('formats root-level headings as markdown headings', () => {
    const outline: OutlineNode[] = [
      { tagName: 'h1', level: 1, text: 'Main Title', category: 'heading', children: [] },
      { tagName: 'h2', level: 2, text: 'Sub Title', category: 'heading', children: [] },
      { tagName: 'h3', level: 3, text: 'Sub Sub', category: 'heading', children: [] },
    ];
    const md = outlineToMarkdown(outline);

    expect(md).toContain('# `<h1>` Main Title');
    expect(md).toContain('## `<h2>` Sub Title');
    expect(md).toContain('### `<h3>` Sub Sub');
  });

  it('formats non-heading nodes as list items with category', () => {
    const outline: OutlineNode[] = [
      { tagName: 'main', level: 0, text: '<main>', category: 'landmark', children: [] },
      { tagName: 'nav', level: 0, text: 'Primary', category: 'sectioning', children: [] },
    ];
    const md = outlineToMarkdown(outline);

    expect(md).toContain('- `<main>` [landmark] <main>');
    expect(md).toContain('- `<nav>` [sectioning] Primary');
  });

  it('includes element id as anchor', () => {
    const outline: OutlineNode[] = [
      { tagName: 'h1', level: 1, text: 'Title', id: 'top', category: 'heading', children: [] },
    ];
    const md = outlineToMarkdown(outline);

    expect(md).toContain('`#top`');
  });

  it('indents children at increasing depth', () => {
    const outline: OutlineNode[] = [
      {
        tagName: 'main',
        level: 0,
        text: '<main>',
        category: 'landmark',
        children: [
          {
            tagName: 'article',
            level: 0,
            text: 'Post',
            category: 'sectioning',
            children: [
              {
                tagName: 'section',
                level: 0,
                text: 'Intro',
                category: 'sectioning',
                children: [],
              },
            ],
          },
        ],
      },
    ];
    const md = outlineToMarkdown(outline);

    expect(md).toContain('- `<main>`');
    expect(md).toContain('  - `<article>`');
    expect(md).toContain('    - `<section>`');
  });

  it('heading inside a nested context is formatted as list item', () => {
    const outline: OutlineNode[] = [
      {
        tagName: 'main',
        level: 0,
        text: '<main>',
        category: 'landmark',
        children: [
          { tagName: 'h1', level: 1, text: 'Nested Heading', category: 'heading', children: [] },
        ],
      },
    ];
    const md = outlineToMarkdown(outline);

    expect(md).toContain('  - `<h1>` [heading] Nested Heading');
  });

  it('omits category when not defined', () => {
    const outline: OutlineNode[] = [
      { tagName: 'div', level: 0, text: 'Custom', children: [] },
    ];
    const md = outlineToMarkdown(outline);

    expect(md).toContain('- `<div>` Custom');
    expect(md).not.toContain('[undefined]');
  });

  it('does not include header when called with non-zero indent', () => {
    const outline: OutlineNode[] = [
      { tagName: 'section', level: 0, text: 'Child', category: 'sectioning', children: [] },
    ];
    const md = outlineToMarkdown(outline, 1);

    expect(md).not.toContain('# Document Outline');
    expect(md).toContain('  - `<section>`');
  });
});
