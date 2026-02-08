import { describe, expect, it } from 'vitest';
import {
  MAX_LOG_MESSAGE_LENGTH,
  MAX_SLUG_LENGTH,
  SCREENSHOT_DIR,
  HMR_SCREENSHOT_DIR,
  generateSlugFromUrl,
  formatTimestampForFilename,
  generateBaseFilename,
  truncateMessage,
} from './urlUtils.js';

describe('constants', () => {
  it('MAX_SLUG_LENGTH is 50', () => {
    expect(MAX_SLUG_LENGTH).toBe(50);
  });

  it('MAX_LOG_MESSAGE_LENGTH is 200', () => {
    expect(MAX_LOG_MESSAGE_LENGTH).toBe(200);
  });

  it('SCREENSHOT_DIR is defined', () => {
    expect(SCREENSHOT_DIR).toBe('.tmp/sweetlink-screenshots');
  });

  it('HMR_SCREENSHOT_DIR is defined', () => {
    expect(HMR_SCREENSHOT_DIR).toBe('.tmp/hmr-screenshots');
  });
});

describe('generateSlugFromUrl', () => {
  it('generates slug from URL pathname', () => {
    const slug = generateSlugFromUrl('https://example.com/company/acme-corp');
    expect(slug).toBe('company-acme-corp');
  });

  it('returns index for root path', () => {
    const slug = generateSlugFromUrl('https://example.com/');
    expect(slug).toBe('index');
  });

  it('returns index for root path without trailing slash', () => {
    const slug = generateSlugFromUrl('https://example.com');
    expect(slug).toBe('index');
  });

  it('strips leading and trailing slashes', () => {
    const slug = generateSlugFromUrl('https://example.com/path/to/page/');
    expect(slug).toBe('path-to-page');
  });

  it('replaces slashes with dashes', () => {
    const slug = generateSlugFromUrl('https://example.com/a/b/c');
    expect(slug).toBe('a-b-c');
  });

  it('removes non-alphanumeric characters except dashes', () => {
    const slug = generateSlugFromUrl('https://example.com/hello_world!page');
    expect(slug).toBe('helloworldpage');
  });

  it('truncates to MAX_SLUG_LENGTH', () => {
    const longPath = 'a'.repeat(100);
    const slug = generateSlugFromUrl(`https://example.com/${longPath}`);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
  });

  it('uses title as fallback for invalid URL', () => {
    const slug = generateSlugFromUrl('not-a-valid-url', 'My Page Title');
    expect(slug).toBe('my-page-title');
  });

  it('uses "page" as fallback when URL is invalid and no title', () => {
    const slug = generateSlugFromUrl('not-a-valid-url');
    expect(slug).toBe('page');
  });

  it('lowercases and slugifies title fallback', () => {
    const slug = generateSlugFromUrl('invalid', 'Hello World! Test Page');
    expect(slug).toBe('hello-world-test-page');
  });

  it('strips leading/trailing dashes from title fallback', () => {
    const slug = generateSlugFromUrl('invalid', '-leading-trailing-');
    expect(slug).toBe('leading-trailing');
  });

  it('truncates title fallback to MAX_SLUG_LENGTH', () => {
    const longTitle = 'word '.repeat(30);
    const slug = generateSlugFromUrl('invalid', longTitle);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
  });

  it('handles URL with query parameters (they are stripped)', () => {
    const slug = generateSlugFromUrl('https://example.com/page?foo=bar');
    expect(slug).toBe('page');
  });

  it('handles URL with hash (hash is stripped)', () => {
    const slug = generateSlugFromUrl('https://example.com/page#section');
    expect(slug).toBe('page');
  });
});

describe('formatTimestampForFilename', () => {
  it('formats timestamp into ISO-like string with dashes', () => {
    // Use a known timestamp: 2024-01-15T10:30:45.123Z
    const timestamp = new Date('2024-01-15T10:30:45.123Z').getTime();
    const result = formatTimestampForFilename(timestamp);
    expect(result).toBe('2024-01-15T10-30-45-123Z');
  });

  it('replaces colons with dashes', () => {
    const result = formatTimestampForFilename(0);
    expect(result).not.toContain(':');
  });

  it('replaces periods with dashes', () => {
    const result = formatTimestampForFilename(0);
    expect(result).not.toContain('.');
  });

  it('produces consistent output for same input', () => {
    const ts = 1700000000000;
    expect(formatTimestampForFilename(ts)).toBe(formatTimestampForFilename(ts));
  });

  it('returns a string that is safe for filenames', () => {
    const result = formatTimestampForFilename(Date.now());
    // Should only contain alphanumeric, dashes, and T/Z
    expect(result).toMatch(/^[0-9T\-Z]+$/);
  });
});

describe('generateBaseFilename', () => {
  const fixedTimestamp = new Date('2024-01-15T10:30:45.123Z').getTime();
  const expectedDate = '2024-01-15T10-30-45-123Z';

  it('generates filename with type and timestamp', () => {
    const result = generateBaseFilename('screenshot', fixedTimestamp);
    expect(result).toBe(`screenshot-${expectedDate}`);
  });

  it('generates filename with type, slug, and timestamp', () => {
    const result = generateBaseFilename('outline', fixedTimestamp, 'company-page');
    expect(result).toBe(`outline-company-page-${expectedDate}`);
  });

  it('does not include slug when slug is undefined', () => {
    const result = generateBaseFilename('design-review', fixedTimestamp);
    expect(result).toBe(`design-review-${expectedDate}`);
  });

  it('does not include slug when slug is empty string', () => {
    const result = generateBaseFilename('screenshot', fixedTimestamp, '');
    expect(result).toBe(`screenshot-${expectedDate}`);
  });

  it('handles different type prefixes', () => {
    const types = ['screenshot', 'design-review', 'outline', 'hmr-diff'];
    for (const type of types) {
      const result = generateBaseFilename(type, fixedTimestamp);
      expect(result).toMatch(new RegExp(`^${type}-`));
    }
  });
});

describe('truncateMessage', () => {
  it('returns the full message when under limit', () => {
    const msg = 'short message';
    expect(truncateMessage(msg)).toBe(msg);
  });

  it('returns the full message when exactly at limit', () => {
    const msg = 'x'.repeat(MAX_LOG_MESSAGE_LENGTH);
    expect(truncateMessage(msg)).toBe(msg);
    expect(truncateMessage(msg).length).toBe(MAX_LOG_MESSAGE_LENGTH);
  });

  it('truncates messages exceeding the default limit', () => {
    const msg = 'x'.repeat(MAX_LOG_MESSAGE_LENGTH + 50);
    const result = truncateMessage(msg);
    expect(result.length).toBe(MAX_LOG_MESSAGE_LENGTH);
  });

  it('truncates to a custom limit', () => {
    const msg = 'hello world this is a test';
    const result = truncateMessage(msg, 5);
    expect(result).toBe('hello');
    expect(result.length).toBe(5);
  });

  it('handles empty string', () => {
    expect(truncateMessage('')).toBe('');
  });

  it('handles message of length 1', () => {
    expect(truncateMessage('a')).toBe('a');
  });

  it('handles custom limit of 0', () => {
    expect(truncateMessage('hello', 0)).toBe('');
  });
});
