import { describe, expect, it } from 'vitest';
import { parseBatchManifest } from './batchManifest.js';

describe('parseBatchManifest', () => {
  it('accepts a well-formed manifest and preserves per-item overrides', () => {
    const items = parseBatchManifest(
      JSON.stringify([
        { url: 'http://localhost:3003/render/a', output: '.tmp/a.png' },
        { url: 'http://localhost:3003/render/b', output: '.tmp/b.png', fullPage: true },
      ])
    );
    expect(items).toHaveLength(2);
    expect(items[1]!.fullPage).toBe(true);
  });

  it('rejects an item with no output path', () => {
    // Defaulting the path would make every frame overwrite the last, and a
    // directory of identical frames reads as a capture bug rather than a bad manifest.
    expect(() =>
      parseBatchManifest(JSON.stringify([{ url: 'http://localhost:3003/render/a' }]))
    ).toThrow(/missing an "output"/);
  });

  it('names the offending item so a long manifest is debuggable', () => {
    expect(() =>
      parseBatchManifest(
        JSON.stringify([{ url: 'http://x/1', output: '.tmp/1.png' }, { url: 'http://x/2' }])
      )
    ).toThrow(/item 1 \(http:\/\/x\/2\)/);
  });

  it('rejects an item with no url', () => {
    expect(() => parseBatchManifest(JSON.stringify([{ output: '.tmp/a.png' }]))).toThrow(
      /missing a "url"/
    );
  });

  it('rejects an empty manifest rather than silently capturing nothing', () => {
    expect(() => parseBatchManifest('[]')).toThrow(/empty/);
  });

  it('rejects a non-array manifest', () => {
    expect(() => parseBatchManifest(JSON.stringify({ url: 'x', output: 'y' }))).toThrow(
      /must be a JSON array/
    );
  });

  it('reports invalid JSON as such', () => {
    expect(() => parseBatchManifest('{not json')).toThrow(/not valid JSON/);
  });
});
