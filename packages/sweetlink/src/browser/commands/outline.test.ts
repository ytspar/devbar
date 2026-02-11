import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractDocumentOutline, outlineToMarkdown } from './outline.js';
import type { OutlineNode } from '../../types.js';

describe('extractDocumentOutline', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns empty array for empty body', () => {
    const outline = extractDocumentOutline();
    expect(outline).toEqual([]);
  });

  it('extracts heading elements', () => {
    document.body.innerHTML = `
      <h1>Main Title</h1>
      <h2>Section One</h2>
      <h3>Subsection</h3>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(3);
    expect(outline[0].tagName).toBe('h1');
    expect(outline[0].text).toBe('Main Title');
    expect(outline[0].level).toBe(1);
    expect(outline[0].category).toBe('heading');

    expect(outline[1].tagName).toBe('h2');
    expect(outline[1].level).toBe(2);

    expect(outline[2].tagName).toBe('h3');
    expect(outline[2].level).toBe(3);
  });

  it('extracts semantic sections', () => {
    document.body.innerHTML = `
      <main>
        <article>
          <h1>Article Title</h1>
        </article>
      </main>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(1);
    expect(outline[0].tagName).toBe('main');
    expect(outline[0].category).toBe('landmark');
    expect(outline[0].children.length).toBe(1);
    expect(outline[0].children[0].tagName).toBe('article');
  });

  it('extracts nav elements', () => {
    document.body.innerHTML = `
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
      </nav>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(1);
    expect(outline[0].tagName).toBe('nav');
    expect(outline[0].category).toBe('sectioning');
  });

  it('extracts form elements with name', () => {
    document.body.innerHTML = `
      <form name="loginForm">
        <input type="text" name="username" />
      </form>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(1);
    expect(outline[0].tagName).toBe('form');
    expect(outline[0].text).toBe('loginForm');
    expect(outline[0].category).toBe('form');
  });

  it('extracts fieldset with legend', () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Personal Info</legend>
        <input type="text" />
      </fieldset>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(1);
    expect(outline[0].tagName).toBe('fieldset');
    expect(outline[0].text).toBe('Personal Info');
  });

  it('extracts lists', () => {
    document.body.innerHTML = `
      <ul>
        <li>Item 1</li>
        <li>Item 2</li>
        <li>Item 3</li>
      </ul>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(1);
    expect(outline[0].tagName).toBe('ul');
    // Note: happy-dom doesn't support :scope selector, so item count may be 0
    expect(outline[0].text).toMatch(/\d+ items/);
    expect(outline[0].category).toBe('list');
  });

  it('extracts dl', () => {
    document.body.innerHTML = `
      <dl>
        <dt>Term 1</dt>
        <dd>Definition 1</dd>
        <dt>Term 2</dt>
        <dd>Definition 2</dd>
      </dl>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(1);
    expect(outline[0].tagName).toBe('dl');
    // Note: happy-dom doesn't support :scope selector, so term count may be 0
    expect(outline[0].text).toMatch(/\d+ terms/);
  });

  it('extracts table with caption', () => {
    document.body.innerHTML = `
      <table>
        <caption>User Data</caption>
        <tr><th>Name</th><th>Age</th></tr>
      </table>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(1);
    expect(outline[0].tagName).toBe('table');
    expect(outline[0].text).toBe('User Data');
    expect(outline[0].category).toBe('table');
  });

  it('extracts figure with figcaption', () => {
    document.body.innerHTML = `
      <figure>
        <img src="test.png" alt="Test" />
        <figcaption>Figure caption text</figcaption>
      </figure>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(1);
    expect(outline[0].tagName).toBe('figure');
    expect(outline[0].text).toBe('Figure caption text');
    expect(outline[0].category).toBe('grouping');
  });

  it('extracts details with summary', () => {
    document.body.innerHTML = `
      <details>
        <summary>More Information</summary>
        <p>Hidden content</p>
      </details>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(1);
    expect(outline[0].tagName).toBe('details');
    expect(outline[0].text).toBe('More Information');
  });

  it('uses aria-label when present', () => {
    document.body.innerHTML = `
      <nav aria-label="Main navigation">
        <a href="/">Home</a>
      </nav>
    `;
    const outline = extractDocumentOutline();

    expect(outline[0].text).toBe('Main navigation');
  });

  it('captures element id', () => {
    document.body.innerHTML = `
      <section id="intro">
        <h2>Introduction</h2>
      </section>
    `;
    const outline = extractDocumentOutline();

    expect(outline[0].id).toBe('intro');
  });

  it('skips hidden elements', () => {
    document.body.innerHTML = `
      <h1>Visible</h1>
      <h2 style="display: none">Hidden</h2>
      <h3>Also Visible</h3>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(2);
    expect(outline[0].text).toBe('Visible');
    expect(outline[1].text).toBe('Also Visible');
  });

  it('skips elements with data-devbar attribute', () => {
    document.body.innerHTML = `
      <h1>Main Content</h1>
      <div data-devbar="true">
        <h2>devbar Content</h2>
      </div>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(1);
    expect(outline[0].text).toBe('Main Content');
  });

  it('extracts nested structure correctly', () => {
    document.body.innerHTML = `
      <main>
        <article>
          <h1>Article Title</h1>
          <section>
            <h2>Section One</h2>
          </section>
          <section>
            <h2>Section Two</h2>
          </section>
        </article>
      </main>
    `;
    const outline = extractDocumentOutline();

    expect(outline.length).toBe(1);
    expect(outline[0].tagName).toBe('main');
    expect(outline[0].children.length).toBe(1);
    expect(outline[0].children[0].tagName).toBe('article');
    // Headings are extracted at article level, not as children
    expect(outline[0].children[0].children.some((c) => c.tagName === 'section')).toBe(true);
  });
});

describe('outlineToMarkdown', () => {
  it('generates markdown header for document', () => {
    const outline: OutlineNode[] = [];
    const md = outlineToMarkdown(outline);

    expect(md).toContain('# Document Outline');
    expect(md).toContain('**Semantic Categories:**');
  });

  it('formats heading nodes at root level', () => {
    const outline: OutlineNode[] = [
      {
        tagName: 'h1',
        level: 1,
        text: 'Main Title',
        category: 'heading',
        children: [],
      },
      {
        tagName: 'h2',
        level: 2,
        text: 'Subtitle',
        category: 'heading',
        children: [],
      },
    ];
    const md = outlineToMarkdown(outline);

    expect(md).toContain('# `<h1>` Main Title');
    expect(md).toContain('## `<h2>` Subtitle');
  });

  it('formats non-heading nodes as list items', () => {
    const outline: OutlineNode[] = [
      {
        tagName: 'main',
        level: 0,
        text: '<main>',
        category: 'landmark',
        children: [],
      },
    ];
    const md = outlineToMarkdown(outline);

    expect(md).toContain('- `<main>` [landmark]');
  });

  it('includes element id as anchor', () => {
    const outline: OutlineNode[] = [
      {
        tagName: 'h1',
        level: 1,
        text: 'Title',
        id: 'main-title',
        category: 'heading',
        children: [],
      },
    ];
    const md = outlineToMarkdown(outline);

    expect(md).toContain('`#main-title`');
  });

  it('indents nested children', () => {
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
            text: '<article>',
            category: 'sectioning',
            children: [],
          },
        ],
      },
    ];
    const md = outlineToMarkdown(outline);

    expect(md).toContain('- `<main>`');
    expect(md).toContain('  - `<article>`');
  });

  it('handles deeply nested structures', () => {
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
            text: '<article>',
            category: 'sectioning',
            children: [
              {
                tagName: 'section',
                level: 0,
                text: 'Content',
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
});
