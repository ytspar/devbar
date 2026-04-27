/**
 * Self-contained HTML player for asciicast v2 recordings.
 *
 * Inlines the cast events as JSON in the document — the player has no
 * runtime dependencies, works offline, opens anywhere a browser does.
 *
 * UX: play/pause, 0.1×–4× speed control, seek bar, ANSI colour rendering.
 * Carriage returns (\r) reposition the cursor to column 0 of the current
 * line so progress bars overwrite cleanly. Form-feeds (\f) and bare
 * cursor escapes are dropped — this is a flat scrollback, not a TUI grid.
 *
 * Rendering uses createElement + textContent (NOT innerHTML) — every
 * character from the recorded stream lands as a text node, never as
 * markup. Inline style attrs are built from a hardcoded colour palette
 * with no user input.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { escapeHtml as escapeAttr } from '../daemon/utils.js';
import { type CastEvent, type CastHeader, escapeJsonForScript } from './cast.js';

export interface PlayerOptions {
  castPath: string;
  /** Title shown in the player header; defaults to the filename. */
  title?: string;
  /** Output HTML path. Defaults to `<castPath without .cast>.html`. */
  outputPath?: string;
}

export async function generatePlayer(options: PlayerOptions): Promise<string> {
  const cast = await fs.readFile(options.castPath, 'utf-8');
  const lines = cast.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) throw new Error(`Empty .cast file: ${options.castPath}`);

  let header: CastHeader;
  try {
    header = JSON.parse(lines[0]!) as CastHeader;
  } catch {
    const preview = lines[0]!.slice(0, 80);
    throw new Error(
      `Not a valid asciicast v2 file: ${options.castPath} — first line is not JSON: ${preview}`
    );
  }
  if (header.version !== 2) {
    throw new Error(
      `Unsupported asciicast version ${header.version} (expected 2): ${options.castPath}`
    );
  }
  const width = Number.isFinite(header.width) && header.width > 0 ? header.width : 80;
  const height = Number.isFinite(header.height) && header.height > 0 ? header.height : 24;

  const events: CastEvent[] = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      const e = JSON.parse(lines[i]!) as unknown;
      if (
        Array.isArray(e) &&
        e.length === 3 &&
        typeof e[0] === 'number' &&
        (e[1] === 'o' || e[1] === 'i') &&
        typeof e[2] === 'string'
      ) {
        events.push(e as CastEvent);
      }
    } catch {
      /* skip malformed lines */
    }
  }

  if (events.length === 0) {
    throw new Error(
      `No events captured in ${options.castPath} — refusing to generate empty player`
    );
  }

  const lastEventT = events[events.length - 1]![0];
  const rawDuration = header.duration ?? lastEventT;
  // Clamp to a sane range so the seek slider is functional.
  const totalDuration =
    Number.isFinite(rawDuration) && rawDuration > 0
      ? Math.max(rawDuration, 1)
      : Math.max(lastEventT, 1);

  const titleText = options.title ?? header.title ?? path.basename(options.castPath);
  const outputPath = options.outputPath ?? `${options.castPath.replace(/\.cast$/i, '')}.html`;

  // Embed the events as an inline JSON string. JSON.stringify alone does NOT
  // escape `</script>`, `<!--`, or U+2028/U+2029, so attacker-controlled
  // bytes inside event data could break out of the script element and run
  // attacker JS in any teammate who opens the shareable .html. Always pipe
  // through escapeJsonForScript before string-interpolating.
  const dataJson = escapeJsonForScript(JSON.stringify({ width, height, events }));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeAttr(titleText)}</title>
<style>
  :root {
    --bg: #1a1b26; --fg: #c0caf5; --muted: #565f89; --accent: #7aa2f7;
    --panel: #16161e; --border: #2f334d;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  header { padding: 12px 16px; background: var(--panel); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  header h1 { font-size: 13px; font-weight: 500; margin: 0; color: var(--fg); flex: 1 1 auto; min-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { background: var(--bg); color: var(--fg); border: 1px solid var(--border); padding: 4px 12px; border-radius: 4px; font: inherit; font-size: 12px; cursor: pointer; }
  button:hover { background: var(--border); }
  button.primary { background: var(--accent); color: #16161e; border-color: var(--accent); font-weight: 600; }
  .speed { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
  .speed select { background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 4px; padding: 3px 6px; font: inherit; font-size: 12px; }
  .time { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; min-width: 90px; text-align: right; }
  main { padding: 16px; }
  pre { margin: 0; padding: 16px; background: #0d0e14; border-radius: 6px; overflow: auto; line-height: 1.4; font-size: 13px; min-height: 480px; max-height: calc(100vh - 200px); white-space: pre-wrap; word-break: break-word; }
  .scrubber { padding: 8px 16px; background: var(--panel); border-top: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
  input[type=range] { flex: 1; }
  .label { background: var(--accent); color: #16161e; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
</style>
</head>
<body>
<header>
  <span class="label">term</span>
  <h1>${escapeAttr(titleText)}</h1>
  <div class="speed">
    <span>speed</span>
    <select id="speed">
      <option value="0.1">0.1×</option>
      <option value="0.25">0.25×</option>
      <option value="0.5">0.5×</option>
      <option value="1" selected>1×</option>
      <option value="2">2×</option>
      <option value="4">4×</option>
    </select>
  </div>
  <button id="play" class="primary">▶ play</button>
  <button id="restart">⟲ restart</button>
  <span class="time"><span id="t">0.0</span>s / ${totalDuration.toFixed(1)}s</span>
</header>
<main>
  <pre id="screen"></pre>
</main>
<div class="scrubber">
  <input id="seek" type="range" min="0" max="${totalDuration}" step="0.01" value="0" />
</div>

<script>
const DATA = ${dataJson};
const TOTAL = ${totalDuration};

// --- ANSI parser (mirrors src/term/ansi.ts; minimal SGR + \\r) ---
const BASIC_FG = {30:'#000',31:'#cd3131',32:'#0dbc79',33:'#e5e510',34:'#2472c8',35:'#bc3fbc',36:'#11a8cd',37:'#e5e5e5',90:'#666',91:'#f14c4c',92:'#23d18b',93:'#f5f543',94:'#3b8eea',95:'#d670d6',96:'#29b8db',97:'#fff'};
const BASIC_BG = {40:'#000',41:'#cd3131',42:'#0dbc79',43:'#e5e510',44:'#2472c8',45:'#bc3fbc',46:'#11a8cd',47:'#e5e5e5',100:'#666',101:'#f14c4c',102:'#23d18b',103:'#f5f543',104:'#3b8eea',105:'#d670d6',106:'#29b8db',107:'#fff'};
function c256(n){if(n<16){return ['#000','#cd3131','#0dbc79','#e5e510','#2472c8','#bc3fbc','#11a8cd','#e5e5e5','#666','#f14c4c','#23d18b','#f5f543','#3b8eea','#d670d6','#29b8db','#fff'][n];}if(n<232){const i=n-16;return 'rgb('+(Math.floor(i/36)*51)+','+(Math.floor((i%36)/6)*51)+','+((i%6)*51)+')';}const v=(n-232)*10+8;return 'rgb('+v+','+v+','+v+')';}
function freshState(){return{fg:null,bg:null,bold:false,italic:false,underline:false,dim:false};}
function applyParams(s,p){for(let i=0;i<p.length;i++){const v=p[i];if(v===0)Object.assign(s,freshState());else if(v===1)s.bold=true;else if(v===2)s.dim=true;else if(v===3)s.italic=true;else if(v===4)s.underline=true;else if(v===22){s.bold=false;s.dim=false;}else if(v===23)s.italic=false;else if(v===24)s.underline=false;else if(v===39)s.fg=null;else if(v===49)s.bg=null;else if(BASIC_FG[v])s.fg=BASIC_FG[v];else if(BASIC_BG[v])s.bg=BASIC_BG[v];else if(v===38||v===48){const fg=v===38;const m=p[i+1];if(m===5&&p[i+2]!==undefined){const c=c256(p[i+2]);if(fg)s.fg=c;else s.bg=c;i+=2;}else if(m===2&&p[i+4]!==undefined){const c='rgb('+p[i+2]+','+p[i+3]+','+p[i+4]+')';if(fg)s.fg=c;else s.bg=c;i+=4;}}}}
function styleOf(s){const o=[];if(s.fg)o.push('color:'+s.fg);if(s.bg)o.push('background:'+s.bg);if(s.bold)o.push('font-weight:600');if(s.italic)o.push('font-style:italic');if(s.underline)o.push('text-decoration:underline');if(s.dim)o.push('opacity:0.7');return o.join(';');}

// --- Build the assembled scrollback up to time t ---
function assembleText(targetT) {
  // Walk through events, building text. Treat \\r as "delete back to last \\n",
  // so progress bars (e.g., "5%\\r10%\\r") overwrite cleanly.
  let text = '';
  for (const e of DATA.events) {
    if (e[0] > targetT) break;
    if (e[1] !== 'o') continue;
    const chunk = e[2];
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (c === '\\r' && chunk[i+1] !== '\\n') {
        const lastNl = text.lastIndexOf('\\n');
        text = lastNl === -1 ? '' : text.slice(0, lastNl + 1);
      } else if (c === '\\r') {
        // CRLF — let the LF do the work.
      } else {
        text += c;
      }
    }
  }
  return text;
}

// --- Parse + render: build segments, then DOM-construct safely with textContent ---
function parseSegments(text) {
  const segments = [];
  const state = freshState();
  let buf = '';
  const flush = () => { if (buf) { segments.push({ text: buf, style: styleOf(state) }); buf = ''; } };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\u001b' && text[i+1] === '[') {
      flush();
      let j = i + 2;
      while (j < text.length && !/[A-Za-z]/.test(text[j])) j++;
      const final = text[j];
      const body = text.slice(i + 2, j);
      if (final === 'm') {
        const params = body.split(';').map((x) => parseInt(x, 10) || 0);
        applyParams(state, params.length === 0 ? [0] : params);
      }
      i = j + 1;
    } else {
      buf += ch;
      i++;
    }
  }
  flush();
  return segments;
}

function renderUpTo(targetT) {
  const text = assembleText(targetT);
  const segments = parseSegments(text);
  const screen = document.getElementById('screen');
  // Clear and rebuild via DOM nodes so every byte from the cast lands as
  // text content, not parsed markup. Spans only carry our hardcoded
  // inline-style palette — no user input flows into attributes.
  screen.textContent = '';
  for (const seg of segments) {
    if (seg.style) {
      const span = document.createElement('span');
      span.setAttribute('style', seg.style);
      span.textContent = seg.text;
      screen.appendChild(span);
    } else {
      screen.appendChild(document.createTextNode(seg.text));
    }
  }
}

// --- Playback controller ---
let currentT = 0;
let playing = false;
let speed = 1;
let lastFrame = 0;
function tick(ts) {
  if (!playing) return;
  if (lastFrame) {
    const dt = (ts - lastFrame) / 1000;
    currentT = Math.min(TOTAL, currentT + dt * speed);
    document.getElementById('seek').value = currentT;
    document.getElementById('t').textContent = currentT.toFixed(1);
    renderUpTo(currentT);
    if (currentT >= TOTAL) {
      playing = false;
      document.getElementById('play').textContent = '▶ play';
    }
  }
  lastFrame = ts;
  if (playing) requestAnimationFrame(tick);
}
function play() {
  if (currentT >= TOTAL) currentT = 0;
  playing = true;
  lastFrame = 0;
  document.getElementById('play').textContent = '❚❚ pause';
  requestAnimationFrame(tick);
}
function pause() {
  playing = false;
  document.getElementById('play').textContent = '▶ play';
}
document.getElementById('play').addEventListener('click', () => playing ? pause() : play());
document.getElementById('restart').addEventListener('click', () => { currentT = 0; renderUpTo(0); document.getElementById('seek').value = 0; document.getElementById('t').textContent = '0.0'; if (!playing) play(); });
document.getElementById('seek').addEventListener('input', (e) => { pause(); currentT = parseFloat(e.target.value); document.getElementById('t').textContent = currentT.toFixed(1); renderUpTo(currentT); });
document.getElementById('speed').addEventListener('change', (e) => { speed = parseFloat(e.target.value); });

// --- Pick a sensible default speed for long recordings ---
if (TOTAL > 180) {
  document.getElementById('speed').value = '4';
  speed = 4;
} else if (TOTAL > 60) {
  document.getElementById('speed').value = '2';
  speed = 2;
}

// Render a small head end so the user sees something even before play.
renderUpTo(Math.min(0.5, TOTAL));
</script>
</body>
</html>
`;

  await fs.writeFile(outputPath, html);
  return outputPath;
}
