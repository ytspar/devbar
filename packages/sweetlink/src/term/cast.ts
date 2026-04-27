/**
 * Shared types for the asciicast v2 format.
 * Recorder and player both import these so the on-disk schema stays in sync.
 */

export type CastEventKind = 'o' | 'i';

export type CastEvent = [time: number, kind: CastEventKind, data: string];

export interface CastHeader {
  version: 2;
  width: number;
  height: number;
  timestamp?: number;
  duration?: number;
  title?: string;
  env?: Record<string, string>;
}

const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

/**
 * Escape a JSON string for safe interpolation inside an HTML <script> block.
 * JSON.stringify alone does NOT escape `</script>`, `<!--`, or U+2028/U+2029,
 * so attacker-controlled bytes inside event data could break out of the
 * script element and execute. The .html player is designed for sharing in
 * PR comments, so this matters.
 */
export function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(LINE_SEP)
    .join('\\u2028')
    .split(PARA_SEP)
    .join('\\u2029');
}
