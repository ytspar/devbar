/**
 * Minimal ANSI escape parser for the terminal player.
 *
 * Handles the subset that test runners typically emit:
 *   - SGR (colour/style) codes:  ESC[Nm  ESC[N;Nm  ESC[N;N;Nm
 *   - 256-color:                  ESC[38;5;Nm  ESC[48;5;Nm
 *   - Truecolor:                  ESC[38;2;R;G;Bm  ESC[48;2;R;G;Bm
 *   - Reset (plain ESC[m, ESC[0m)
 *   - Erase line (ESC[K) — just clear from cursor to EOL
 *
 * Cursor-positioning escapes (ESC[NA, ESC[H, etc.) are stripped — the
 * player models the screen as a flat scrollback buffer, not a TUI grid.
 */

export interface AnsiSpan {
  text: string;
  /** Inline CSS — passed straight to `style="..."` so the player has no extra deps. */
  style: string;
}

/** State carried across a stream of writes (so colour persists between chunks). */
export interface AnsiState {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  dim: boolean;
}

export function freshState(): AnsiState {
  return { fg: null, bg: null, bold: false, italic: false, underline: false, dim: false };
}

const BASIC_FG: Record<number, string> = {
  30: '#000', 31: '#cd3131', 32: '#0dbc79', 33: '#e5e510',
  34: '#2472c8', 35: '#bc3fbc', 36: '#11a8cd', 37: '#e5e5e5',
  90: '#666', 91: '#f14c4c', 92: '#23d18b', 93: '#f5f543',
  94: '#3b8eea', 95: '#d670d6', 96: '#29b8db', 97: '#fff',
};
const BASIC_BG: Record<number, string> = {
  40: '#000', 41: '#cd3131', 42: '#0dbc79', 43: '#e5e510',
  44: '#2472c8', 45: '#bc3fbc', 46: '#11a8cd', 47: '#e5e5e5',
  100: '#666', 101: '#f14c4c', 102: '#23d18b', 103: '#f5f543',
  104: '#3b8eea', 105: '#d670d6', 106: '#29b8db', 107: '#fff',
};

function color256(n: number): string {
  if (n < 16) {
    const lut = [
      '#000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
      '#666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#fff',
    ];
    return lut[n]!;
  }
  if (n < 232) {
    const i = n - 16;
    const r = Math.floor(i / 36) * 51;
    const g = Math.floor((i % 36) / 6) * 51;
    const b = (i % 6) * 51;
    return `rgb(${r},${g},${b})`;
  }
  const v = (n - 232) * 10 + 8;
  return `rgb(${v},${v},${v})`;
}

function applyParams(state: AnsiState, params: number[]): void {
  let i = 0;
  while (i < params.length) {
    const p = params[i]!;
    if (p === 0) {
      Object.assign(state, freshState());
    } else if (p === 1) state.bold = true;
    else if (p === 2) state.dim = true;
    else if (p === 3) state.italic = true;
    else if (p === 4) state.underline = true;
    else if (p === 22) { state.bold = false; state.dim = false; }
    else if (p === 23) state.italic = false;
    else if (p === 24) state.underline = false;
    else if (p === 39) state.fg = null;
    else if (p === 49) state.bg = null;
    else if (BASIC_FG[p]) state.fg = BASIC_FG[p]!;
    else if (BASIC_BG[p]) state.bg = BASIC_BG[p]!;
    else if (p === 38 || p === 48) {
      const isFg = p === 38;
      const mode = params[i + 1];
      if (mode === 5 && params[i + 2] !== undefined) {
        const c = color256(params[i + 2]!);
        if (isFg) state.fg = c; else state.bg = c;
        i += 2;
      } else if (mode === 2 && params[i + 4] !== undefined) {
        const c = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
        if (isFg) state.fg = c; else state.bg = c;
        i += 4;
      }
    }
    i++;
  }
}

function styleOf(state: AnsiState): string {
  const parts: string[] = [];
  if (state.fg) parts.push(`color:${state.fg}`);
  if (state.bg) parts.push(`background:${state.bg}`);
  if (state.bold) parts.push('font-weight:600');
  if (state.italic) parts.push('font-style:italic');
  if (state.underline) parts.push('text-decoration:underline');
  if (state.dim) parts.push('opacity:0.7');
  return parts.join(';');
}

/**
 * Parse a chunk of bytes into HTML-ready spans, advancing `state` so
 * subsequent chunks pick up where this one left off.
 *
 * The returned string is HTML — caller must escape any user data NOT
 * coming from the recorded stream (it's intended to be embedded inline).
 */
export function ansiToHtml(input: string, state: AnsiState): string {
  const ESC = '';
  let i = 0;
  let out = '';
  let buffer = '';

  const flush = (): void => {
    if (!buffer) return;
    const escaped = buffer
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const style = styleOf(state);
    if (style) {
      out += `<span style="${style}">${escaped}</span>`;
    } else {
      out += escaped;
    }
    buffer = '';
  };

  while (i < input.length) {
    const ch = input[i]!;
    if (ch === ESC && input[i + 1] === '[') {
      flush();
      // Read up to the final byte (a letter)
      let j = i + 2;
      while (j < input.length && !/[A-Za-z]/.test(input[j]!)) j++;
      const final = input[j];
      const body = input.slice(i + 2, j);
      if (final === 'm') {
        const params = body.split(';').map((s) => parseInt(s, 10) || 0);
        applyParams(state, params.length === 0 ? [0] : params);
      }
      // K, A, B, C, D, H, J, etc. are ignored (not modeled by the flat scrollback).
      i = j + 1;
    } else {
      buffer += ch;
      i++;
    }
  }
  flush();
  return out;
}
