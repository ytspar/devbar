/**
 * Android tap-event capture via `adb shell getevent -l`.
 *
 * We stream input events from the connected emulator/device while a screen
 * recording is in progress, parse touch events into (x, y, t) tuples, and
 * write them as a sidecar JSON. A separate post-process step (overlay.ts)
 * renders rings on the recording at each tap timestamp.
 *
 * `getevent -p` is used once at startup to discover the touchscreen input
 * device and its ABS coordinate range — coordinates from `getevent` are in
 * raw input-device units, which we scale to screen pixels using the ratio
 * of `wm size` vs. the input device's max X/Y.
 */

import { type ChildProcess, execFile, spawn } from 'child_process';

export interface TapEvent {
  /** Pixel x relative to the captured frame. */
  x: number;
  /** Pixel y relative to the captured frame. */
  y: number;
  /** Seconds since recording start. */
  t: number;
}

export interface TouchDeviceInfo {
  /** /dev/input/eventN path. */
  path: string;
  /** Max raw value for ABS_MT_POSITION_X (0..max). */
  maxX: number;
  /** Max raw value for ABS_MT_POSITION_Y (0..max). */
  maxY: number;
  /** Display width in pixels (from `wm size`). */
  screenWidth: number;
  /** Display height in pixels. */
  screenHeight: number;
}

function adbExec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('adb', args, { encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/**
 * Parse `adb shell wm size` output:
 *   Physical size: 1080x2400
 *   Override size: 720x1600  (optional)
 *
 * Override takes precedence when present (it's what apps actually render at).
 */
export function parseWmSize(out: string): { width: number; height: number } | null {
  const override = out.match(/Override size:\s*(\d+)x(\d+)/);
  const physical = out.match(/Physical size:\s*(\d+)x(\d+)/);
  const m = override ?? physical;
  if (!m) return null;
  return { width: parseInt(m[1]!, 10), height: parseInt(m[2]!, 10) };
}

/**
 * Parse `adb shell getevent -p` output and find the first device that
 * declares BTN_TOUCH (014a) and ABS_MT_POSITION_X/Y. Returns the device
 * path plus the raw coordinate ranges.
 *
 * Layout (one block per device):
 *
 *   add device 3: /dev/input/event3
 *     name:     "Touchscreen"
 *     events:
 *       KEY (0001): 014a
 *       ABS (0003): 0030 0031 0035 0036 ...
 *     input props:
 *       ...
 *     ABS_MT_POSITION_X    : value 0, min 0, max 1080, fuzz 0, flat 0, resolution 0
 *     ABS_MT_POSITION_Y    : value 0, min 0, max 2400, fuzz 0, flat 0, resolution 0
 */
export function parseGetEventProbe(
  out: string
): Array<{ path: string; maxX: number; maxY: number; hasBtnTouch: boolean }> {
  const blocks = out.split(/^add device /m).slice(1);
  const devices: Array<{ path: string; maxX: number; maxY: number; hasBtnTouch: boolean }> = [];
  for (const block of blocks) {
    const pathMatch = block.match(/^\d+:\s+(\/dev\/input\/event\d+)/);
    if (!pathMatch) continue;
    const path = pathMatch[1]!;
    // BTN_TOUCH = 014a appears in the KEY (0001) line OR is mentioned by name.
    const hasBtnTouch = /KEY\b[^\n]*\b014a\b/i.test(block) || /BTN_TOUCH/.test(block);
    const xMatch = block.match(/ABS_MT_POSITION_X[^\n]*max\s+(\d+)/);
    const yMatch = block.match(/ABS_MT_POSITION_Y[^\n]*max\s+(\d+)/);
    const maxX = xMatch ? parseInt(xMatch[1]!, 10) : 0;
    const maxY = yMatch ? parseInt(yMatch[1]!, 10) : 0;
    devices.push({ path, maxX, maxY, hasBtnTouch });
  }
  return devices;
}

/**
 * Run the necessary adb queries to discover the touchscreen device + scale.
 * Throws when no touchscreen device is found.
 */
export async function findTouchDevice(deviceSerial: string): Promise<TouchDeviceInfo> {
  const probe = await adbExec(['-s', deviceSerial, 'shell', 'getevent', '-p']);
  const wm = await adbExec(['-s', deviceSerial, 'shell', 'wm', 'size']);
  const screen = parseWmSize(wm);
  if (!screen) {
    throw new Error(`Could not parse screen size from \`wm size\`: ${wm.slice(0, 100)}`);
  }
  const candidates = parseGetEventProbe(probe).filter(
    (d) => d.hasBtnTouch && d.maxX > 0 && d.maxY > 0
  );
  if (candidates.length === 0) {
    throw new Error('No touchscreen input device found on the emulator.');
  }
  const dev = candidates[0]!;
  return {
    path: dev.path,
    maxX: dev.maxX,
    maxY: dev.maxY,
    screenWidth: screen.width,
    screenHeight: screen.height,
  };
}

/**
 * Parse one chunk of `getevent -l` output, updating accumulated state in
 * place. Pure function so it's straightforward to unit-test.
 *
 * Lines look like:
 *   /dev/input/event3: EV_ABS       ABS_MT_POSITION_X    000003e8
 *   /dev/input/event3: EV_KEY       BTN_TOUCH            DOWN
 *   /dev/input/event3: EV_KEY       BTN_TOUCH            UP
 */
export interface ParseState {
  curX: number | null;
  curY: number | null;
  downAtMs: number | null;
}
export function freshParseState(): ParseState {
  return { curX: null, curY: null, downAtMs: null };
}

export function processGetEventChunk(
  text: string,
  state: ParseState,
  scaleX: number,
  scaleY: number,
  startMs: number,
  nowMs: number
): TapEvent[] {
  const out: TapEvent[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\/dev\/input\/\S+:\s+(EV_\w+)\s+(\w+)\s+(\w+)/);
    if (!m) continue;
    const [, evType, evCode, valueStr] = m;
    if (evType === 'EV_ABS' && evCode === 'ABS_MT_POSITION_X') {
      state.curX = parseInt(valueStr!, 16);
    } else if (evType === 'EV_ABS' && evCode === 'ABS_MT_POSITION_Y') {
      state.curY = parseInt(valueStr!, 16);
    } else if (evType === 'EV_KEY' && evCode === 'BTN_TOUCH') {
      if (valueStr === 'DOWN') {
        state.downAtMs = nowMs;
      } else if (valueStr === 'UP') {
        if (state.curX !== null && state.curY !== null && state.downAtMs !== null) {
          out.push({
            x: Math.round(state.curX * scaleX),
            y: Math.round(state.curY * scaleY),
            t: (state.downAtMs - startMs) / 1000,
          });
        }
        state.curX = null;
        state.curY = null;
        state.downAtMs = null;
      }
    }
  }
  return out;
}

/**
 * Spawn a `getevent -l` listener for the given input path. Returns the
 * child process plus a live array of tap events that the caller can read
 * after they SIGTERM the process.
 */
export function captureTapsLive(
  deviceSerial: string,
  info: TouchDeviceInfo,
  startMs: number
): { proc: ChildProcess; taps: TapEvent[] } {
  const taps: TapEvent[] = [];
  const state = freshParseState();
  const scaleX = info.screenWidth / info.maxX;
  const scaleY = info.screenHeight / info.maxY;

  const proc = spawn('adb', ['-s', deviceSerial, 'shell', 'getevent', '-l', info.path], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buffer = '';
  proc.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    // Process complete lines; keep the trailing partial line for next chunk.
    const lastNl = buffer.lastIndexOf('\n');
    if (lastNl === -1) return;
    const ready = buffer.slice(0, lastNl);
    buffer = buffer.slice(lastNl + 1);
    const newTaps = processGetEventChunk(ready, state, scaleX, scaleY, startMs, Date.now());
    taps.push(...newTaps);
  });

  return { proc, taps };
}
