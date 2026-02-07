/**
 * devbar Cards
 *
 * Notched card component with symmetric wing headers.
 * Inspired by Sacred Computer's terminal aesthetic.
 *
 * Structure:
 * ```
 * ┌───┐       ┌───┐
 * │   │ TITLE │   │  ← symmetric wings with title in gap
 * ├───┴───────┴───┤
 * │               │
 * │    CONTENT    │
 * │               │
 * └───────────────┘
 * ```
 */

import { CSS_COLORS, FONT_MONO } from '../constants.js';

/** Card configuration */
export interface CardConfig {
  /** Card title displayed in the header break */
  title: string;
  /** Empty state - dims the card */
  isEmpty?: boolean;
}

/** Wing width in pixels (symmetric) */
const WING_WIDTH = 12;

/** Wing height in pixels */
const WING_HEIGHT = 8;

/** Content padding in pixels */
const CONTENT_PADDING = 16;

/** Border color for cards */
const BORDER_COLOR = CSS_COLORS.border;

/** Muted border for empty state */
const BORDER_COLOR_MUTED = 'rgba(16, 185, 129, 0.1)';

/**
 * Create a notched card with wing header
 */
export function createCard(config: CardConfig): HTMLElement {
  const { title, isEmpty = false } = config;

  const borderColor = isEmpty ? BORDER_COLOR_MUTED : BORDER_COLOR;

  // Article wrapper
  const article = document.createElement('article');
  Object.assign(article.style, {
    position: 'relative',
    display: 'block',
    padding: '0',
    opacity: isEmpty ? '0.5' : '1',
  });

  // Header with wings
  const header = document.createElement('header');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'flex-end',
  });

  // Left wing
  const leftWing = document.createElement('div');
  Object.assign(leftWing.style, {
    width: `${WING_WIDTH}px`,
    height: `${WING_HEIGHT}px`,
    flexShrink: '0',
    borderLeft: `1px solid ${borderColor}`,
    borderTop: `1px solid ${borderColor}`,
  });

  // Title
  const titleEl = document.createElement('h2');
  Object.assign(titleEl.style, {
    flexShrink: '0',
    padding: '0 8px',
    fontSize: '10px',
    fontWeight: '700',
    fontFamily: FONT_MONO,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    lineHeight: '1',
    whiteSpace: 'nowrap',
    color: isEmpty ? `${CSS_COLORS.primary}b3` : CSS_COLORS.primary, // 70% opacity when empty
  });
  titleEl.textContent = title;

  // Right wing
  const rightWing = document.createElement('div');
  Object.assign(rightWing.style, {
    width: `${WING_WIDTH}px`,
    height: `${WING_HEIGHT}px`,
    flexShrink: '0',
    flexGrow: '1',
    borderRight: `1px solid ${borderColor}`,
    borderTop: `1px solid ${borderColor}`,
  });

  header.appendChild(leftWing);
  header.appendChild(titleEl);
  header.appendChild(rightWing);

  // Content section
  const content = document.createElement('section');
  Object.assign(content.style, {
    display: 'block',
    padding: `${CONTENT_PADDING}px`,
    borderLeft: `1px solid ${borderColor}`,
    borderRight: `1px solid ${borderColor}`,
    borderBottom: `1px solid ${borderColor}`,
  });

  article.appendChild(header);
  article.appendChild(content);

  return article;
}

/**
 * Get the content section of a card (for appending children)
 */
export function getCardContent(card: HTMLElement): HTMLElement | null {
  return card.querySelector('section');
}

/**
 * Update card empty state
 */
export function setCardEmpty(card: HTMLElement, isEmpty: boolean): void {
  const borderColor = isEmpty ? BORDER_COLOR_MUTED : BORDER_COLOR;

  card.style.opacity = isEmpty ? '0.5' : '1';

  // Update wing borders
  const wings = card.querySelectorAll('header > div');
  wings.forEach((wing) => {
    const el = wing as HTMLElement;
    if (el.style.borderLeft) el.style.borderLeft = `1px solid ${borderColor}`;
    if (el.style.borderRight) el.style.borderRight = `1px solid ${borderColor}`;
    el.style.borderTop = `1px solid ${borderColor}`;
  });

  // Update content borders
  const content = card.querySelector('section') as HTMLElement | null;
  if (content) {
    content.style.borderLeft = `1px solid ${borderColor}`;
    content.style.borderRight = `1px solid ${borderColor}`;
    content.style.borderBottom = `1px solid ${borderColor}`;
  }

  // Update title color
  const title = card.querySelector('h2') as HTMLElement | null;
  if (title) {
    title.style.color = isEmpty ? `${CSS_COLORS.primary}b3` : CSS_COLORS.primary;
  }
}
