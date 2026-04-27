/**
 * Pure-function tests for the Android tap parser. No emulator required.
 */

import { describe, expect, it } from 'vitest';
import {
  freshParseState,
  parseGetEventProbe,
  parseWmSize,
  processGetEventChunk,
} from './androidTaps.js';

describe('parseWmSize', () => {
  it('parses physical-only output', () => {
    expect(parseWmSize('Physical size: 1080x2400')).toEqual({ width: 1080, height: 2400 });
  });

  it('parses physical with override', () => {
    const out = 'Physical size: 1080x2400\nOverride size: 720x1600';
    // Override wins — that's what the apps render at.
    expect(parseWmSize(out)).toEqual({ width: 720, height: 1600 });
  });

  it('returns null on garbage', () => {
    expect(parseWmSize('command not found')).toBeNull();
  });
});

describe('parseGetEventProbe', () => {
  const sample = `add device 1: /dev/input/event0
  name:     "gpio-keys"
  events:
    KEY (0001): 0066 0073 0074
add device 2: /dev/input/event3
  name:     "Touchscreen"
  events:
    KEY (0001): 014a
    ABS (0003): 0035 0036 0039 003a
  ABS_MT_POSITION_X    : value 0, min 0, max 1080, fuzz 0, flat 0, resolution 0
  ABS_MT_POSITION_Y    : value 0, min 0, max 2400, fuzz 0, flat 0, resolution 0
add device 4: /dev/input/event4
  name:     "uinput-fpc"
  events:
    KEY (0001): 0066`;

  it('finds the touchscreen device with its abs ranges', () => {
    const devices = parseGetEventProbe(sample);
    expect(devices.length).toBe(3);
    const touch = devices.find((d) => d.path === '/dev/input/event3')!;
    expect(touch.hasBtnTouch).toBe(true);
    expect(touch.maxX).toBe(1080);
    expect(touch.maxY).toBe(2400);
  });

  it('marks non-touchscreen devices as not having BTN_TOUCH', () => {
    const devices = parseGetEventProbe(sample);
    const gpio = devices.find((d) => d.path === '/dev/input/event0')!;
    expect(gpio.hasBtnTouch).toBe(false);
  });
});

describe('processGetEventChunk', () => {
  it('emits a tap on DOWN -> X -> Y -> UP', () => {
    const state = freshParseState();
    const chunk = [
      '/dev/input/event3: EV_KEY       BTN_TOUCH            DOWN',
      '/dev/input/event3: EV_ABS       ABS_MT_POSITION_X    000001f4', // 500
      '/dev/input/event3: EV_ABS       ABS_MT_POSITION_Y    00000bb8', // 3000
      '/dev/input/event3: EV_KEY       BTN_TOUCH            UP',
    ].join('\n');
    // Scale of 0.5 (1080→540 input device, 540 screen)
    const taps = processGetEventChunk(chunk, state, 0.5, 0.5, 1_000_000, 1_000_500);
    expect(taps).toHaveLength(1);
    expect(taps[0]).toEqual({ x: 250, y: 1500, t: 0.5 });
  });

  it('records the tap timestamp from BTN_TOUCH DOWN, not UP', () => {
    // Two chunks: DOWN arrives first, UP later — the tap's `t` should be
    // anchored to the DOWN moment so multi-tap timing aligns with reality.
    const state = freshParseState();
    const chunk1 = [
      '/dev/input/event3: EV_KEY       BTN_TOUCH            DOWN',
      '/dev/input/event3: EV_ABS       ABS_MT_POSITION_X    00000064',
      '/dev/input/event3: EV_ABS       ABS_MT_POSITION_Y    00000064',
    ].join('\n');
    processGetEventChunk(chunk1, state, 1, 1, 1_000_000, 1_000_100);

    const chunk2 = '/dev/input/event3: EV_KEY       BTN_TOUCH            UP';
    const taps = processGetEventChunk(chunk2, state, 1, 1, 1_000_000, 1_000_900);
    expect(taps[0]!.t).toBe(0.1); // DOWN time, not UP
  });

  it('discards UP without coordinates', () => {
    const state = freshParseState();
    const chunk = '/dev/input/event3: EV_KEY       BTN_TOUCH            UP';
    expect(processGetEventChunk(chunk, state, 1, 1, 0, 1)).toEqual([]);
  });

  it('ignores unrelated EV_REL / EV_SYN events', () => {
    const state = freshParseState();
    const chunk = [
      '/dev/input/event3: EV_SYN       SYN_REPORT           00000000',
      '/dev/input/event5: EV_REL       REL_WHEEL            00000001',
    ].join('\n');
    expect(processGetEventChunk(chunk, state, 1, 1, 0, 1)).toEqual([]);
  });

  it('emits multiple taps in one chunk', () => {
    const state = freshParseState();
    const chunk = [
      '/dev/input/event3: EV_KEY       BTN_TOUCH            DOWN',
      '/dev/input/event3: EV_ABS       ABS_MT_POSITION_X    00000064',
      '/dev/input/event3: EV_ABS       ABS_MT_POSITION_Y    00000064',
      '/dev/input/event3: EV_KEY       BTN_TOUCH            UP',
      '/dev/input/event3: EV_KEY       BTN_TOUCH            DOWN',
      '/dev/input/event3: EV_ABS       ABS_MT_POSITION_X    000000c8',
      '/dev/input/event3: EV_ABS       ABS_MT_POSITION_Y    000000c8',
      '/dev/input/event3: EV_KEY       BTN_TOUCH            UP',
    ].join('\n');
    const taps = processGetEventChunk(chunk, state, 1, 1, 0, 100);
    expect(taps).toHaveLength(2);
    expect(taps[0]!.x).toBe(100);
    expect(taps[1]!.x).toBe(200);
  });
});
