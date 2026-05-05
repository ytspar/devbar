// @vitest-environment node

/**
 * Session Manifest Type Tests
 *
 * session.ts is pure types but it's the wire-format contract between the
 * daemon (producer) and the CLI / viewer / sessions-diff (consumers).
 * Drift here silently corrupts every recording artifact.
 *
 * We verify the type shapes compile-time and runtime:
 *  - RecordedAction is exactly the documented 7-element union (so a typo
 *    in `daemon/server.ts` for a new action becomes a compile error
 *    rather than a manifest-only string).
 *  - ActionEntry / SessionManifest accept a realistic record and reject
 *    impossible ones (e.g. action: 'foo').
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ActionEntry, RecordedAction, SessionManifest } from './session.js';

describe('RecordedAction', () => {
  it('is the closed union of the 7 action verbs the daemon emits', () => {
    expectTypeOf<RecordedAction>().toEqualTypeOf<
      'screenshot' | 'snapshot' | 'click' | 'fill' | 'press' | 'hover' | 'navigate'
    >();
  });
});

describe('ActionEntry', () => {
  it('accepts a complete entry shape', () => {
    const entry: ActionEntry = {
      timestamp: 1.25,
      action: 'click',
      args: ['@e2'],
      duration: 12,
      boundingBox: { x: 10, y: 20, width: 100, height: 30 },
      screenshot: 'action-0.png',
    };
    expect(entry.action).toBe('click');
  });

  it('treats boundingBox and screenshot as optional', () => {
    const minimal: ActionEntry = {
      timestamp: 0,
      action: 'press',
      args: ['Enter'],
      duration: 5,
    };
    expect(minimal.boundingBox).toBeUndefined();
  });

  it('rejects unknown action names at compile time', () => {
    // @ts-expect-error: 'foo' is not in RecordedAction
    const bad: ActionEntry = { timestamp: 0, action: 'foo', args: [], duration: 0 };
    expect(bad).toBeDefined();
  });
});

describe('SessionManifest', () => {
  it('round-trips through JSON.stringify/parse', () => {
    const manifest: SessionManifest = {
      sessionId: 'session-2026-01-01T00-00-00',
      label: 'login flow',
      url: 'http://localhost:3000/',
      gitBranch: 'main',
      gitCommit: 'abc1234',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:00:30.000Z',
      duration: 30,
      commands: [{ timestamp: 1, action: 'click', args: ['@e2'], duration: 5 }],
      screenshots: ['action-0.png'],
      video: 'session.webm',
      errors: { console: 0, network: 0, server: 0 },
    };

    const round = JSON.parse(JSON.stringify(manifest)) as SessionManifest;
    expect(round.sessionId).toBe(manifest.sessionId);
    expect(round.commands[0]!.action).toBe('click');
    expect(round.errors.network).toBe(0);
  });

  it('treats label/url/gitBranch/gitCommit/video as optional', () => {
    const m: SessionManifest = {
      sessionId: 's',
      startedAt: 'a',
      endedAt: 'b',
      duration: 0,
      commands: [],
      screenshots: [],
      errors: { console: 0, network: 0, server: 0 },
    };
    expect(m.label).toBeUndefined();
    expect(m.video).toBeUndefined();
  });
});
