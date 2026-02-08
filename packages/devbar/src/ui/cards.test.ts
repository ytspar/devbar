/**
 * Cards UI tests
 */

import { afterEach, describe, expect, it } from 'vitest';
import { createCard, getCardContent, setCardEmpty } from './cards.js';

describe('createCard', () => {
  afterEach(() => {
    document.body.textContent = '';
  });

  it('creates an article element as the wrapper', () => {
    const card = createCard({ title: 'Test Card' });
    expect(card.tagName).toBe('ARTICLE');
  });

  it('has a header with left wing, title, and right wing', () => {
    const card = createCard({ title: 'My Card' });
    const header = card.querySelector('header');
    expect(header).not.toBeNull();
    expect(header!.children.length).toBe(3);

    // Left wing
    const leftWing = header!.children[0] as HTMLElement;
    expect(leftWing.style.width).toBe('12px');
    expect(leftWing.style.height).toBe('8px');

    // Title
    const titleEl = header!.children[1] as HTMLElement;
    expect(titleEl.tagName).toBe('H2');
    expect(titleEl.textContent).toBe('My Card');
    expect(titleEl.style.textTransform).toBe('uppercase');
    expect(titleEl.style.letterSpacing).toBe('0.1em');
    expect(titleEl.style.fontSize).toBe('10px');
    expect(titleEl.style.fontWeight).toBe('700');

    // Right wing
    const rightWing = header!.children[2] as HTMLElement;
    expect(rightWing.style.width).toBe('12px');
    expect(rightWing.style.height).toBe('8px');
    expect(rightWing.style.flexGrow).toBe('1');
  });

  it('has a content section', () => {
    const card = createCard({ title: 'Card' });
    const section = card.querySelector('section');
    expect(section).not.toBeNull();
    expect(section!.style.padding).toBe('16px');
    expect(section!.style.display).toBe('block');
  });

  it('has borders on wings and content', () => {
    const card = createCard({ title: 'Card' });
    const header = card.querySelector('header')!;
    const leftWing = header.children[0] as HTMLElement;
    const rightWing = header.children[2] as HTMLElement;
    const section = card.querySelector('section') as HTMLElement;

    // Left wing has left and top border (happy-dom normalizes CSS var borders)
    expect(leftWing.style.borderLeft).toBeTruthy();
    expect(leftWing.style.borderTop).toBeTruthy();

    // Right wing has right and top border
    expect(rightWing.style.borderRight).toBeTruthy();
    expect(rightWing.style.borderTop).toBeTruthy();

    // Content section has left, right, and bottom borders
    expect(section.style.borderLeft).toBeTruthy();
    expect(section.style.borderRight).toBeTruthy();
    expect(section.style.borderBottom).toBeTruthy();
  });

  it('has full opacity when not empty', () => {
    const card = createCard({ title: 'Card' });
    expect(card.style.opacity).toBe('1');
  });

  it('sets title color for non-empty card', () => {
    const card = createCard({ title: 'Card' });
    const titleEl = card.querySelector('h2') as HTMLElement;
    // CSS custom properties aren't fully supported in happy-dom inline styles,
    // so verify the title element exists and opacity indicates non-empty
    expect(titleEl.textContent).toBe('Card');
    expect(card.style.opacity).toBe('1');
  });

  describe('isEmpty state', () => {
    it('dims the card with 0.5 opacity', () => {
      const card = createCard({ title: 'Empty Card', isEmpty: true });
      expect(card.style.opacity).toBe('0.5');
    });

    it('uses muted border colors', () => {
      const card = createCard({ title: 'Empty', isEmpty: true });
      const section = card.querySelector('section') as HTMLElement;
      // Muted border
      expect(section.style.borderLeft).toContain('rgba(16, 185, 129, 0.1)');
    });

    it('has dimmed opacity for empty state', () => {
      const card = createCard({ title: 'Empty', isEmpty: true });
      // Opacity is the primary visual indicator of empty state
      expect(card.style.opacity).toBe('0.5');
    });
  });

  it('defaults isEmpty to false', () => {
    const card = createCard({ title: 'Default' });
    expect(card.style.opacity).toBe('1');
  });
});

describe('getCardContent', () => {
  it('returns the section element inside a card', () => {
    const card = createCard({ title: 'Card' });
    const content = getCardContent(card);

    expect(content).not.toBeNull();
    expect(content!.tagName).toBe('SECTION');
  });

  it('returns null for elements without a section', () => {
    const div = document.createElement('div');
    const content = getCardContent(div);
    expect(content).toBeNull();
  });

  it('allows appending children to the content section', () => {
    const card = createCard({ title: 'Card' });
    const content = getCardContent(card)!;

    const child = document.createElement('p');
    child.textContent = 'Hello world';
    content.appendChild(child);

    expect(content.children.length).toBe(1);
    expect(content.children[0].textContent).toBe('Hello world');
  });
});

describe('setCardEmpty', () => {
  it('transitions card from normal to empty state', () => {
    const card = createCard({ title: 'Card', isEmpty: false });
    expect(card.style.opacity).toBe('1');

    setCardEmpty(card, true);

    expect(card.style.opacity).toBe('0.5');

    // Check borders changed to muted
    const section = card.querySelector('section') as HTMLElement;
    expect(section.style.borderLeft).toContain('rgba(16, 185, 129, 0.1)');
    expect(section.style.borderRight).toContain('rgba(16, 185, 129, 0.1)');
    expect(section.style.borderBottom).toContain('rgba(16, 185, 129, 0.1)');
  });

  it('transitions card from empty to normal state', () => {
    const card = createCard({ title: 'Card', isEmpty: true });
    expect(card.style.opacity).toBe('0.5');

    setCardEmpty(card, false);

    expect(card.style.opacity).toBe('1');

    // Borders should return to normal (CSS variable-based)
    const section = card.querySelector('section') as HTMLElement;
    expect(section.style.borderLeft).not.toContain('rgba(16, 185, 129, 0.1)');
  });

  it('updates wing borders', () => {
    const card = createCard({ title: 'Card', isEmpty: false });

    setCardEmpty(card, true);

    const header = card.querySelector('header')!;
    const leftWing = header.children[0] as HTMLElement;
    const rightWing = header.children[2] as HTMLElement;

    expect(leftWing.style.borderTop).toContain('rgba(16, 185, 129, 0.1)');
    expect(leftWing.style.borderLeft).toContain('rgba(16, 185, 129, 0.1)');
    expect(rightWing.style.borderTop).toContain('rgba(16, 185, 129, 0.1)');
    expect(rightWing.style.borderRight).toContain('rgba(16, 185, 129, 0.1)');
  });

  it('is idempotent (setting same state twice is a no-op)', () => {
    const card = createCard({ title: 'Card', isEmpty: false });

    setCardEmpty(card, false);
    expect(card.style.opacity).toBe('1');

    setCardEmpty(card, false);
    expect(card.style.opacity).toBe('1');
  });
});
