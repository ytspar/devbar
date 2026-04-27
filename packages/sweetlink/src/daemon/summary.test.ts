// @vitest-environment node

/**
 * Summary Report Generator Tests
 *
 * Tests the SUMMARY.md markdown report generation from session data.
 */

import { describe, expect, it } from 'vitest';
import type { ConsoleEntry, NetworkEntry } from './listeners.js';
import type { SessionManifest } from './session.js';
import { generateSummary, type SummaryOptions } from './summary.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeManifest(overrides?: Partial<SessionManifest>): SessionManifest {
  return {
    sessionId: 'test-session-001',
    url: 'http://localhost:3000',
    startedAt: '2025-01-15T10:30:00.000Z',
    endedAt: '2025-01-15T10:31:00.000Z',
    duration: 60,
    commands: [],
    screenshots: [],
    errors: { console: 0, network: 0, server: 0 },
    ...overrides,
  };
}

function makeOptions(overrides?: Partial<SummaryOptions>): SummaryOptions {
  return {
    manifest: makeManifest(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('generateSummary', () => {
  describe('basic structure', () => {
    it('generates valid markdown with all sections', () => {
      const result = generateSummary(makeOptions());
      expect(result).toContain('# Session Report');
      expect(result).toContain('## Status');
      expect(result).toContain('## Action Timeline');
      expect(result).toContain('## Console Errors');
      expect(result).toContain('## Screenshots');
    });

    it('ends with a newline', () => {
      const result = generateSummary(makeOptions());
      expect(result.endsWith('\n')).toBe(true);
    });
  });

  describe('metadata section', () => {
    it('includes session ID', () => {
      const result = generateSummary(makeOptions());
      expect(result).toContain('**Session:** test-session-001');
    });

    it('includes formatted date', () => {
      const result = generateSummary(makeOptions());
      // The exact format depends on the local timezone, but it should contain the date
      expect(result).toContain('**Date:**');
    });

    it('includes duration', () => {
      const result = generateSummary(makeOptions());
      expect(result).toContain('**Duration:** 60.0s');
    });

    it('includes URL when provided', () => {
      const result = generateSummary(makeOptions());
      expect(result).toContain('**URL:** http://localhost:3000');
    });

    it('omits URL when not provided', () => {
      const manifest = makeManifest({ url: undefined });
      const result = generateSummary(makeOptions({ manifest }));
      expect(result).not.toContain('**URL:**');
    });
  });

  describe('git metadata', () => {
    it('includes git branch when provided', () => {
      const result = generateSummary(makeOptions({ gitBranch: 'feature/login' }));
      expect(result).toContain('**Git:** feature/login');
    });

    it('includes git commit (truncated to 7 chars) when provided', () => {
      const result = generateSummary(
        makeOptions({
          gitBranch: 'main',
          gitCommit: 'abc1234def5678',
        })
      );
      expect(result).toContain('**Git:** main @ abc1234');
    });

    it('shows unknown branch when only commit is provided', () => {
      const result = generateSummary(makeOptions({ gitCommit: 'abc1234def5678' }));
      expect(result).toContain('**Git:** unknown @ abc1234');
    });

    it('shows "(not in a repository)" when neither branch nor commit provided', () => {
      const result = generateSummary(makeOptions());
      expect(result).toContain('**Git:** (not in a repository)');
    });
  });

  describe('status section', () => {
    it('shows clean status when no errors', () => {
      const result = generateSummary(makeOptions({ consoleEntries: [], networkEntries: [] }));
      expect(result).toContain('0 | ✅ Clean');
    });

    it('shows error count for console errors', () => {
      const consoleEntries: ConsoleEntry[] = [
        { timestamp: 1, level: 'error', message: 'fail 1' },
        { timestamp: 2, level: 'error', message: 'fail 2' },
        { timestamp: 3, level: 'info', message: 'ok' },
      ];
      const result = generateSummary(makeOptions({ consoleEntries }));
      expect(result).toContain('| Console Errors | 2 | ❌ |');
    });

    it('shows warning count for console warnings', () => {
      const consoleEntries: ConsoleEntry[] = [
        { timestamp: 1, level: 'warning', message: 'warn 1' },
        { timestamp: 2, level: 'warning', message: 'warn 2' },
      ];
      const result = generateSummary(makeOptions({ consoleEntries }));
      expect(result).toContain('| Console Warnings | 2 | ⚠️ |');
    });

    it('shows failed request count', () => {
      const networkEntries: NetworkEntry[] = [
        { timestamp: 1, method: 'GET', url: '/api', status: 500, duration: 100 },
        { timestamp: 2, method: 'GET', url: '/ok', status: 200, duration: 50 },
        { timestamp: 3, method: 'POST', url: '/fail', status: 0, duration: 0 },
      ];
      const result = generateSummary(makeOptions({ networkEntries }));
      expect(result).toContain('| Failed Requests | 2 | ❌ |');
    });

    it('shows server error count', () => {
      const serverErrors = [{ source: 'server' as const, message: 'panic', timestamp: 1 }];
      const result = generateSummary(makeOptions({ serverErrors }));
      expect(result).toContain('| Server Errors | 1 | ❌ |');
    });
  });

  describe('action timeline', () => {
    it('shows "No actions recorded" when commands list is empty', () => {
      const result = generateSummary(makeOptions());
      expect(result).toContain('No actions recorded.');
    });

    it('lists actions in a table', () => {
      const manifest = makeManifest({
        commands: [
          // CLI flag form (CSS selector) — should be unwrapped from --selector=...
          { timestamp: 1.5, action: 'click', args: ['--selector=#button'], duration: 50 },
          // Ref-based fill — should render as "@e2 ← \"hello\""
          {
            timestamp: 3.2,
            action: 'fill',
            args: ['@e2', 'hello'],
            duration: 100,
            screenshot: 'action-1.png',
          },
        ],
      });
      const result = generateSummary(makeOptions({ manifest }));
      expect(result).toContain('| Time | Action | Target | Took | Screenshot |');
      expect(result).toContain('| 1.5s | click | #button | 50ms | — |');
      expect(result).toContain(
        '| 3.2s | fill | @e2 ← "hello" | 100ms | [`action-1.png`](action-1.png) |'
      );
    });
  });

  describe('console errors section', () => {
    it('shows "No console errors detected" when no errors', () => {
      const result = generateSummary(makeOptions({ consoleEntries: [] }));
      expect(result).toContain('No console errors detected.');
    });

    it('lists console errors as bullets', () => {
      const consoleEntries: ConsoleEntry[] = [
        { timestamp: 1, level: 'error', message: 'Uncaught TypeError' },
        { timestamp: 2, level: 'info', message: 'ok message' },
        { timestamp: 3, level: 'error', message: 'Network error', location: 'app.js:42' },
      ];
      const result = generateSummary(makeOptions({ consoleEntries }));
      expect(result).toContain('- Uncaught TypeError');
      expect(result).toContain('- Network error (app.js:42)');
      expect(result).not.toContain('ok message');
    });

    it('escapes pipe characters in error messages', () => {
      const consoleEntries: ConsoleEntry[] = [
        { timestamp: 1, level: 'error', message: 'value | other' },
      ];
      const result = generateSummary(makeOptions({ consoleEntries }));
      expect(result).toContain('value \\| other');
    });
  });

  describe('screenshots section', () => {
    it('shows "No screenshots captured" when list is empty', () => {
      const result = generateSummary(makeOptions());
      expect(result).toContain('No screenshots captured.');
    });

    it('lists screenshots with timestamps when matching action exists', () => {
      const manifest = makeManifest({
        screenshots: ['screenshot-001.png'],
        commands: [
          {
            timestamp: 5.0,
            action: 'screenshot',
            args: ['homepage'],
            duration: 200,
            screenshot: 'screenshot-001.png',
          },
        ],
      });
      const result = generateSummary(makeOptions({ manifest }));
      expect(result).toContain('`screenshot-001.png`');
      expect(result).toContain('screenshot homepage (5.0s)');
    });

    it('lists screenshots without details when no matching action', () => {
      const manifest = makeManifest({
        screenshots: ['orphan.png'],
      });
      const result = generateSummary(makeOptions({ manifest }));
      expect(result).toContain('- `orphan.png`');
    });
  });

  describe('video section', () => {
    it('omits video section when no video', () => {
      const result = generateSummary(makeOptions());
      expect(result).not.toContain('## Video');
    });

    it('shows video info when present', () => {
      const manifest = makeManifest({ video: 'recording.webm', duration: 45 });
      const result = generateSummary(makeOptions({ manifest }));
      expect(result).toContain('## Video');
      expect(result).toContain('`recording.webm`');
      expect(result).toContain('45.0s');
      expect(result).toContain('viewer.html');
    });
  });

  describe('empty manifest', () => {
    it('handles manifest with no actions, no screenshots, no video', () => {
      const manifest = makeManifest({
        commands: [],
        screenshots: [],
        video: undefined,
      });
      const result = generateSummary(makeOptions({ manifest }));
      expect(result).toContain('No actions recorded.');
      expect(result).toContain('No screenshots captured.');
      expect(result).toContain('No console errors detected.');
      expect(result).not.toContain('## Video');
    });
  });
});
