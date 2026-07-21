/**
 * Batch screenshot manifest parsing.
 *
 * Lives outside the CLI entry point so the validation is directly importable and
 * testable — the CLI module is a top-level IIFE and cannot be imported for a
 * unit test without running it.
 */

/** One frame in a `--batch` manifest. `url` and `output` are required. */
export interface BatchScreenshotItem {
  url: string;
  output: string;
  selector?: string;
  fullPage?: boolean;
  viewport?: string;
  hideDevbar?: boolean;
}

export interface BatchScreenshotResult {
  url: string;
  output: string;
  ok: boolean;
  width?: number;
  height?: number;
  error?: string;
}

/**
 * Parse and validate a batch manifest.
 *
 * Every field is checked up front rather than per frame, so a malformed manifest
 * fails before the first browser is touched instead of halfway through a sweep.
 * `output` in particular is required: defaulting it would make every frame write
 * to the same path, and a directory of identical frames reads downstream as "the
 * capture tool duplicated my frames" rather than "my manifest was malformed".
 */
export function parseBatchManifest(raw: string): BatchScreenshotItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `batch manifest is not valid JSON: ${error instanceof Error ? error.message : error}`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error('batch manifest must be a JSON array of { url, output } items');
  }
  if (parsed.length === 0) {
    throw new Error('batch manifest is empty — nothing to capture');
  }
  return parsed.map((item, i) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`batch item ${i} is not an object`);
    }
    const { url, output } = item as Record<string, unknown>;
    if (typeof url !== 'string' || url.length === 0) {
      throw new Error(`batch item ${i} is missing a "url"`);
    }
    if (typeof output !== 'string' || output.length === 0) {
      throw new Error(`batch item ${i} (${url}) is missing an "output" path`);
    }
    return item as BatchScreenshotItem;
  });
}
